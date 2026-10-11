"""SQLAlchemy ORM models.  Importing this package registers every table."""

from app.models.competition import Competition, CompetitionPlayer, CompetitionStatus
from app.models.question import Difficulty, Question, QuestionMode, TestCase
from app.models.snippet import SavedSnippet
from app.models.submission import Submission, SubmissionStatus
from app.models.user import User

__all__ = [
    "Competition",
    "CompetitionPlayer",
    "CompetitionStatus",
    "Difficulty",
    "Question",
    "QuestionMode",
    "SavedSnippet",
    "Submission",
    "SubmissionStatus",
    "TestCase",
    "User",
]
