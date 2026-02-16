"""
Account sharing detection — blocks users with too many unique IPs in a rolling window.

Registered as a before_request hook. On every authenticated API request, queries
RequestLog for the user's unique IP count. Returns 403 if the threshold is exceeded.
"""

import time

from flask import request, jsonify
from models import db, RequestLog, SharingViolation
import config

# Routes exempt from sharing detection (HTML pages, health, static assets)
_EXEMPT_PREFIXES = (
    '/static/',
    '/chart/',
    '/sync/',
    '/api/account-link/',
)

_EXEMPT_EXACT = frozenset((
    '/',
    '/welcome',
    '/new',
    '/api/health',
    '/service-worker.js',
))


def _extract_user_id():
    """Extract user_id from JSON body or X-User-Id header."""
    if request.is_json:
        body = request.get_json(silent=True)
        if body and isinstance(body, dict) and body.get('user_id'):
            return body['user_id']
    return request.headers.get('X-User-Id')


def check_sharing():
    """before_request handler — reject users exceeding sharing thresholds."""
    path = request.path

    # Skip exempt routes
    if path in _EXEMPT_EXACT:
        return None
    for prefix in _EXEMPT_PREFIXES:
        if path.startswith(prefix):
            return None

    user_id = _extract_user_id()
    if not user_id:
        return jsonify({'error': 'user_id required'}), 403

    cutoff = int(time.time()) - (config.SHARING_WINDOW_HOURS * 3600)

    row = db.session.execute(
        db.text(
            'SELECT COUNT(DISTINCT ip_hash) AS unique_ips '
            'FROM request_logs '
            'WHERE user_id = :uid AND timestamp >= :cutoff'
        ),
        {'uid': user_id, 'cutoff': cutoff}
    ).one()

    if row.unique_ips > config.SHARING_IP_THRESHOLD:
        try:
            db.session.add(SharingViolation(
                user_id=user_id,
                unique_ips=row.unique_ips,
                timestamp=int(time.time()),
            ))
            db.session.commit()
        except Exception:
            db.session.rollback()
        return jsonify({'error': 'account_sharing_detected'}), 403

    return None
