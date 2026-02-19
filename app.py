from flask import Flask, render_template, request, jsonify, send_from_directory, make_response
from flask_socketio import join_room, leave_room

from models import db, init_db
from extensions import limiter, socketio
from telemetry import log_request
from routes.helpers import valid_uuid
import config

app = Flask(__name__)

app.config['SQLALCHEMY_DATABASE_URI'] = config.DATABASE_URL
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = config.SQLALCHEMY_TRACK_MODIFICATIONS
app.config['MAX_CONTENT_LENGTH'] = config.MAX_CONTENT_LENGTH
app.config['RATELIMIT_DEFAULT'] = config.RATELIMIT_DEFAULT
app.config['RATELIMIT_STORAGE_URI'] = config.RATELIMIT_STORAGE_URI
app.config['APP_VERSION'] = config.APP_VERSION

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

# Security headers + static file caching
@app.after_request
def set_headers(response):
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'SAMEORIGIN'
    if request.path.startswith('/static/'):
        # 24 hours — extend when the app is considered more stable
        response.headers['Cache-Control'] = 'max-age=86400, must-revalidate'
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
    return jsonify(v=config.APP_VERSION), 200



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
