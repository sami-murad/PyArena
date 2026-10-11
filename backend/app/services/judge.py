"""Trusted judging: run a submission against every test and decide correctness.

The worker only reports what the code printed or returned.  Expected outputs
never leave the backend, and feedback for hidden tests contains no inputs,
outputs or error text (an exception message could echo a hidden input).
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any

from app.execution.client import ExecLimits, ExecResult, ExecutionUnavailable, Executor
from app.models import Question, QuestionMode, SubmissionStatus, TestCase

_EXEC_TO_SUBMISSION = {
    "SYNTAX_ERROR": SubmissionStatus.SYNTAX_ERROR,
    "RUNTIME_ERROR": SubmissionStatus.RUNTIME_ERROR,
    "TIMEOUT": SubmissionStatus.TIMEOUT,
    "MEMORY_LIMIT": SubmissionStatus.MEMORY_LIMIT,
    "OUTPUT_LIMIT": SubmissionStatus.OUTPUT_LIMIT,
}


def normalize_stdout(text: str) -> str:
    """Ignore trailing spaces on each line and trailing blank lines.  Nothing else."""
    lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    lines = [line.rstrip() for line in lines]
    while lines and lines[-1] == "":
        lines.pop()
    return "\n".join(lines)


def values_equal(actual: Any, expected: Any) -> bool:
    """Strict structural comparison of JSON values.

    * booleans never equal numbers (``True`` is not ``1``),
    * floats compare with a small tolerance (rel 1e-9, abs 1e-6),
    * ints and floats compare numerically,
    * lists compare element-wise, dicts by key set and values.
    """
    if isinstance(actual, bool) or isinstance(expected, bool):
        return isinstance(actual, bool) and isinstance(expected, bool) and actual == expected
    if isinstance(actual, (int, float)) and isinstance(expected, (int, float)):
        if isinstance(actual, float) or isinstance(expected, float):
            return math.isclose(actual, expected, rel_tol=1e-9, abs_tol=1e-6)
        return actual == expected
    if isinstance(actual, list) and isinstance(expected, list):
        return len(actual) == len(expected) and all(values_equal(a, e) for a, e in zip(actual, expected, strict=True))
    if isinstance(actual, dict) and isinstance(expected, dict):
        return actual.keys() == expected.keys() and all(values_equal(actual[k], expected[k]) for k in expected)
    return type(actual) is type(expected) and actual == expected


def py_repr(value: Any) -> str:
    """Render a JSON value the way it would look in Python source."""
    if value is None:
        return "None"
    if isinstance(value, bool):
        return "True" if value else "False"
    if isinstance(value, str):
        return repr(value)
    if isinstance(value, list):
        return "[" + ", ".join(py_repr(v) for v in value) + "]"
    if isinstance(value, dict):
        return "{" + ", ".join(f"{py_repr(k)}: {py_repr(v)}" for k, v in value.items()) + "}"
    return repr(value)


def describe_call(function_name: str, args: list[Any]) -> str:
    return f"{function_name}({', '.join(py_repr(a) for a in args)})"


@dataclass
class JudgeOutcome:
    status: SubmissionStatus
    passed: int
    total: int
    feedback: dict[str, Any] = field(default_factory=dict)


class Judge:
    def __init__(self, executor: Executor) -> None:
        self.executor = executor

    async def judge(self, question: Question, code: str, tests: list[TestCase]) -> JudgeOutcome:
        limits = ExecLimits(
            cpu_seconds=question.cpu_seconds,
            wall_seconds=max(question.cpu_seconds * 2 + 1, 3),
            memory_mb=question.memory_mb,
        )
        # Public tests first so early failures give the most useful feedback.
        ordered = sorted(tests, key=lambda t: (not t.is_public, t.ordinal))
        total = len(ordered)
        passed = 0
        for index, test in enumerate(ordered, start=1):
            try:
                result = await self._run_one(question, code, test, limits)
            except ExecutionUnavailable:
                return JudgeOutcome(
                    SubmissionStatus.SYSTEM_ERROR,
                    passed,
                    total,
                    {"message": "The judge is temporarily unavailable. This attempt does not count against you."},
                )

            verdict = self._verdict(question, test, result)
            if verdict is None:
                passed += 1
                continue
            return JudgeOutcome(verdict, passed, total, self._feedback(question, test, index, total, result, verdict))

        return JudgeOutcome(SubmissionStatus.ACCEPTED, passed, total, {"message": f"All {total} tests passed."})

    async def _run_one(self, question: Question, code: str, test: TestCase, limits: ExecLimits) -> ExecResult:
        if question.mode == QuestionMode.FUNCTION:
            args = test.input if isinstance(test.input, list) else [test.input]
            return await self.executor.call(code, question.function_name or "solve", args, limits)
        return await self.executor.run(code, str(test.input or ""), limits)

    @staticmethod
    def _verdict(question: Question, test: TestCase, result: ExecResult) -> SubmissionStatus | None:
        if result.status != "OK":
            return _EXEC_TO_SUBMISSION.get(result.status, SubmissionStatus.RUNTIME_ERROR)
        if question.mode == QuestionMode.FUNCTION:
            if not result.has_return_value or not values_equal(result.return_value, test.expected):
                return SubmissionStatus.WRONG_ANSWER
            return None
        if normalize_stdout(result.stdout) != normalize_stdout(str(test.expected)):
            return SubmissionStatus.WRONG_ANSWER
        return None

    @staticmethod
    def _feedback(
        question: Question, test: TestCase, index: int, total: int, result: ExecResult, verdict: SubmissionStatus
    ) -> dict[str, Any]:
        feedback: dict[str, Any] = {
            "failed_test": index,
            "total_tests": total,
            "is_public": test.is_public,
            "error_type": result.error_type,
        }
        if not test.is_public:
            feedback["message"] = f"Failed hidden test {index} of {total}. Hidden test details are not shown."
            return feedback
        feedback["message"] = f"Failed example test {index} of {total}."
        if question.mode == QuestionMode.FUNCTION:
            feedback["input"] = describe_call(question.function_name or "solve", list(test.input))
            feedback["expected"] = py_repr(test.expected)
            if result.has_return_value:
                feedback["actual"] = py_repr(result.return_value)
        else:
            feedback["input"] = str(test.input)
            feedback["expected"] = str(test.expected)
            feedback["actual"] = result.stdout[:2000]
        if verdict != SubmissionStatus.WRONG_ANSWER:
            feedback["stderr"] = result.stderr[-4000:]
        feedback["stdout"] = result.stdout[:2000] if question.mode == QuestionMode.FUNCTION else ""
        return feedback
