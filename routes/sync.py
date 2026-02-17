import time

from flask import Blueprint, request, jsonify, current_app
from models import db, Chart, ChartAccess, ChartTombstone
from extensions import limiter, socketio
from routes.helpers import valid_user_id, valid_uuid, decode_blob, encode_blob, ensure_identity
from routes.key_limits import check_key_rate, check_write_quotas
from telemetry import _hash_ip
import config

sync_bp = Blueprint('sync', __name__)

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
    purge_old_tombstones()

    data = request.get_json()

    if not data or 'user_id' not in data:
        return jsonify({'error': 'user_id required'}), 400

    user_id = data['user_id']
    if not valid_user_id(user_id):
        return jsonify({'error': 'Invalid user_id'}), 400

    ip_hash = _hash_ip(request.remote_addr or '0.0.0.0')
    if not ensure_identity(user_id, data.get('public_key'), ip_hash):
        return jsonify({'error': 'public_key required and must match user_id'}), 403

    uploads = data.get('uploads', [])
    is_write = len(uploads) > 0

    # Per-key rate limit
    ok, msg = check_key_rate(user_id, is_write=is_write)
    if not ok:
        return jsonify({'error': msg}), 429

    # Per-key storage quota (only when uploading)
    if is_write:
        ok, msg = check_write_quotas(user_id)
        if not ok:
            return jsonify({'error': msg}), 403

    last_sync_at = data.get('last_sync_at', 0)
    local_manifest = {}
    for item in data.get('local_manifest', []):
        if valid_uuid(item.get('chart_uuid')):
            local_manifest[item['chart_uuid']] = item['updated_at']

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

    # Get tombstones since last sync (scoped to this user)
    tombstones = ChartTombstone.query.filter(
        ChartTombstone.user_id == user_id,
        ChartTombstone.deleted_at > last_sync_at
    ).all()

    return jsonify({
        'server_manifest': server_manifest,
        'downloads': downloads,
        'tombstones': [{'chart_uuid': t.chart_uuid, 'deleted_at': t.deleted_at} for t in tombstones]
    })



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
