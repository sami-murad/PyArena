import json

from httpx import AsyncClient

from app.core.context import AppContext
from app.repositories.questions import QuestionRepository
from app.services.judge import describe_call
from tests.conftest import SEED_FILE, question_id, reference_solution, register


async def test_question_list_and_detail_never_leak_hidden_tests(client: AsyncClient, ctx: AppContext) -> None:
    listed = (await client.get("/api/questions")).json()
    assert len(listed) == 11
    qid = await question_id(client, "pair-to-target")
    r = await client.get(f"/api/questions/{qid}")
    detail = r.json()
    assert detail["function_name"] == "pair_to_target"
    assert detail["examples"][0]["input"] == "pair_to_target([3, 8, 11, 5], 13)"

    async with ctx.db.sessionmaker() as s:
        tests = await QuestionRepository(s).tests_for(qid)
    hidden = [t for t in tests if not t.is_public]
    assert hidden
    raw = r.text
    for t in hidden:
        assert describe_call("pair_to_target", t.input)[:40] not in raw
    assert "reference" not in raw
    assert "hidden" not in json.dumps(list(detail.keys()))
    assert detail["total_tests"] == len(tests)
    assert len(detail["examples"]) == len([t for t in tests if t.is_public])


async def test_every_reference_solution_is_accepted(client: AsyncClient) -> None:
    """Validates the whole question bank end-to-end through the real sandbox."""
    await register(client, "author")
    for item in json.loads(SEED_FILE.read_text()):
        qid = await question_id(client, item["slug"])
        r = await client.post("/api/submissions", json={"question_id": qid, "code": reference_solution(item["slug"])})
        body = r.json()
        assert body["status"] == "ACCEPTED", (item["slug"], body)
        assert body["passed_count"] == body["total_count"] == len(item["tests"])


async def test_wrong_answer_on_public_example_shows_details(client: AsyncClient) -> None:
    await register(client, "learner")
    qid = await question_id(client, "count-vowels")
    body = (
        await client.post("/api/submissions", json={"question_id": qid, "code": "def count_vowels(t):\n    return 1"})
    ).json()
    assert body["status"] == "WRONG_ANSWER"
    fb = body["feedback"]
    assert fb["is_public"] is True
    assert fb["expected"] == "4" and fb["actual"] == "1"


async def test_hidden_failure_reveals_nothing(client: AsyncClient) -> None:
    await register(client, "sneaky")
    qid = await question_id(client, "count-vowels")
    # Correct on the two examples, wrong on hidden tests; also prints and raises with its input.
    code = (
        "def count_vowels(t):\n"
        "    print('INPUT WAS', t)\n"
        "    if t in ('Python Arena', ''):\n"
        "        return {'Python Arena': 4, '': 0}[t]\n"
        "    raise ValueError('leak: ' + t)\n"
    )
    body = (await client.post("/api/submissions", json={"question_id": qid, "code": code})).json()
    assert body["status"] == "RUNTIME_ERROR"
    fb = body["feedback"]
    assert fb["is_public"] is False
    # Only these carry values; input, expected, actual, stdout and stderr stay empty.
    assert {k for k, v in fb.items() if v is not None} == {"failed_test", "total_tests", "is_public", "message"} | (
        {"error_type"} if fb["error_type"] is not None else set()
    )
    assert "rhythm" not in json.dumps(body)


async def test_stdio_problem_and_normalization(client: AsyncClient) -> None:
    await register(client, "stdio_user")
    qid = await question_id(client, "multiples-sum")
    trailing = "n = int(input())\nprint(str(sum(i for i in range(n) if i % 3 == 0 or i % 5 == 0)) + '   ')\nprint()\n"
    ok = (await client.post("/api/submissions", json={"question_id": qid, "code": trailing})).json()
    assert ok["status"] == "ACCEPTED"
    wrong = (await client.post("/api/submissions", json={"question_id": qid, "code": "print(23)"})).json()
    assert wrong["status"] == "WRONG_ANSWER"


async def test_submissions_are_private(make_client) -> None:  # type: ignore[no-untyped-def]
    alice, bob = make_client(), make_client()
    await register(alice, "alice")
    await register(bob, "bob")
    qid = await question_id(alice, "count-vowels")
    sub = (await alice.post("/api/submissions", json={"question_id": qid, "code": "x"})).json()
    assert (await alice.get(f"/api/submissions/{sub['id']}")).json()["code"] == "x"
    assert (await bob.get(f"/api/submissions/{sub['id']}")).status_code == 404
    assert (await bob.get("/api/submissions")).json() == []
    anon = make_client()
    assert (await anon.post("/api/submissions", json={"question_id": qid, "code": "x"})).status_code == 401


async def test_judge_outage_is_system_error(client: AsyncClient, executor) -> None:  # type: ignore[no-untyped-def]
    await register(client, "unlucky")
    qid = await question_id(client, "count-vowels")
    executor.fail = True
    body = (await client.post("/api/submissions", json={"question_id": qid, "code": "x"})).json()
    assert body["status"] == "SYSTEM_ERROR"


async def test_statistics(client: AsyncClient) -> None:
    await register(client, "stats")
    qid = await question_id(client, "count-vowels")
    await client.post("/api/submissions", json={"question_id": qid, "code": reference_solution("count-vowels")})
    await client.post("/api/submissions", json={"question_id": qid, "code": "oops("})
    stats = (await client.get("/api/users/me/statistics")).json()
    assert stats["submissions_total"] == 2
    assert stats["submissions_accepted"] == 1
    assert stats["questions_solved"] == 1
    assert stats["acceptance_rate"] == 0.5
