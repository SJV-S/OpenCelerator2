import hashlib
import re
import time
from base64 import b64encode, b64decode

from flask import current_app
from models import db, Identity
from routes.key_limits import check_new_key_limits

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


def verify_user_id(user_id, public_key_b64):
    """Verify that user_id is the SHA-256 hash of the base64 public key string."""
    expected = hashlib.sha256(public_key_b64.encode('utf-8')).hexdigest()
    return user_id.lower() == expected.lower()


def ensure_identity(user_id, public_key_b64, ip_hash=None):
    """Store public key on first encounter, verify match on subsequent requests.

    Returns (True, None) on success.
    Returns (False, 'auth') if public_key is missing or doesn't match.
    Returns (False, 'rate') if new-key rate limit is exceeded.
    """
    if not public_key_b64:
        return False, 'auth'
    if not verify_user_id(user_id, public_key_b64):
        current_app.logger.warning(f'[Identity] user_id {user_id[:8]}… does not match public key hash')
        return False, 'auth'
    existing = db.session.get(Identity, user_id)
    if existing:
        return True, None

    # New key — enforce rate limits
    if ip_hash:
        ok, msg = check_new_key_limits(ip_hash)
        if not ok:
            current_app.logger.warning(f'[Identity] new-key limit hit for {user_id[:8]}…: {msg}')
            return False, 'rate'

    try:
        identity = Identity(user_id=user_id, public_key=public_key_b64, created_at=int(time.time()))
        db.session.add(identity)
        db.session.flush()
    except Exception:
        db.session.rollback()  # Concurrent insert — already stored
    return True, None
