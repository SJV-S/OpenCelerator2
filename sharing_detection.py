"""
Account sharing detection — blocks users whose 30-day activity exceeds thresholds.

Registered as a before_request hook. On every authenticated API request, queries
RequestLog for the user's unique IP count and total request count. Returns 403
if any threshold is exceeded.
"""

import time

from flask import request, jsonify
from models import db, RequestLog
import config

# Routes exempt from sharing detection (HTML pages, health, static assets)
_EXEMPT_PREFIXES = (
    '/static/',
    '/chart/',
    '/sync/',
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

    cutoff = int(time.time()) - (config.SHARING_WINDOW_DAYS * 86400)

    row = db.session.execute(
        db.text(
            'SELECT COUNT(DISTINCT ip_hash) AS unique_ips, COUNT(id) AS total_requests '
            'FROM request_logs '
            'WHERE user_id = :uid AND timestamp >= :cutoff'
        ),
        {'uid': user_id, 'cutoff': cutoff}
    ).one()

    unique_ips = row.unique_ips
    total_requests = row.total_requests

    if (unique_ips > config.EXTREME_IP_THRESHOLD
            or total_requests > config.EXTREME_REQUEST_THRESHOLD
            or (unique_ips > config.MODERATE_IP_THRESHOLD
                and total_requests > config.MODERATE_REQUEST_THRESHOLD)):
        return jsonify({'error': 'account_sharing_detected'}), 403

    return None
