DEVELOPER_MODE = True

# --- Database ---
DATABASE_URL = 'sqlite:///scc_charts.db'
# Handle postgres:// URLs that need postgresql:// prefix
if DATABASE_URL.startswith('postgres://'):
    DATABASE_URL = DATABASE_URL.replace('postgres://', 'postgresql://', 1)

SQLALCHEMY_TRACK_MODIFICATIONS = False

# --- Storage limits ---
STORAGE_LIMIT_BYTES = 5 * 1024 * 1024 * 1024  # 5 GB
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
