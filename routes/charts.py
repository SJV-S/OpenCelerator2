import time

from flask import Blueprint, request, jsonify
from models import db, Chart, ChartAccess, ChartTombstone
from extensions import limiter
from routes.helpers import valid_user_id, valid_uuid, ensure_identity
import config

charts_bp = Blueprint('charts', __name__)


@charts_bp.route('/api/chart', methods=['DELETE'])
@limiter.limit(config.RATELIMIT_API_DELETE)
def delete_chart():
    """Owner deletes chart entirely"""
    data = request.get_json()
    chart_uuid = data.get('chart_uuid')
    user_id = data.get('user_id')

    if not chart_uuid or not user_id:
        return jsonify({'error': 'chart_uuid and user_id required'}), 400
    if not valid_uuid(chart_uuid) or not valid_user_id(user_id):
        return jsonify({'error': 'Invalid format'}), 400

    if not ensure_identity(user_id, data.get('public_key')):
        return jsonify({'error': 'public_key required and must match user_id'}), 403

    access = db.session.get(ChartAccess, (chart_uuid, user_id))
    if not access:
        return jsonify({'error': 'Not authorized'}), 403

    # Delete chart (cascades to chart_access and share_links)
    chart = db.session.get(Chart, chart_uuid)
    if chart:
        # Create per-user tombstones before cascade deletes access entries
        now = int(time.time())
        access_entries = ChartAccess.query.filter_by(chart_uuid=chart_uuid).all()
        for entry in access_entries:
            db.session.add(ChartTombstone(
                chart_uuid=chart_uuid, user_id=entry.user_id, deleted_at=now
            ))

        db.session.delete(chart)
        db.session.commit()

    return jsonify({'success': True})


@charts_bp.route('/api/chart/leave', methods=['DELETE'])
@limiter.limit(config.RATELIMIT_API_DELETE)
def leave_chart():
    """Collaborator removes their own access"""
    data = request.get_json()
    chart_uuid = data.get('chart_uuid')
    user_id = data.get('user_id')

    if not chart_uuid or not user_id:
        return jsonify({'error': 'chart_uuid and user_id required'}), 400
    if not valid_uuid(chart_uuid) or not valid_user_id(user_id):
        return jsonify({'error': 'Invalid format'}), 400

    if not ensure_identity(user_id, data.get('public_key')):
        return jsonify({'error': 'public_key required and must match user_id'}), 403

    access = db.session.get(ChartAccess, (chart_uuid, user_id))
    if access:
        db.session.delete(access)
        db.session.commit()

    return jsonify({'success': True})
