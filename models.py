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
    created_by = db.Column(db.String(64), nullable=True)  # user_id of first uploader (for quota attribution)

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
    user_id = db.Column(db.String(64), primary_key=True)  # SHA256 of user's public key
    wrapped_key = db.Column(db.LargeBinary, nullable=False)  # chart_key encrypted with user's derived key

    # Relationships
    chart = db.relationship('Chart', back_populates='access_entries')

    def to_dict(self):
        return {
            'chart_uuid': self.chart_uuid,
            'user_id': self.user_id
        }



class Identity(db.Model):
    """Maps user_id (SHA-256 of public key) to raw ECDSA public key"""
    __tablename__ = 'identities'

    user_id = db.Column(db.String(64), primary_key=True)
    public_key = db.Column(db.Text, nullable=False)  # Base64 SPKI
    created_at = db.Column(db.Integer, nullable=False)


class ShareLink(db.Model):
    """Wrapped key for share-link access (anyone with the URL)"""
    __tablename__ = 'share_links'

    chart_uuid = db.Column(db.String(36), db.ForeignKey('charts.chart_uuid'), primary_key=True)
    wrapped_key = db.Column(db.LargeBinary, nullable=False)  # chart_key wrapped with share-derived key
    created_at = db.Column(db.Integer, nullable=False)  # Unix seconds
    join_token_hash = db.Column(db.String(64), nullable=True)  # SHA-256 hex of shareSecret

    chart = db.relationship('Chart', back_populates='share_link')


class RequestLog(db.Model):
    """Telemetry: one row per HTTP request"""
    __tablename__ = 'request_logs'
    __table_args__ = (
        db.Index('idx_request_logs_user_timestamp', 'user_id', 'timestamp'),
    )

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    timestamp = db.Column(db.Integer, nullable=False)
    ip_hash = db.Column(db.String(64), nullable=False)
    method = db.Column(db.String(8), nullable=False)
    path = db.Column(db.String(256), nullable=False)
    status = db.Column(db.Integer, nullable=False)
    user_id = db.Column(db.String(64), nullable=True)
    chart_uuid = db.Column(db.String(36), nullable=True)
    bytes_uploaded = db.Column(db.Integer, nullable=True)  # total encrypted bytes written in this request
    bytes_downloaded = db.Column(db.Integer, nullable=True)  # total encrypted bytes sent in this request
    comment = db.Column(db.String(256), nullable=True)


class AccountLink(db.Model):
    """Temporary one-time-use encrypted link for transferring identity between devices"""
    __tablename__ = 'account_links'

    link_id = db.Column(db.String(36), primary_key=True)
    encrypted_blob = db.Column(db.LargeBinary, nullable=False)
    created_at = db.Column(db.Integer, nullable=False)  # Unix seconds




class ChartTombstone(db.Model):
    """Tombstones for deleted charts (retained 1 year for sync)"""
    __tablename__ = 'chart_tombstones'

    chart_uuid = db.Column(db.String(36), primary_key=True)
    user_id = db.Column(db.String(64), primary_key=True)  # scoped per user to prevent tombstone pollution
    deleted_at = db.Column(db.Integer, nullable=False)  # Unix timestamp



def _migrate_columns(app):
    """Add columns that may be missing from older schemas."""
    migrations = [
        ('request_logs', 'comment', 'VARCHAR(256)'),
        ('share_links', 'join_token_hash', 'VARCHAR(64)'),
        ('request_logs', 'bytes_downloaded', 'INTEGER'),
    ]
    for table, column, col_type in migrations:
        try:
            db.session.execute(db.text(f'ALTER TABLE {table} ADD COLUMN {column} {col_type}'))
            db.session.commit()
            app.logger.info(f'Added column {table}.{column}')
        except Exception:
            db.session.rollback()  # already exists


def init_db(app):
    """Initialize database with app context"""
    db.init_app(app)
    with app.app_context():
        db.create_all()
        _migrate_columns(app)

        if 'sqlite' in app.config['SQLALCHEMY_DATABASE_URI']:
            db.session.execute(db.text('PRAGMA journal_mode=WAL'))
            db.session.commit()