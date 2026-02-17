import time
from base64 import b64decode

from flask import Blueprint, g, request, jsonify, current_app
from models import db, Chart, ChartAccess, ShareLink
from extensions import limiter
from routes.helpers import valid_user_id, valid_uuid, encode_blob, ensure_identity
from routes.key_limits import check_key_rate, check_write_quotas
from telemetry import _hash_ip
import config

sharing_bp = Blueprint('sharing', __name__)


@sharing_bp.route('/api/share/edit', methods=['POST'])
@limiter.limit(config.RATELIMIT_API_WRITE)
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
    last_modified = min(data.get('last_modified', 0), int(time.time()) + 300)

    if not all([chart_uuid, user_id, encrypted_data, wrapped_key, wrapped_key_for_share, last_modified]):
        return jsonify({'error': 'Missing required fields'}), 400
    if not valid_uuid(chart_uuid) or not valid_user_id(user_id):
        return jsonify({'error': 'Invalid format'}), 400

    ip_hash = _hash_ip(request.remote_addr or '0.0.0.0')
    ok, reason = ensure_identity(user_id, data.get('public_key'), ip_hash)
    if not ok:
        if reason == 'rate':
            return jsonify({'error': 'Too many new accounts from this network; try again later'}), 429
        return jsonify({'error': 'public_key required and must match user_id'}), 403

    # Per-key rate limit
    ok, msg = check_key_rate(user_id, is_write=True)
    if not ok:
        return jsonify({'error': msg}), 429

    # Per-key storage quota
    ok, msg = check_write_quotas(user_id)
    if not ok:
        return jsonify({'error': msg}), 403

    chart_data = b64decode(encrypted_data)
    g.bytes_uploaded = len(chart_data)
    wrapped_key_bytes = b64decode(wrapped_key)
    wrapped_share_bytes = b64decode(wrapped_key_for_share)
    signature_str = data.get('signature')
    signature_bytes = b64decode(signature_str) if signature_str else None

    # Store/update chart
    chart = db.session.get(Chart, chart_uuid)
    if chart:
        chart.data = chart_data
        chart.last_modified = last_modified
        chart.signature = signature_bytes
    else:
        chart = Chart(chart_uuid=chart_uuid, data=chart_data, last_modified=last_modified,
                      signature=signature_bytes)
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
        share_link.created_at = int(time.time())
    else:
        share_link = ShareLink(chart_uuid=chart_uuid, wrapped_key=wrapped_share_bytes, created_at=int(time.time()))
        db.session.add(share_link)

    db.session.commit()
    return jsonify({'success': True})


@sharing_bp.route('/api/chart/<chart_uuid>/shared')
def get_shared_chart(chart_uuid):
    """Get chart data and wrapped key for share link"""
    if not valid_uuid(chart_uuid):
        return jsonify({'error': 'Invalid format'}), 400
    chart = db.session.get(Chart, chart_uuid)
    if not chart:
        return jsonify({'error': 'This link has expired or does not exist'}), 404

    share_link = db.session.get(ShareLink, chart_uuid)
    if not share_link:
        return jsonify({'error': 'This link has expired or does not exist'}), 404

    # TTL check — expire links older than SHARE_LINK_TTL_SECONDS
    now = int(time.time())
    if share_link.created_at + config.SHARE_LINK_TTL_SECONDS < now:
        # Opportunistic cleanup: delete all expired share links
        expired = ShareLink.query.filter(
            ShareLink.created_at + config.SHARE_LINK_TTL_SECONDS < now
        ).delete()
        db.session.commit()
        if expired:
            current_app.logger.info(f'[TTL] Removed {expired} expired share link(s)')
        return jsonify({'error': 'This link has expired or does not exist'}), 404

    return jsonify({
        'chart_uuid': chart_uuid,
        'data': encode_blob(chart.data),
        'wrapped_key': encode_blob(share_link.wrapped_key),
        'updated_at': chart.last_modified,
        'signature': encode_blob(chart.signature) if chart.signature else None
    })
