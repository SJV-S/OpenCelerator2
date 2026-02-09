import time
from flask import Flask, render_template, request, jsonify, redirect, url_for, send_from_directory, make_response
from flask_socketio import SocketIO, join_room, leave_room

from models import db, Chart, ChartAccess, ChartTombstone, ShareLink, init_db
from telemetry import log_request
import config

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins=config.CORS_ALLOWED_ORIGINS)

app.config['SQLALCHEMY_DATABASE_URI'] = config.DATABASE_URL
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = config.SQLALCHEMY_TRACK_MODIFICATIONS

# Initialize database
init_db(app)

# Telemetry — log every request
app.after_request(log_request)


# =============================================================================
# Service Worker (must be served from root for full scope)
# =============================================================================

@app.route('/service-worker.js')
def service_worker():
    response = make_response(send_from_directory(app.root_path, 'service-worker.js'))
    for header, value in config.SW_CACHE_HEADERS.items():
        response.headers[header] = value
    return response

# =============================================================================
# HTML Routes (existing)
# =============================================================================

@app.route('/')
def index():
    return render_template('SCC/menu_page.html')


@app.route('/new')
def new_chart():
    return render_template('SCC/new_chart.html')


@app.route('/chart/<chart_id>')
@app.route('/chart/<chart_id>/<share_secret>')
def chart(chart_id, share_secret=None):
    return render_template('SCC/chart.html', chart_id=chart_id)


# =============================================================================
# Storage Purge - evict oldest charts when over config.STORAGE_LIMIT_BYTES
# =============================================================================

_last_purge = 0
_last_tombstone_purge = 0

config.TOMBSTONE_RETENTION_SECONDS = 365 * 24 * 3600  # 1 year

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
        app.logger.info(f'[Purge] Removed {deleted} tombstones older than 1 year')

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
        app.logger.info(f'[Purge] Evicted {purged} oldest charts to stay under storage limit')


# =============================================================================
# API Routes - Sync
# =============================================================================

