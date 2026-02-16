import time

from flask import Flask, render_template, request, jsonify, send_from_directory, make_response
from flask_socketio import join_room, leave_room

from models import db, IPBan, init_db
from extensions import limiter, socketio
from telemetry import log_request, _hash_ip
from sharing_detection import check_sharing
from routes.helpers import valid_uuid
import config

app = Flask(__name__)

app.config['SQLALCHEMY_DATABASE_URI'] = config.DATABASE_URL
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = config.SQLALCHEMY_TRACK_MODIFICATIONS
app.config['MAX_CONTENT_LENGTH'] = config.MAX_CONTENT_LENGTH
app.config['RATELIMIT_DEFAULT'] = config.RATELIMIT_DEFAULT
app.config['RATELIMIT_STORAGE_URI'] = config.RATELIMIT_STORAGE_URI

# Initialize extensions with app
socketio.init_app(app, cors_allowed_origins=config.CORS_ALLOWED_ORIGINS)
limiter.init_app(app)

# Initialize database
init_db(app)

# Register blueprints
from routes.sync import sync_bp
from routes.charts import charts_bp
from routes.sharing import sharing_bp
from routes.accounts import accounts_bp

app.register_blueprint(sync_bp)
app.register_blueprint(charts_bp)
app.register_blueprint(sharing_bp)
app.register_blueprint(accounts_bp)


# =============================================================================
# Middleware
# =============================================================================

# IP ban check — runs before sharing detection
_BAN_EXEMPT_PREFIXES = ('/static/', '/chart/', '/sync/')
_BAN_EXEMPT_EXACT = frozenset(('/', '/welcome', '/new', '/api/health', '/service-worker.js'))


def _extract_user_id_from_request():
    """Extract user_id from JSON body or X-User-Id header."""
    if request.is_json:
        body = request.get_json(silent=True)
        if body and isinstance(body, dict) and body.get('user_id'):
            return body['user_id']
    return request.headers.get('X-User-Id')


def _is_ban_active(ban):
    """Check if a ban row is currently active."""
    if ban is None:
        return False
    if ban.banned_until is None:
        return True  # Permanent
    return ban.banned_until > int(time.time())


def check_ip_ban():
    """before_request handler — reject banned IPs and user+IP pairs."""
    path = request.path
    if path in _BAN_EXEMPT_EXACT:
        return None
    for prefix in _BAN_EXEMPT_PREFIXES:
        if path.startswith(prefix):
            return None

    ip_hash = _hash_ip(request.remote_addr or '0.0.0.0')

    # Tier 2: full IP ban
    if _is_ban_active(db.session.get(IPBan, (ip_hash, '*'))):
        return jsonify({'error': 'banned'}), 403

    # Tier 1: user+IP ban
    uid = _extract_user_id_from_request()
    if uid and _is_ban_active(db.session.get(IPBan, (ip_hash, uid))):
        return jsonify({'error': 'banned'}), 403

    return None


app.before_request(check_ip_ban)

# Account sharing detection — runs before every request
app.before_request(check_sharing)

# Security headers
@app.after_request
def set_security_headers(response):
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'SAMEORIGIN'
    return response

# Telemetry — log every request
app.after_request(log_request)


# =============================================================================
# Service Worker (must be served from root for full scope)
# =============================================================================

@app.route('/service-worker.js')
def service_worker():
    response = make_response(send_from_directory(app.root_path, 'service-worker.js'))
    for header, value in config.SW_CACHE_HEADERS.items():
        response.headers[header] = value
    return response


@app.route('/api/health')
@limiter.exempt
def health():
    return '', 204


# =============================================================================
# HTML Routes
# =============================================================================

@app.route('/')
def index():
    return render_template('SCC/chart_explorer.html')


@app.route('/welcome')
def welcome():
    return render_template('SCC/welcome.html')


@app.route('/new')
def new_chart():
    return render_template('SCC/new_chart.html')


@app.route('/chart/_shell')
@app.route('/chart/<chart_id>')
def chart(chart_id=None):
    return render_template('SCC/view_chart.html')


@app.route('/sync/<link_id>')
def sync_link_page(link_id):
    """Render the receiver page for account link redemption."""
    return render_template('SCC/sync_link.html')


# =============================================================================
# WebSocket Events - Shared Chart Notifications
# =============================================================================

@socketio.on('join_chart')
def handle_join_chart(data):
    """Client subscribes to updates for a specific chart"""
    chart_uuid = data.get('chart_uuid')

    if valid_uuid(chart_uuid):
        join_room(f'chart:{chart_uuid}')


@socketio.on('leave_chart')
def handle_leave_chart(data):
    """Client unsubscribes from chart updates"""
    chart_uuid = data.get('chart_uuid')
    if valid_uuid(chart_uuid):
        leave_room(f'chart:{chart_uuid}')


if __name__ == '__main__':
    socketio.run(app, debug=True, host=config.DEV_HOST, port=config.DEV_PORT, allow_unsafe_werkzeug=True)
