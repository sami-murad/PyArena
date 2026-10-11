import pytest

from app.config import Settings
from app.core.rate_limit import RateLimiter
from app.execution.explanations import explain
from app.repositories.competitions import CODE_ALPHABET, CODE_LENGTH, generate_room_code
from app.services.judge import describe_call, normalize_stdout, py_repr, values_equal


def test_values_equal_is_strict() -> None:
    assert values_equal([1, 2], [1, 2])
    assert not values_equal([1, 2], [2, 1])
    assert not values_equal(True, 1)
    assert not values_equal(1, True)
    assert values_equal(0.1 + 0.2, 0.3)
    assert values_equal(3, 3.0)
    assert not values_equal("1", 1)
    assert not values_equal(None, 0)
    assert values_equal({"a": [1]}, {"a": [1]})
    assert not values_equal({"a": 1}, {"a": 1, "b": 2})
    assert not values_equal([1], [1, 1])


def test_normalize_stdout_only_trims_trailing_whitespace() -> None:
    assert normalize_stdout("a  \nb\r\n\n\n") == "a\nb"
    assert normalize_stdout("a b") != normalize_stdout("ab")
    assert normalize_stdout(" a") != normalize_stdout("a")


def test_python_rendering() -> None:
    assert py_repr([None, True, "x", {"k": 1.5}]) == "[None, True, 'x', {'k': 1.5}]"
    assert describe_call("f", [[1, 2], "s"]) == "f([1, 2], 's')"


def test_explanations() -> None:
    e = explain("RUNTIME_ERROR", "IndexError", 'File "main.py", line 7, in <module>\nIndexError: x')
    assert e is not None and e.line == 7
    assert explain("TIMEOUT", None, "") is not None
    assert explain("OK", None, "") is None
    custom = explain("RUNTIME_ERROR", "MyOwnError", "MyOwnError: boom")
    assert custom is not None and "MyOwnError" in custom.title
    for name in [
        "SyntaxError",
        "NameError",
        "TypeError",
        "ValueError",
        "IndexError",
        "KeyError",
        "ZeroDivisionError",
        "IndentationError",
    ]:
        assert explain("RUNTIME_ERROR", name, "") is not None


def test_rate_limiter_window() -> None:
    limiter = RateLimiter()
    assert limiter.hit("k", 2, 60) is None
    assert limiter.hit("k", 2, 60) is None
    assert limiter.hit("k", 2, 60) is not None
    assert limiter.hit("other", 2, 60) is None
    assert RateLimiter(enabled=False).hit("k", 0, 60) is None


def test_room_codes_are_random_and_unambiguous() -> None:
    codes = {generate_room_code() for _ in range(2000)}
    assert len(codes) == 2000
    assert all(len(c) == CODE_LENGTH and set(c) <= set(CODE_ALPHABET) for c in codes)
    assert not set("01OIL") & set(CODE_ALPHABET)


def test_production_refuses_insecure_defaults() -> None:
    with pytest.raises(ValueError):
        Settings(_env_file=None, environment="production")  # type: ignore[call-arg]
    ok = Settings(
        _env_file=None,  # type: ignore[call-arg]
        environment="production",
        secret_key="x" * 40,
        worker_token="y" * 30,
        cookie_secure=True,
        cors_origins="https://a.example, https://b.example/",
    )
    assert ok.cors_origins == ["https://a.example", "https://b.example"]
