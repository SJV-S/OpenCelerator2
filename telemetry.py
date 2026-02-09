"""
Request telemetry — logs hashed IP, route, and available identifiers.
Raw IPs are never stored; they are HMAC-SHA256 hashed before writing.
"""

import hmac
import hashlib
import time
import re

from flask import request
from models import db, RequestLog
import config

_UUID_RE = re.compile(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', re.I)


def _hash_ip(ip):
    return hmac.new(
        config.IP_HASH_SECRET.encode(),
        ip.encode(),
        hashlib.sha256,
    ).hexdigest()


def _extract_chart_uuid():
    """Try URL path first, then JSON body."""
    match = _UUID_RE.search(request.path)
    if match:
        return match.group(0)
    if request.is_json:
        body = request.get_json(silent=True)
        if body and isinstance(body, dict):
            return body.get('chart_uuid')
    return None


def _extract_user_id():
    if request.is_json:
        body = request.get_json(silent=True)
        if body and isinstance(body, dict):
            return body.get('user_id')
    return None


def log_request(response):
    """after_request handler — logs one row per request, returns response unchanged."""
    try:
        entry = RequestLog(
            timestamp=int(time.time()),
            ip_hash=_hash_ip(request.remote_addr or '0.0.0.0'),
            method=request.method,
            path=request.path[:256],
            status=response.status_code,
            user_id=_extract_user_id(),
            chart_uuid=_extract_chart_uuid(),
        )
        db.session.add(entry)
        db.session.commit()
    except Exception:
        db.session.rollback()
    return response
