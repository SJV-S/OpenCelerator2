"""
Database Models for SCC Server Storage

SQLAlchemy models supporting both SQLite and PostgreSQL.
Schema based on PWA_SYNC_PROPOSAL.md
"""

from datetime import datetime
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


class Chart(db.Model):
    """Encrypted chart data storage"""
    __tablename__ = 'charts'

    chart_uuid = db.Column(db.String(36), primary_key=True)
    data = db.Column(db.LargeBinary, nullable=False)  # Encrypted chart JSON
    last_modified = db.Column(db.Integer, nullable=False)  # Client timestamp (unencrypted metadata)

    # Relationships
    access_entries = db.relationship('ChartAccess', back_populates='chart', cascade='all, delete-orphan')
    view_tokens = db.relationship('ViewToken', back_populates='chart', cascade='all, delete-orphan')

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
    role = db.Column(db.String(10), nullable=False)  # 'owner' | 'editor'

    # Relationships
    chart = db.relationship('Chart', back_populates='access_entries')

    def to_dict(self):
        return {
            'chart_uuid': self.chart_uuid,
            'user_id': self.user_id,
            'role': self.role
        }


class ViewToken(db.Model):
    """View-only tokens for magic links (separate from encrypted access)"""
    __tablename__ = 'view_tokens'

    chart_uuid = db.Column(db.String(36), db.ForeignKey('charts.chart_uuid'), primary_key=True)
    view_token = db.Column(db.String(64), primary_key=True)  # Random token for magic link
    created_at = db.Column(db.Integer, nullable=False)  # Unix timestamp

    # Relationships
    chart = db.relationship('Chart', back_populates='view_tokens')


class ChartTombstone(db.Model):
    """Tombstones for deleted charts (retained 30 days for sync)"""
    __tablename__ = 'chart_tombstones'

    chart_uuid = db.Column(db.String(36), primary_key=True)
    deleted_at = db.Column(db.Integer, nullable=False)  # Unix timestamp


class Username(db.Model):
    """Optional username mapping for user_id display"""
    __tablename__ = 'usernames'

    user_id = db.Column(db.String(64), primary_key=True)  # SHA256 of passphrase
    username = db.Column(db.String(50), unique=True, nullable=False)


def init_db(app):
    """Initialize database with app context"""
    db.init_app(app)
    with app.app_context():
        db.create_all()