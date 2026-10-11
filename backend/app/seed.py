"""Load the question bank into the database (idempotent).

    python -m app.seed                       # uses SEED_FILE or the repo default
    python -m app.seed path/to/questions.json

Questions are matched by ``slug``: existing ones are updated and their tests
replaced, new ones are inserted.  Reference solutions are never stored.
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.database import Database
from app.models import Question, TestCase

DEFAULT_SEED = Path(__file__).resolve().parents[2] / "database" / "seeds" / "questions.json"
QUESTION_FIELDS = (
    "title",
    "statement",
    "difficulty",
    "mode",
    "function_name",
    "signature",
    "input_spec",
    "output_spec",
    "constraints",
    "starter_code",
    "explanation",
    "cpu_seconds",
    "memory_mb",
)


def load_file(path: Path) -> list[dict[str, Any]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        raise ValueError("seed file must contain a JSON list of questions")
    return data


async def seed_questions(session: AsyncSession, items: list[dict[str, Any]]) -> tuple[int, int]:
    created = updated = 0
    for item in items:
        question = (await session.execute(select(Question).where(Question.slug == item["slug"]))).scalar_one_or_none()
        if question is None:
            question = Question(slug=item["slug"], is_active=True)
            session.add(question)
            created += 1
        else:
            updated += 1
        for field in QUESTION_FIELDS:
            if field in item:
                setattr(question, field, item[field])
        await session.flush()
        await session.execute(delete(TestCase).where(TestCase.question_id == question.id))
        for test in item["tests"]:
            session.add(
                TestCase(
                    question_id=question.id,
                    ordinal=test["ordinal"],
                    input=test["input"],
                    expected=test["expected"],
                    is_public=bool(test.get("is_public")),
                    note=test.get("note"),
                )
            )
    await session.commit()
    return created, updated


async def main(argv: list[str]) -> None:
    path = Path(argv[1]) if len(argv) > 1 else Path(os.getenv("SEED_FILE", str(DEFAULT_SEED)))
    if not path.exists():
        raise SystemExit(f"Seed file not found: {path}")
    db = Database(get_settings().database_url)
    try:
        async with db.sessionmaker() as session:
            created, updated = await seed_questions(session, load_file(path))
        print(f"Seeded questions from {path}: {created} created, {updated} updated.")
    finally:
        await db.dispose()


if __name__ == "__main__":
    asyncio.run(main(sys.argv))
