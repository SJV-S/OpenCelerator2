import os

DEVELOPER_MODE = True

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
DATABASE_URL = 'sqlite:///scc_charts.db'
# Handle postgres:// URLs that need postgresql:// prefix
if DATABASE_URL.startswith('postgres://'):
    DATABASE_URL = DATABASE_URL.replace('postgres://', 'postgresql://', 1)

SQLALCHEMY_TRACK_MODIFICATIONS = False

# --- Storage limits ---
STORAGE_LIMIT_BYTES = 10 * 1024 * 1024 * 1024  # 10 GB
TOMBSTONE_RETENTION_SECONDS = 365 * 24 * 3600  # 1 year

# --- Service Worker ---
if DEVELOPER_MODE:
    SW_CACHE_HEADERS = {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
    }
else:
    SW_CACHE_HEADERS = {'Cache-Control': 'max-age=3600'}  # Check for updates every 1 hour

# --- WebSocket ---
CORS_ALLOWED_ORIGINS = '*'

# --- Dev server ---
DEV_HOST = '0.0.0.0'
DEV_PORT = 5002
