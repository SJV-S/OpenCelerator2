import time
from base64 import b64decode

from flask import Blueprint, request, jsonify
from models import db, AccountLink
from extensions import limiter
from routes.helpers import valid_uuid, encode_blob
import config

accounts_bp = Blueprint('accounts', __name__)


@accounts_bp.route('/api/account-link', methods=['POST'])
@limiter.limit(config.RATELIMIT_ACCOUNT_LINK)
def create_account_link():
    """Store an encrypted identity blob for one-time retrieval."""
    data = request.get_json()
    link_id = data.get('link_id')
    encrypted_blob = data.get('encrypted_blob')

    if not link_id or not encrypted_blob:
        return jsonify({'error': 'link_id and encrypted_blob required'}), 400

    if not valid_uuid(link_id):
        return jsonify({'error': 'Invalid link_id'}), 400

    # Reject duplicate
    if db.session.get(AccountLink, link_id):
        return jsonify({'error': 'Link already exists'}), 409

    blob_bytes = b64decode(encrypted_blob)
    account_link = AccountLink(
        link_id=link_id,
        encrypted_blob=blob_bytes,
        created_at=int(time.time())
    )
    db.session.add(account_link)
    db.session.commit()

    return jsonify({'success': True}), 201


@accounts_bp.route('/api/account-link/<link_id>')
@limiter.limit(config.RATELIMIT_DEFAULT)
def get_account_link(link_id):
    """Retrieve an encrypted identity blob. Idempotent — TTL handles cleanup."""
    account_link = db.session.get(AccountLink, link_id)
    if not account_link:
        return jsonify({'error': 'Link not found or expired'}), 404

    # TTL check
    now = int(time.time())
    if account_link.created_at + config.ACCOUNT_LINK_TTL_SECONDS < now:
        db.session.delete(account_link)

        # Opportunistic cleanup of all expired links
        expired = AccountLink.query.filter(
            AccountLink.created_at + config.ACCOUNT_LINK_TTL_SECONDS < now
        ).delete()
        db.session.commit()

        return jsonify({'error': 'Link has expired'}), 404

    return jsonify({'encrypted_blob': encode_blob(account_link.encrypted_blob)})
