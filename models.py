"""
Database Models for SCC Server Storage

SQLAlchemy models supporting both SQLite and PostgreSQL.
Schema based on PWA_SYNC_PROPOSAL.md
"""

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

    chart = db.relationship('Chart', back_populates='share_link')


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