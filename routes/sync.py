import time

from flask import Blueprint, request, jsonify, current_app
from models import db, Chart, ChartAccess, ChartTombstone, IPBan
from extensions import limiter, socketio
from routes.helpers import valid_user_id, valid_uuid, decode_blob, encode_blob, ensure_identity
import config

sync_bp = Blueprint('sync', __name__)

_last_purge = 0
_last_tombstone_purge = 0


def purge_old_tombstones():
    """Delete tombstones older than 1 year. Runs at most once per day."""
    global _last_tombstone_purge
    now = int(time.time())
    if now - _last_tombstone_purge < 86400:
        return
    _last_tombstone_purge = now

    cutoff = now - config.TOMBSTONE_RETENTION_SECONDS
    deleted = ChartTombstone.query.filter(ChartTombstone.deleted_at < cutoff).delete()
    if deleted:
        db.session.commit()
        current_app.logger.info(f'[Purge] Removed {deleted} tombstones older than 1 year')


def purge_if_over_limit():
    """Delete oldest charts until total storage is under config.STORAGE_LIMIT_BYTES. Runs at most once per hour."""
    global _last_purge
    now = int(time.time())
    if now - _last_purge < 3600:
        return
    _last_purge = now

    total = db.session.query(db.func.sum(db.func.length(Chart.data))).scalar() or 0
    if total <= config.STORAGE_LIMIT_BYTES:
        return

    # Fetch oldest charts first
    oldest = Chart.query.order_by(Chart.last_modified.asc()).all()
    purged = 0
    for chart in oldest:
        if total <= config.STORAGE_LIMIT_BYTES:
            break
        total -= len(chart.data)
        db.session.delete(chart)  # cascades to chart_access, share_links
        purged += 1

    if purged:
        db.session.commit()
        current_app.logger.info(f'[Purge] Evicted {purged} oldest charts to stay under storage limit')


@sync_bp.route('/api/sync', methods=['POST'])
@limiter.limit(config.RATELIMIT_API_WRITE)
def sync():
    """
    Main sync endpoint - handles upload/download of encrypted charts.

    Request:
    {
        "user_id": "sha256hex...",
        "last_sync_at": 1706100000,  // Unix timestamp, optional
        "local_manifest": [{"chart_uuid": "...", "updated_at": ...}, ...],
        "uploads": [{"chart_uuid": "...", "data": "base64...", "updated_at": ..., "wrapped_key": "base64..."}, ...]
    }

    Response:
    {
        "server_manifest": [{"chart_uuid": "...", "updated_at": ...}, ...],
        "downloads": [{"chart_uuid": "...", "data": "base64...", "updated_at": ..., "wrapped_key": "base64..."}, ...],
        "tombstones": [{"chart_uuid": "...", "deleted_at": ...}, ...]
    }
    """
    purge_if_over_limit()
    purge_old_tombstones()

    data = request.get_json()

    if not data or 'user_id' not in data:
        return jsonify({'error': 'user_id required'}), 400

    user_id = data['user_id']
    if not valid_user_id(user_id):
        return jsonify({'error': 'Invalid user_id'}), 400

    ensure_identity(user_id, data.get('public_key'))
    last_sync_at = data.get('last_sync_at', 0)
    local_manifest = {}
    for item in data.get('local_manifest', []):
        if valid_uuid(item.get('chart_uuid')):
            local_manifest[item['chart_uuid']] = item['updated_at']
    uploads = data.get('uploads', [])

    # Process uploads - store new/updated charts
    for upload in uploads:
        chart_uuid = upload.get('chart_uuid')
        if not valid_uuid(chart_uuid):
            continue
        chart_data = decode_blob(upload['data'])
        wrapped_key = decode_blob(upload['wrapped_key'])
        updated_at = min(upload['updated_at'], int(time.time()) + 300)
        signature = decode_blob(upload['signature']) if upload.get('signature') else None

        # Check if chart exists
        existing = db.session.get(Chart, chart_uuid)

        if existing:
            # Update if newer
            if updated_at > existing.last_modified:
                existing.data = chart_data
                existing.last_modified = updated_at
                existing.signature = signature
        else:
            # Create new chart
            new_chart = Chart(
                chart_uuid=chart_uuid,
                data=chart_data,
                last_modified=updated_at,
                signature=signature
            )
            db.session.add(new_chart)

        # Ensure user has access entry
        access = db.session.get(ChartAccess, (chart_uuid, user_id))
        if not access:
            access = ChartAccess(
                chart_uuid=chart_uuid,
                user_id=user_id,
                wrapped_key=wrapped_key
            )
            db.session.add(access)
        else:
            # Update wrapped key if provided
            access.wrapped_key = wrapped_key

    db.session.commit()

    # Notify other viewers of updated charts via WebSocket
    for upload in uploads:
        socketio.emit('chart_updated', {
            'chart_uuid': upload['chart_uuid'],
            'updated_at': upload['updated_at']
        }, room=f'chart:{upload["chart_uuid"]}')

    # Build server manifest - all charts user has access to
    user_charts = db.session.query(Chart, ChartAccess).join(
        ChartAccess, Chart.chart_uuid == ChartAccess.chart_uuid
    ).filter(ChartAccess.user_id == user_id).all()

    server_manifest = []
    downloads = []

    for chart, access in user_charts:
        server_manifest.append({
            'chart_uuid': chart.chart_uuid,
            'updated_at': chart.last_modified
        })

        # Include in downloads if server has newer version
        local_updated = local_manifest.get(chart.chart_uuid, 0)
        if chart.last_modified > local_updated:
            downloads.append({
                'chart_uuid': chart.chart_uuid,
                'data': encode_blob(chart.data),
                'updated_at': chart.last_modified,
                'wrapped_key': encode_blob(access.wrapped_key),
                'signature': encode_blob(chart.signature) if chart.signature else None
            })

    # Get tombstones since last sync
    tombstones = ChartTombstone.query.filter(
        ChartTombstone.deleted_at > last_sync_at
    ).all()

    return jsonify({
        'server_manifest': server_manifest,
        'downloads': downloads,
        'tombstones': [{'chart_uuid': t.chart_uuid, 'deleted_at': t.deleted_at} for t in tombstones]
    })


