import os
import time
import secrets
from flask import Flask, render_template, request, jsonify, redirect, url_for, send_from_directory, make_response

from models import db, Chart, ChartAccess, ViewToken, ChartTombstone, init_db

app = Flask(__name__)

# Database configuration - supports SQLite (default) and PostgreSQL
# Set DATABASE_URL env var for PostgreSQL, e.g.: postgresql://user:pass@localhost/scc
database_url = os.environ.get('DATABASE_URL', 'sqlite:///scc_charts.db')

# Handle Heroku-style postgres:// URLs (need postgresql://)
if database_url.startswith('postgres://'):
    database_url = database_url.replace('postgres://', 'postgresql://', 1)

app.config['SQLALCHEMY_DATABASE_URI'] = database_url
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Initialize database
init_db(app)


# =============================================================================
# Service Worker (must be served from root for full scope)
# =============================================================================

@app.route('/service-worker.js')
def service_worker():
    response = make_response(send_from_directory(app.root_path, 'service-worker.js'))
    # Prevent browser from caching the SW file - always check for updates
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
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
        role = upload.get('role', 'owner')

        # Check if chart exists
        existing = Chart.query.get(chart_uuid)

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
        access = ChartAccess.query.get((chart_uuid, user_id))
        if not access:
            access = ChartAccess(
                chart_uuid=chart_uuid,
                user_id=user_id,
                wrapped_key=wrapped_key,
                role=role
            )
            db.session.add(access)
        else:
            # Update wrapped key if provided
            access.wrapped_key = wrapped_key

    db.session.commit()

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
                'wrapped_key': access.wrapped_key.hex(),
                'role': access.role
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

    # Verify user is owner
    access = ChartAccess.query.get((chart_uuid, user_id))
    if not access or access.role != 'owner':
        return jsonify({'error': 'Not authorized'}), 403

    # Delete chart (cascades to chart_access and view_tokens)
    chart = Chart.query.get(chart_uuid)
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

    access = ChartAccess.query.get((chart_uuid, user_id))
    if access:
        db.session.delete(access)
        db.session.commit()

    return jsonify({'success': True})


# =============================================================================
# API Routes - Share Links
# =============================================================================

@app.route('/api/share/view', methods=['POST'])
def create_view_link():
    """Create a view-only magic link"""
    data = request.get_json()
    chart_uuid = data.get('chart_uuid')
    user_id = data.get('user_id')

    if not chart_uuid or not user_id:
        return jsonify({'error': 'chart_uuid and user_id required'}), 400

    # Verify user has access
    access = ChartAccess.query.get((chart_uuid, user_id))
    if not access:
        return jsonify({'error': 'Not authorized'}), 403

    # Generate view token
    view_token = secrets.token_urlsafe(32)

    token_entry = ViewToken(
        chart_uuid=chart_uuid,
        view_token=view_token,
        created_at=int(time.time())
    )
    db.session.add(token_entry)
    db.session.commit()

    return jsonify({
        'view_url': f'/view/{chart_uuid}/{view_token}'
    })


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
        access = ChartAccess(chart_uuid=chart_uuid, user_id=user_id, wrapped_key=wrapped_key_bytes, role='owner')
        db.session.add(access)

    # Store share access (user_id = 'share' as placeholder for share link access)
    share_access = db.session.get(ChartAccess, (chart_uuid, 'share'))
    if share_access:
        share_access.wrapped_key = wrapped_share_bytes
    else:
        share_access = ChartAccess(chart_uuid=chart_uuid, user_id='share', wrapped_key=wrapped_share_bytes, role='editor')
        db.session.add(share_access)

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

    share_access = db.session.get(ChartAccess, (chart_uuid, 'share'))
    if not share_access:
        return jsonify({'error': 'No share access'}), 404

    return jsonify({
        'chart_uuid': chart_uuid,
        'data': chart.data.hex(),
        'wrapped_key': share_access.wrapped_key.hex(),
        'updated_at': chart.last_modified
    })


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5002)