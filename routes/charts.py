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

    ensure_identity(user_id, data.get('public_key'))

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

    ensure_identity(user_id, data.get('public_key'))

    access = db.session.get(ChartAccess, (chart_uuid, user_id))
    if access:
        db.session.delete(access)
        db.session.commit()

    return jsonify({'success': True})