@sync_bp.route('/api/report-bad-push', methods=['POST'])
@limiter.limit(config.RATELIMIT_REPORT)
def report_bad_push():
    """Client reports a failed signature verification on a pulled chart."""
    data = request.get_json()
    if not data:
        return jsonify({'error': 'JSON body required'}), 400

    chart_uuid = data.get('chart_uuid')
    reporter_user_id = data.get('user_id')
    reason = data.get('reason', '')

    if not valid_uuid(chart_uuid) or not valid_user_id(reporter_user_id):
        return jsonify({'error': 'Invalid format'}), 400

    # Look up the most recent upload of this chart in request_logs
    row = db.session.execute(
        db.text(
            'SELECT ip_hash, user_id FROM request_logs '
            'WHERE chart_uuid = :uuid AND method = :method AND user_id IS NOT NULL '
            'ORDER BY timestamp DESC LIMIT 1'
        ),
        {'uuid': chart_uuid, 'method': 'POST'}
    ).first()

    if not row:
        return jsonify({'error': 'No upload found for this chart'}), 404

    uploader_ip_hash = row.ip_hash
    uploader_user_id = row.user_id

    # Reject self-reports
    if uploader_user_id == reporter_user_id:
        return jsonify({'error': 'Cannot report yourself'}), 400

    now = int(time.time())

    # Upsert tier 1 ban: (uploader_ip_hash, uploader_user_id)
    ban = db.session.get(IPBan, (uploader_ip_hash, uploader_user_id))
    if ban:
        ban.strikes += 1
        if ban.strikes >= config.BAN_PERMANENT_STRIKES:
            ban.banned_until = None  # Permanent
        else:
            ban.banned_until = now + config.BAN_DURATION_SECONDS
    else:
        ban = IPBan(
            ip_hash=uploader_ip_hash,
            user_id=uploader_user_id,
            strikes=1,
            banned_until=now + config.BAN_DURATION_SECONDS,
            created_at=now,
        )
        db.session.add(ban)

    # Check tier 2 escalation: count distinct permanently-banned user_ids for this IP
    perma_count = db.session.execute(
        db.text(
            'SELECT COUNT(*) FROM ip_bans '
            'WHERE ip_hash = :ip AND user_id != :wildcard AND banned_until IS NULL'
        ),
        {'ip': uploader_ip_hash, 'wildcard': '*'}
    ).scalar()

    if perma_count >= config.BAN_TIER2_THRESHOLD:
        tier2 = db.session.get(IPBan, (uploader_ip_hash, '*'))
        if not tier2:
            db.session.add(IPBan(
                ip_hash=uploader_ip_hash,
                user_id='*',
                strikes=0,
                banned_until=None,  # Permanent
                created_at=now,
            ))

    # Delete the bad chart blob
    bad_chart = db.session.get(Chart, chart_uuid)
    if bad_chart:
        db.session.delete(bad_chart)

    db.session.commit()

    current_app.logger.info(
        f'[BadPush] Report from {reporter_user_id[:8]}… — '
        f'banned {uploader_user_id[:8]}…@{uploader_ip_hash[:8]}… '
        f'(strike {ban.strikes}, reason: {reason})'
    )

    return jsonify({'success': True})


@sync_bp.route('/api/chart/<chart_uuid>/poll')
@limiter.limit(config.RATELIMIT_POLL)
def poll_chart(chart_uuid):
    """Lightweight check if chart has been updated"""
    if not valid_uuid(chart_uuid):
        return jsonify({'error': 'Invalid format'}), 400
    last_known = request.args.get('t', 0, type=int)
    chart = db.session.get(Chart, chart_uuid)
    if not chart:
        return jsonify({'error': 'Not found'}), 404
    return jsonify({
        'changed': chart.last_modified > last_known,
        'updated_at': chart.last_modified
    })
