"""focus mode: competitions.focus_mode, focus_sessions, focus_violations

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-11
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: Union[str, Sequence[str], None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("competitions", schema=None) as batch_op:
        batch_op.add_column(sa.Column("focus_mode", sa.Boolean(), server_default=sa.false(), nullable=False))

    op.create_table(
        "focus_sessions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("competition_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("counted_violations", sa.Integer(), nullable=False),
        sa.Column("paused_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("frozen_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("disqualified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("away_since", sa.DateTime(timezone=True), nullable=True),
        sa.Column("away_kind", sa.String(length=20), nullable=True),
        sa.Column("last_heartbeat_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["competition_id"],
            ["competitions.id"],
            name=op.f("fk_focus_sessions_competition_id_competitions"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_focus_sessions_user_id_users")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_focus_sessions")),
        sa.UniqueConstraint("competition_id", "user_id", name="uq_focus_sessions_member"),
    )
    with op.batch_alter_table("focus_sessions", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_focus_sessions_competition_id"), ["competition_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_focus_sessions_user_id"), ["user_id"], unique=False)

    op.create_table(
        "focus_violations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("session_id", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("counted", sa.Boolean(), nullable=False),
        sa.Column("action", sa.String(length=12), nullable=False),
        sa.Column("detail", sa.String(length=200), nullable=True),
        sa.ForeignKeyConstraint(
            ["session_id"],
            ["focus_sessions.id"],
            name=op.f("fk_focus_violations_session_id_focus_sessions"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_focus_violations")),
    )
    with op.batch_alter_table("focus_violations", schema=None) as batch_op:
        batch_op.create_index("ix_focus_violations_session_id_id", ["session_id", "id"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("focus_violations", schema=None) as batch_op:
        batch_op.drop_index("ix_focus_violations_session_id_id")
    op.drop_table("focus_violations")
    with op.batch_alter_table("focus_sessions", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_focus_sessions_user_id"))
        batch_op.drop_index(batch_op.f("ix_focus_sessions_competition_id"))
    op.drop_table("focus_sessions")
    with op.batch_alter_table("competitions", schema=None) as batch_op:
        batch_op.drop_column("focus_mode")
