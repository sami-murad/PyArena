from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.core.database import utcnow
from app.dependencies import CurrentUser, Session
from app.repositories.snippets import SnippetRepository
from app.schemas.snippets import SnippetIn, SnippetOut

router = APIRouter(prefix="/snippets", tags=["snippets"])

MAX_SNIPPETS_PER_USER = 200


@router.get("", response_model=list[SnippetOut])
async def list_snippets(user: CurrentUser, session: Session) -> list[SnippetOut]:
    return [SnippetOut.model_validate(s) for s in await SnippetRepository(session).list_for(user.id)]


@router.post("", response_model=SnippetOut, status_code=status.HTTP_201_CREATED)
async def create_snippet(body: SnippetIn, user: CurrentUser, session: Session) -> SnippetOut:
    repo = SnippetRepository(session)
    if await repo.count_for(user.id) >= MAX_SNIPPETS_PER_USER:
        raise HTTPException(status.HTTP_409_CONFLICT, f"You can keep up to {MAX_SNIPPETS_PER_USER} snippets.")
    snippet = await repo.create(user.id, body.title.strip(), body.code, body.stdin)
    await session.commit()
    return SnippetOut.model_validate(snippet)


@router.get("/{snippet_id}", response_model=SnippetOut)
async def get_snippet(snippet_id: int, user: CurrentUser, session: Session) -> SnippetOut:
    snippet = await SnippetRepository(session).get_owned(snippet_id, user.id)
    if snippet is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Snippet not found.")
    return SnippetOut.model_validate(snippet)


@router.put("/{snippet_id}", response_model=SnippetOut)
async def update_snippet(snippet_id: int, body: SnippetIn, user: CurrentUser, session: Session) -> SnippetOut:
    repo = SnippetRepository(session)
    snippet = await repo.get_owned(snippet_id, user.id)
    if snippet is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Snippet not found.")
    snippet.title = body.title.strip()
    snippet.code = body.code
    snippet.stdin = body.stdin
    snippet.updated_at = utcnow()
    await session.commit()
    return SnippetOut.model_validate(snippet)


@router.delete("/{snippet_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_snippet(snippet_id: int, user: CurrentUser, session: Session) -> None:
    repo = SnippetRepository(session)
    snippet = await repo.get_owned(snippet_id, user.id)
    if snippet is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Snippet not found.")
    await repo.delete(snippet)
    await session.commit()
