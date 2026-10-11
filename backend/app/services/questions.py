"""Converts questions into participant-safe API payloads.

Only tests marked ``is_public`` are turned into examples.  Hidden tests are
counted but their contents are never included.
"""

from __future__ import annotations

from app.models import Question, QuestionMode, TestCase
from app.schemas.questions import ExampleOut, QuestionDetail, QuestionSummary
from app.services.judge import describe_call, py_repr


def to_summary(question: Question) -> QuestionSummary:
    return QuestionSummary(
        id=question.id,
        slug=question.slug,
        title=question.title,
        difficulty=question.difficulty,
        mode=question.mode,
    )


def _example(question: Question, test: TestCase) -> ExampleOut:
    if question.mode == QuestionMode.FUNCTION:
        args = test.input if isinstance(test.input, list) else [test.input]
        return ExampleOut(
            input=describe_call(question.function_name or "solve", args), output=py_repr(test.expected), note=test.note
        )
    return ExampleOut(input=str(test.input), output=str(test.expected), note=test.note)


def to_detail(question: Question, tests: list[TestCase], include_explanation: bool = False) -> QuestionDetail:
    public = [t for t in sorted(tests, key=lambda t: t.ordinal) if t.is_public]
    return QuestionDetail(
        **to_summary(question).model_dump(),
        statement=question.statement,
        function_name=question.function_name,
        signature=question.signature,
        input_spec=question.input_spec,
        output_spec=question.output_spec,
        constraints=list(question.constraints or []),
        starter_code=question.starter_code,
        examples=[_example(question, t) for t in public],
        explanation=question.explanation if include_explanation else None,
        time_limit_seconds=question.cpu_seconds,
        memory_limit_mb=question.memory_mb,
        total_tests=len(tests),
    )
