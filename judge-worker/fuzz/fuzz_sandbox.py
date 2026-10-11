"""Coverage-guided fuzzing of the sandbox's parsing code with Atheris.

What is fuzzed (everything that handles bytes produced by untrusted code or
sent to the worker, without running a process per input, so millions of inputs
are cheap):

* ``extract_result``: splits the harness output and decodes the return value.
  Invariants: never raises; a result is only found after the random marker;
  the user's stdout never contains the marker line that was consumed.
* ``_clean_stderr``: hides sandbox paths. Invariant: the job directory path
  never survives in the cleaned text.
* ``_classify_error``: turns stderr into a status. Invariant: never raises and
  only produces known statuses and kill reasons.
* ``RunRequest`` / ``CallRequest``: request validation. Invariant: either a
  validation error or a request whose limits respect the documented bounds.

Run:
    pip install -r requirements-fuzz.txt
    python fuzz/fuzz_sandbox.py -atheris_runs=200000          # bounded run (CI)
    python fuzz/fuzz_sandbox.py fuzz/corpus                   # open-ended, keeps a corpus
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import atheris

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

with atheris.instrument_imports():
    from pydantic import ValidationError

    from worker.app import CallRequest, RunRequest
    from worker.sandbox import (
        INTERNAL_ERROR,
        MEMORY_LIMIT,
        OK,
        OUTPUT_LIMIT,
        RUNTIME_ERROR,
        SYNTAX_ERROR,
        TIMEOUT,
        RunResult,
        _classify_error,
        _clean_stderr,
        extract_result,
    )

STATUSES = {OK, SYNTAX_ERROR, RUNTIME_ERROR, TIMEOUT, MEMORY_LIMIT, OUTPUT_LIMIT, INTERNAL_ERROR}
KILL_REASONS = {None, "oom", "cpu", "wall", "output", "signal"}
MARKER = "__PYARENA_RESULT_0123456789abcdef0123456789abcdef__"
WORKDIR = "/sandbox/pyarena-job-abc123"


def check_extract(fdp: atheris.FuzzedDataProvider) -> None:
    user = fdp.ConsumeUnicodeNoSurrogates(fdp.ConsumeIntInRange(0, 2048))
    payload = fdp.ConsumeUnicodeNoSurrogates(fdp.ConsumeIntInRange(0, 512))
    with_marker = fdp.ConsumeBool()
    stdout = user + (("\n" + MARKER + payload + "\n") if with_marker else "")
    out, found, value = extract_result(stdout, MARKER)
    if not with_marker and ("\n" + MARKER) not in user:
        assert not found and out == stdout
    if found:
        assert out == stdout[: stdout.rfind("\n" + MARKER)]
        json.dumps(value)  # anything decoded must round-trip


def check_clean(fdp: atheris.FuzzedDataProvider) -> None:
    text = fdp.ConsumeUnicodeNoSurrogates(fdp.ConsumeIntInRange(0, 2048))
    cleaned = _clean_stderr(text.replace("@", WORKDIR), WORKDIR, "main.py")
    assert WORKDIR not in cleaned


def check_classify(fdp: atheris.FuzzedDataProvider) -> None:
    status = fdp.PickValueInList(sorted(STATUSES))
    exit_code = fdp.PickValueInList([None, 0, 1, -6, -9, -11, -24, 137])
    result = RunResult(
        status=status,
        stderr=fdp.ConsumeUnicodeNoSurrogates(fdp.ConsumeIntInRange(0, 1024)),
        exit_code=exit_code,
    )
    _classify_error(result)
    assert result.status in STATUSES
    assert result.kill_reason in KILL_REASONS


def check_requests(fdp: atheris.FuzzedDataProvider) -> None:
    raw = fdp.ConsumeBytes(fdp.ConsumeIntInRange(0, 1024))
    try:
        data = json.loads(raw)
    except (ValueError, RecursionError):
        return
    for model in (RunRequest, CallRequest):
        try:
            req = model.model_validate(data)
        except ValidationError:
            continue
        lim = req.limits
        assert 0 < lim.cpu_seconds <= 30 and 0 < lim.wall_seconds <= 60
        assert 32 <= lim.memory_mb <= 2048 and 1024 <= lim.max_output_bytes <= 1024 * 1024


CHECKS = (check_extract, check_clean, check_classify, check_requests)


def test_one_input(data: bytes) -> None:
    fdp = atheris.FuzzedDataProvider(data)
    CHECKS[fdp.ConsumeIntInRange(0, len(CHECKS) - 1)](fdp)


def main() -> None:
    atheris.Setup(sys.argv, test_one_input)
    atheris.Fuzz()


if __name__ == "__main__":
    main()
