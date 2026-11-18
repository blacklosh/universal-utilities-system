from contextlib import closing
from hashlib import sha256
from pathlib import Path
import sqlite3
from typing import Annotated

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field, StringConstraints


router = APIRouter(prefix="/tools/quotes")
database = Path(__file__).resolve().parent / "data" / "quotes.sqlite3"


class QuoteInput(BaseModel):
    body: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=20000)]
    source: Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)] = ""


class ImportedQuote(QuoteInput):
    key: Annotated[str, StringConstraints(min_length=1, max_length=120)]
    created_at: Annotated[int, Field(ge=0, le=253402300799, strict=True)]


def initialize_quotes():
    database.parent.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(database)) as db, db:
        db.execute("BEGIN IMMEDIATE")
        version = db.execute("PRAGMA user_version").fetchone()[0]
        if version == 1:
            return
        if version != 0:
            raise RuntimeError(f"Unsupported quotes database schema: {version}")
        db.execute("""
            CREATE TABLE quotes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                body TEXT NOT NULL,
                source TEXT NOT NULL,
                created_at INTEGER NOT NULL DEFAULT (unixepoch())
            )
        """)
        db.execute("CREATE INDEX quotes_by_date ON quotes(created_at DESC, id DESC)")
        db.execute("CREATE TABLE imported_messages (fingerprint TEXT PRIMARY KEY)")
        db.execute("PRAGMA user_version = 1")


@router.get("/", name="quotes_page")
def quotes_page(request: Request):
    return request.app.state.templates.TemplateResponse(request, "quotes.html")


@router.get("/api")
def list_quotes():
    with closing(sqlite3.connect(database)) as db:
        db.row_factory = sqlite3.Row
        return [dict(row) for row in db.execute(
            "SELECT id, body, source, created_at FROM quotes ORDER BY created_at DESC, id DESC"
        )]


@router.post("/api", status_code=201)
def add_quote(data: QuoteInput):
    with closing(sqlite3.connect(database)) as db, db:
        result = db.execute("INSERT INTO quotes (body, source) VALUES (?, ?)", (data.body, data.source))
        return {"id": result.lastrowid}


@router.delete("/api/{quote_id}", status_code=204)
def delete_quote(quote_id: int):
    with closing(sqlite3.connect(database)) as db, db:
        result = db.execute("DELETE FROM quotes WHERE id = ?", (quote_id,))
        if not result.rowcount:
            raise HTTPException(404, "Фраза не найдена.")


@router.post("/api/import")
def import_quotes(items: Annotated[list[ImportedQuote], Field(min_length=1, max_length=250)]):
    added = 0
    with closing(sqlite3.connect(database)) as db, db:
        for item in items:
            fingerprint = sha256(item.key.encode()).hexdigest()
            result = db.execute("INSERT OR IGNORE INTO imported_messages VALUES (?)", (fingerprint,))
            if result.rowcount:
                db.execute(
                    "INSERT INTO quotes (body, source, created_at) VALUES (?, ?, ?)",
                    (item.body, item.source, item.created_at),
                )
                added += 1
    return {"added": added, "skipped": len(items) - added}
