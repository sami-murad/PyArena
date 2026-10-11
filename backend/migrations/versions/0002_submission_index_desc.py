"""newest-first index for a user's submissions

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-11

Replaces (user_id, created_at) with (user_id, created_at DESC), matching the
"my submissions, newest first" query. competition_players(competition_id,
user_id) is already indexed by its unique constraint, and test_cases is read
in full per question through the (question_id, ordinal) unique index, so no
extra indexes are added for them.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: Union[str, Sequence[str], None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("submissions", schema=None) as batch_op:
        batch_op.drop_index("ix_submissions_user_id_created_at")
    op.create_index(
        "ix_submissions_user_id_created_at_desc",
        "submissions",
        ["user_id", sa.text("created_at DESC")],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_submissions_user_id_created_at_desc", table_name="submissions")
    with op.batch_alter_table("submissions", schema=None) as batch_op:
        batch_op.create_index("ix_submissions_user_id_created_at", ["user_id", "created_at"], unique=False)
