"""
Per-key enforcement: storage quotas, rate limits, and new-key rate limits.

All functions return (ok: bool, error_message: str | None).
Routes call these before processing writes/reads.
"""

import time

from sqlalchemy import func

from models import db, Identity, Chart, ChartAccess, RequestLog
import config


def check_new_key_limits(user_id, ip_hash):
    """Enforce limits when creating a new Identity.

    - Global cap: max NEW_KEY_RATE_LIMIT_PER_HOUR new keys per hour
    - Per-IP cap: max NEW_KEYS_PER_IP_PER_HOUR distinct new user_ids from one IP per hour
    """
    one_hour_ago = int(time.time()) - 3600

    # Global new-key rate
    global_count = Identity.query.filter(Identity.created_at > one_hour_ago).count()
    if global_count >= config.NEW_KEY_RATE_LIMIT_PER_HOUR:
        return False, 'Too many new registrations; try again later'

    # Per-IP new-key rate: count distinct user_ids first seen from this ip_hash in the last hour.
    # A new Identity means a new row in request_logs with a user_id not seen before that hour.
    # We approximate by counting distinct user_ids in request_logs from this IP in the window
    # that also have an Identity.created_at in the window.
    ip_new_keys = (
        db.session.query(func.count(func.distinct(RequestLog.user_id)))
        .join(Identity, RequestLog.user_id == Identity.user_id)
        .filter(
            RequestLog.ip_hash == ip_hash,
            Identity.created_at > one_hour_ago,
        )
        .scalar()
    )
    if ip_new_keys >= config.NEW_KEYS_PER_IP_PER_HOUR:
        return False, 'Too many new keys from this network; try again later'

    return True, None


def check_write_quotas(user_id):
    """Enforce per-key storage quota and chart count limit before uploads.

    - Storage: min(age_days * PER_KEY_STORAGE_RATE_BYTES, PER_KEY_STORAGE_LIMIT_BYTES)
    - Chart count: PER_KEY_CHART_LIMIT
    """
    identity = db.session.get(Identity, user_id)
    if not identity:
        return False, 'Unknown identity'

    age_seconds = int(time.time()) - identity.created_at
    age_days = max(age_seconds / 86400, 1)  # at least 1 day so brand-new keys get the first day's budget
    effective_limit = min(
        int(age_days * config.PER_KEY_STORAGE_RATE_BYTES),
        config.PER_KEY_STORAGE_LIMIT_BYTES,
    )

    # Total storage used by this user
    total_bytes = (
        db.session.query(func.coalesce(func.sum(func.length(Chart.data)), 0))
        .join(ChartAccess, Chart.chart_uuid == ChartAccess.chart_uuid)
        .filter(ChartAccess.user_id == user_id)
        .scalar()
    )
    if total_bytes >= effective_limit:
        return False, 'Storage quota exceeded'

    # Chart count
    chart_count = ChartAccess.query.filter_by(user_id=user_id).count()
    if chart_count >= config.PER_KEY_CHART_LIMIT:
        return False, 'Chart limit exceeded'

    return True, None


def check_key_rate(user_id, is_write):
    """Enforce per-key request rate limit (writes or reads per minute).

    Counts recent RequestLog entries for this user_id.
    """
    one_minute_ago = int(time.time()) - 60

    count = RequestLog.query.filter(
        RequestLog.user_id == user_id,
        RequestLog.timestamp > one_minute_ago,
    ).count()

    limit = config.PER_KEY_WRITE_LIMIT_PER_MINUTE if is_write else config.PER_KEY_READ_LIMIT_PER_MINUTE
    if count >= limit:
        return False, 'Per-key rate limit exceeded'

    return True, None
