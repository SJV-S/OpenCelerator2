import os

DEVELOPER_MODE = True
APP_VERSION = '0.4.0'

# --- Load .env file ---
_env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env')
if os.path.exists(_env_path):
    with open(_env_path) as _f:
        for _line in _f:
            _line = _line.strip()
            if _line and not _line.startswith('#') and '=' in _line:
                _key, _val = _line.split('=', 1)
                os.environ.setdefault(_key.strip(), _val.strip())

# --- Telemetry ---
if DEVELOPER_MODE:
    IP_HASH_SECRET = os.environ.get('IP_HASH_SECRET', 'dev-insecure-key')
else:
    IP_HASH_SECRET = os.environ.get('IP_HASH_SECRET')
    if not IP_HASH_SECRET:
        raise RuntimeError('IP_HASH_SECRET must be set in .env for production')

# --- Database ---
DATABASE_URL = os.environ.get('DATABASE_URL', 'sqlite:///scc_charts.db')
# Handle postgres:// URLs that need postgresql:// prefix
if DATABASE_URL.startswith('postgres://'):
    DATABASE_URL = DATABASE_URL.replace('postgres://', 'postgresql://', 1)

SQLALCHEMY_TRACK_MODIFICATIONS = False

# --- Storage limits ---
STORAGE_LIMIT_BYTES = 10 * 1024 * 1024 * 1024  # 10 GB
TOMBSTONE_RETENTION_SECONDS = 365 * 24 * 3600  # 1 year
SHARE_LINK_TTL_SECONDS = 14 * 24 * 3600  # 14 days
ACCOUNT_LINK_TTL_SECONDS = 15 * 60  # 15 minutes

# --- Per-Key Limits ---
PER_KEY_STORAGE_LIMIT_BYTES = 50 * 1024 * 1024  # 50 MB — ~2,000 large charts (200 KB raw ≈ 25 KB compressed)
PER_KEY_STORAGE_RATE_BYTES = 5 * 1024 * 1024  # 5 MB/day from first seen; full 50 MB in 10 days
PER_KEY_CHART_LIMIT = 2500  # derived from storage quota: 50 MB / ~25 KB per large chart (added 500 as charts are likely to be smaller than 25 KB)
PER_KEY_WRITE_LIMIT_PER_MINUTE = 15  # below IP limit (25/min); single user doesn't need the full shared-NAT budget
PER_KEY_READ_LIMIT_PER_MINUTE = 30  # prevents read amplification across multiple IPs
NEW_KEYS_PER_IP_PER_HOUR = 5  # legitimate users need one key; shared NAT might produce a few


# --- Service Worker ---
# Browsers bypass HTTP cache for SW update checks (always fetch from network).
# no-store ensures proxies/CDNs don't cache it either.
SW_CACHE_HEADERS = {'Cache-Control': 'no-store'}

# --- WebSocket ---
CORS_ALLOWED_ORIGINS = '*'

# --- IP Rate Limiting ---
RATELIMIT_DEFAULT = '60/minute'
RATELIMIT_API_WRITE = '25/minute'
RATELIMIT_API_DELETE = '10/minute'
RATELIMIT_POLL = '120/minute'
RATELIMIT_ACCOUNT_LINK = '5/minute'
RATELIMIT_STORAGE_URI = 'memory://'
MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16 MB

# --- Dev server ---
DEV_HOST = '0.0.0.0'
DEV_PORT = 5002
