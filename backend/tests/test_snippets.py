from tests.conftest import register


async def test_snippet_crud_and_ownership(make_client) -> None:  # type: ignore[no-untyped-def]
    owner, other = make_client(), make_client()
    await register(owner, "owner")
    await register(other, "other")

    created = await owner.post("/api/snippets", json={"title": "Hello", "code": "print('hi')", "stdin": ""})
    assert created.status_code == 201
    sid = created.json()["id"]

    assert [s["id"] for s in (await owner.get("/api/snippets")).json()] == [sid]
    assert (await other.get("/api/snippets")).json() == []
    assert (await other.get(f"/api/snippets/{sid}")).status_code == 404
    assert (await other.put(f"/api/snippets/{sid}", json={"title": "x", "code": ""})).status_code == 404
    assert (await other.delete(f"/api/snippets/{sid}")).status_code == 404

    updated = await owner.put(f"/api/snippets/{sid}", json={"title": "Renamed", "code": "print(2)", "stdin": "1"})
    assert updated.json()["title"] == "Renamed"
    assert (await owner.delete(f"/api/snippets/{sid}")).status_code == 204
    assert (await owner.get(f"/api/snippets/{sid}")).status_code == 404

    anon = make_client()
    assert (await anon.get("/api/snippets")).status_code == 401
