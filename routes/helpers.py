import re
import time
from base64 import b64encode, b64decode

from flask import current_app
from models import db, Identity

_RE_USER_ID = re.compile(r'^[0-9a-f]{64}$', re.I)
_RE_UUID = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', re.I)


def valid_user_id(v):
    return isinstance(v, str) and _RE_USER_ID.match(v) is not None


def valid_uuid(v):
    return isinstance(v, str) and _RE_UUID.match(v) is not None


def decode_blob(value):
    """Decode a base64-encoded string to bytes, passthrough if already bytes."""
    return b64decode(value) if isinstance(value, str) else value


def encode_blob(value):
    """Encode bytes to a base64 string for JSON responses."""
    return b64encode(value).decode('ascii')


def ensure_identity(user_id, public_key_b64):
    """Store public key on first encounter, verify match on subsequent requests."""
    if not public_key_b64:
        return
    existing = db.session.get(Identity, user_id)
    if existing:
        if existing.public_key != public_key_b64:
            current_app.logger.warning(f'[Identity] Public key mismatch for user_id {user_id[:8]}…')
        return
    try:
        identity = Identity(user_id=user_id, public_key=public_key_b64, created_at=int(time.time()))
        db.session.add(identity)
        db.session.flush()
    except Exception:
        db.session.rollback()  # Concurrent insert — already stored