@app.route('/api/sync', methods=['POST'])
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
    last_sync_at = data.get('last_sync_at', 0)
    local_manifest = {item['chart_uuid']: item['updated_at'] for item in data.get('local_manifest', [])}
    uploads = data.get('uploads', [])

    # Process uploads - store new/updated charts
    for upload in uploads:
        chart_uuid = upload['chart_uuid']
        chart_data = bytes.fromhex(upload['data']) if isinstance(upload['data'], str) else upload['data']
        wrapped_key = bytes.fromhex(upload['wrapped_key']) if isinstance(upload['wrapped_key'], str) else upload['wrapped_key']
        updated_at = upload['updated_at']

        # Check if chart exists
        existing = db.session.get(Chart, chart_uuid)

        if existing:
            # Update if newer
            if updated_at > existing.last_modified:
                existing.data = chart_data
                existing.last_modified = updated_at
        else:
            # Create new chart
            new_chart = Chart(
                chart_uuid=chart_uuid,
                data=chart_data,
                last_modified=updated_at
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
                'data': chart.data.hex(),
                'updated_at': chart.last_modified,
                'wrapped_key': access.wrapped_key.hex()
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


@app.route('/api/chart', methods=['DELETE'])
def delete_chart():
    """Owner deletes chart entirely"""
    data = request.get_json()
    chart_uuid = data.get('chart_uuid')
    user_id = data.get('user_id')

    if not chart_uuid or not user_id:
        return jsonify({'error': 'chart_uuid and user_id required'}), 400

    access = db.session.get(ChartAccess, (chart_uuid, user_id))
    if not access:
        return jsonify({'error': 'Not authorized'}), 403

    # Delete chart (cascades to chart_access and share_links)
    chart = db.session.get(Chart, chart_uuid)
    if chart:
        db.session.delete(chart)

        # Create tombstone
        tombstone = ChartTombstone(
            chart_uuid=chart_uuid,
            deleted_at=int(time.time())
        )
        db.session.add(tombstone)
        db.session.commit()

    return jsonify({'success': True})


@app.route('/api/chart/leave', methods=['DELETE'])
def leave_chart():
    """Collaborator removes their own access"""
    data = request.get_json()
    chart_uuid = data.get('chart_uuid')
    user_id = data.get('user_id')

    if not chart_uuid or not user_id:
        return jsonify({'error': 'chart_uuid and user_id required'}), 400

    access = db.session.get(ChartAccess, (chart_uuid, user_id))
    if access:
        db.session.delete(access)
        db.session.commit()

    return jsonify({'success': True})


# =============================================================================
# API Routes - Share Links
# =============================================================================


@app.route('/api/share/edit', methods=['POST'])
def create_edit_link():
    """
    Store chart with wrapped key for sharing.
    Client generates the share_secret and wraps the key.
    """
    data = request.get_json()
    chart_uuid = data.get('chart_uuid')
    user_id = data.get('user_id')
    encrypted_data = data.get('data')
    wrapped_key = data.get('wrapped_key')
    wrapped_key_for_share = data.get('wrapped_key_for_share')
    last_modified = data.get('last_modified')

    if not all([chart_uuid, user_id, encrypted_data, wrapped_key, wrapped_key_for_share, last_modified]):
        return jsonify({'error': 'Missing required fields'}), 400

    chart_data = bytes.fromhex(encrypted_data)
    wrapped_key_bytes = bytes.fromhex(wrapped_key)
    wrapped_share_bytes = bytes.fromhex(wrapped_key_for_share)

    # Store/update chart
    chart = db.session.get(Chart, chart_uuid)
    if chart:
        chart.data = chart_data
        chart.last_modified = last_modified
    else:
        chart = Chart(chart_uuid=chart_uuid, data=chart_data, last_modified=last_modified)
        db.session.add(chart)

    # Store owner access
    access = db.session.get(ChartAccess, (chart_uuid, user_id))
    if not access:
        access = ChartAccess(chart_uuid=chart_uuid, user_id=user_id, wrapped_key=wrapped_key_bytes)
        db.session.add(access)

    # Store share link wrapped key
    share_link = db.session.get(ShareLink, chart_uuid)
    if share_link:
        share_link.wrapped_key = wrapped_share_bytes
    else:
        share_link = ShareLink(chart_uuid=chart_uuid, wrapped_key=wrapped_share_bytes)
        db.session.add(share_link)

    db.session.commit()
    return jsonify({'success': True})


@app.route('/api/chart/<chart_uuid>/poll')
def poll_chart(chart_uuid):
    """Lightweight check if chart has been updated"""
    last_known = request.args.get('t', 0, type=int)
    chart = db.session.get(Chart, chart_uuid)
    if not chart:
        return jsonify({'error': 'Not found'}), 404
    return jsonify({
        'changed': chart.last_modified > last_known,
        'updated_at': chart.last_modified
    })


@app.route('/api/chart/<chart_uuid>/shared')
def get_shared_chart(chart_uuid):
    """Get chart data and wrapped key for share link"""
    chart = db.session.get(Chart, chart_uuid)
    if not chart:
        return jsonify({'error': 'Chart not found'}), 404

    share_link = db.session.get(ShareLink, chart_uuid)
    if not share_link:
        return jsonify({'error': 'No share link'}), 404

    return jsonify({
        'chart_uuid': chart_uuid,
        'data': chart.data.hex(),
        'wrapped_key': share_link.wrapped_key.hex(),
        'updated_at': chart.last_modified
    })


# =============================================================================
# WebSocket Events - Shared Chart Notifications
# =============================================================================

@socketio.on('join_chart')
def handle_join_chart(data):
    """Client subscribes to updates for a specific chart"""
    chart_uuid = data.get('chart_uuid')
    if chart_uuid:
        join_room(f'chart:{chart_uuid}')


@socketio.on('leave_chart')
def handle_leave_chart(data):
    """Client unsubscribes from chart updates"""
    chart_uuid = data.get('chart_uuid')
    if chart_uuid:
        leave_room(f'chart:{chart_uuid}')


if __name__ == '__main__':
    socketio.run(app, debug=True, host=config.DEV_HOST, port=config.DEV_PORT, allow_unsafe_werkzeug=True)