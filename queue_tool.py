from contextlib import closing
from datetime import UTC, datetime
from pathlib import Path
import sqlite3
from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, StringConstraints


router = APIRouter(prefix="/tools/queue")
database = Path(__file__).resolve().parent / "data" / "queue.sqlite3"

Kind = Literal["book", "film", "game", "other"]
kinds = {
    "book": ("Книга", "Прочитано"),
    "film": ("Фильм", "Просмотрено"),
    "game": ("Игра", "Пройдено"),
    "other": ("Другое", "Завершено"),
}


class QueueInput(BaseModel):
    kind: Kind
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=240)]


def initialize_queue():
    database.parent.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(database)) as db, db:
        db.execute("BEGIN IMMEDIATE")
        version = db.execute("PRAGMA user_version").fetchone()[0]
        if version == 1:
            return
        if version != 0:
            raise RuntimeError(f"Unsupported queue database schema: {version}")
        db.execute("""
            CREATE TABLE queue_items (
                id INTEGER PRIMARY KEY,
                kind TEXT NOT NULL CHECK (kind IN ('book', 'film', 'game', 'other')),
                title TEXT NOT NULL,
                created_at INTEGER NOT NULL DEFAULT (unixepoch()),
                completed_at INTEGER
            )
        """)
        db.execute("""
            CREATE INDEX queue_pending_by_date ON queue_items (created_at, id)
            WHERE completed_at IS NULL
        """)
        db.execute("PRAGMA user_version = 1")


def pending_items():
    with closing(sqlite3.connect(database)) as db:
        db.row_factory = sqlite3.Row
        return [
            {**dict(row), "added": datetime.fromtimestamp(row["created_at"], UTC)}
            for row in db.execute("""
                SELECT id, kind, title, created_at FROM queue_items
                WHERE completed_at IS NULL ORDER BY created_at ASC, id ASC
            """)
        ]


@router.get("/", name="queue_page")
def queue_page(request: Request):
    return request.app.state.templates.TemplateResponse(
        request,
        "queue.html",
        {"items": pending_items(), "kinds": kinds},
        headers={"Cache-Control": "no-store"},
    )


@router.post("/api", status_code=201, name="queue_add")
def add_item(data: QueueInput):
    with closing(sqlite3.connect(database)) as db, db:
        result = db.execute("INSERT INTO queue_items (kind, title) VALUES (?, ?)", (data.kind, data.title))
        return {"id": result.lastrowid}


@router.post("/api/{item_id}/complete", status_code=204, name="queue_complete")
def complete_item(item_id: int):
    with closing(sqlite3.connect(database)) as db, db:
        result = db.execute(
            "UPDATE queue_items SET completed_at = coalesce(completed_at, unixepoch()) WHERE id = ?",
            (item_id,),
        )
        if not result.rowcount:
            raise HTTPException(404, "Произведение не найдено.")
