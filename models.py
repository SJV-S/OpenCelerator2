"""
Database Models for SCC Server Storage

SQLAlchemy models supporting both SQLite and PostgreSQL.
Schema based on PWA_SYNC_PROPOSAL.md
"""

import time

from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


class Chart(db.Model):
    """Encrypted chart data storage"""
    __tablename__ = 'charts'

    chart_uuid = db.Column(db.String(36), primary_key=True)
    data = db.Column(db.LargeBinary, nullable=False)  # Encrypted chart JSON
    last_modified = db.Column(db.Integer, nullable=False)  # Client timestamp (unencrypted metadata)
    signature = db.Column(db.LargeBinary, nullable=True)  # ECDSA signature of encrypted data

    # Relationships
    access_entries = db.relationship('ChartAccess', back_populates='chart', cascade='all, delete-orphan')
    share_link = db.relationship('ShareLink', back_populates='chart', cascade='all, delete-orphan', uselist=False)

    def to_dict(self):
        return {
            'chart_uuid': self.chart_uuid,
            'updated_at': self.last_modified
        }


class ChartAccess(db.Model):
    """Access control - who can decrypt which charts"""
    __tablename__ = 'chart_access'

    chart_uuid = db.Column(db.String(36), db.ForeignKey('charts.chart_uuid'), primary_key=True)
    user_id = db.Column(db.String(64), primary_key=True)  # SHA256 of user's passphrase
    wrapped_key = db.Column(db.LargeBinary, nullable=False)  # chart_key encrypted with user's derived key

    # Relationships
    chart = db.relationship('Chart', back_populates='access_entries')

    def to_dict(self):
        return {
            'chart_uuid': self.chart_uuid,
            'user_id': self.user_id
        }



class ShareLink(db.Model):
    """Wrapped key for share-link access (anyone with the URL)"""
    __tablename__ = 'share_links'

    chart_uuid = db.Column(db.String(36), db.ForeignKey('charts.chart_uuid'), primary_key=True)
    wrapped_key = db.Column(db.LargeBinary, nullable=False)  # chart_key wrapped with share-derived key
    created_at = db.Column(db.Integer, nullable=False)  # Unix seconds

    chart = db.relationship('Chart', back_populates='share_link')


class RequestLog(db.Model):
    """Telemetry: one row per HTTP request"""
    __tablename__ = 'request_logs'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    timestamp = db.Column(db.Integer, nullable=False)
    ip_hash = db.Column(db.String(64), nullable=False)
    method = db.Column(db.String(8), nullable=False)
    path = db.Column(db.String(256), nullable=False)
    status = db.Column(db.Integer, nullable=False)
    user_id = db.Column(db.String(64), nullable=True)
    chart_uuid = db.Column(db.String(36), nullable=True)


class ChartTombstone(db.Model):
    """Tombstones for deleted charts (retained 1 year for sync)"""
    __tablename__ = 'chart_tombstones'

    chart_uuid = db.Column(db.String(36), primary_key=True)
    deleted_at = db.Column(db.Integer, nullable=False)  # Unix timestamp



def init_db(app):
    """Initialize database with app context"""
    db.init_app(app)
    with app.app_context():
        db.create_all()

        # Migration: add created_at to share_links (create_all won't alter existing tables)
        try:
            db.session.execute(db.text('ALTER TABLE share_links ADD COLUMN created_at INTEGER'))
            db.session.execute(db.text('UPDATE share_links SET created_at = :now WHERE created_at IS NULL'),
                               {'now': int(time.time())})
            db.session.commit()
        except Exception:
            db.session.rollback()  # Column already exists

        # Migration: add signature to charts
        try:
            db.session.execute(db.text('ALTER TABLE charts ADD COLUMN signature BLOB'))
            db.session.commit()
        except Exception:
            db.session.rollback()  # Column already exists

        if 'sqlite' in app.config['SQLALCHEMY_DATABASE_URI']:
            db.session.execute(db.text('PRAGMA journal_mode=WAL'))
            db.session.commit()