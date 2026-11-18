from contextlib import closing, contextmanager
from datetime import date
from pathlib import Path
import sqlite3
from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, StringConstraints


router = APIRouter(prefix="/tools/tasks")
database = Path(__file__).resolve().parent / "data" / "tasks.sqlite3"
archive_delay = 3 * 24 * 60 * 60
archived_at = f"coalesce(cancelled_at, CASE WHEN done_at <= unixepoch() - {archive_delay} THEN done_at + {archive_delay} END)"

Status = Literal["todo", "in_progress", "blocked", "validation", "done"]
Priority = Literal["low", "normal", "high", "critical"]
Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)]


class SectionInput(BaseModel):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]


class TaskInput(BaseModel):
    section_id: int
    title: Title
    description: Annotated[str, StringConstraints(max_length=12000)] = ""
    deadline: date | None = None
    assigned_by: Annotated[str, StringConstraints(strip_whitespace=True, max_length=160)] = ""
    priority: Priority = "normal"


class TaskEdit(TaskInput):
    status: Status


class MoveInput(BaseModel):
    section_id: int
    status: Status


class MessageInput(BaseModel):
    body: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=8000)]


@contextmanager
def connection():
    with closing(sqlite3.connect(database)) as db:
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys = ON")
        with db:
            yield db


def initialize_tasks():
    database.parent.mkdir(parents=True, exist_ok=True)
    with connection() as db:
        db.execute("BEGIN IMMEDIATE")
        version = db.execute("PRAGMA user_version").fetchone()[0]
        if version == 1:
            return
        if version != 0:
            raise RuntimeError(f"Unsupported tasks database schema: {version}")
        db.execute("""
            CREATE TABLE sections (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                name_key TEXT NOT NULL UNIQUE
            )
        """)
        db.execute("""
            CREATE TABLE tasks (
                id INTEGER PRIMARY KEY,
                section_id INTEGER NOT NULL REFERENCES sections(id),
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                deadline TEXT,
                assigned_by TEXT NOT NULL,
                priority TEXT NOT NULL CHECK (priority IN ('low', 'normal', 'high', 'critical')),
                status TEXT NOT NULL DEFAULT 'todo'
                    CHECK (status IN ('todo', 'in_progress', 'blocked', 'validation', 'done')),
                created_at INTEGER NOT NULL DEFAULT (unixepoch()),
                done_at INTEGER,
                cancelled_at INTEGER,
                CHECK ((status = 'done') = (done_at IS NOT NULL))
            )
        """)
        db.execute("""
            CREATE TABLE task_messages (
                id INTEGER PRIMARY KEY,
                task_id INTEGER NOT NULL REFERENCES tasks(id),
                body TEXT NOT NULL,
                created_at INTEGER NOT NULL DEFAULT (unixepoch())
            )
        """)
        db.execute("CREATE INDEX task_messages_task ON task_messages(task_id, id)")
        db.executemany(
            "INSERT INTO sections (name, name_key) VALUES (?, ?)",
            [(name, name.casefold()) for name in ("Работа", "Университет", "Личное")],
        )
        db.execute("PRAGMA user_version = 1")


def require_section(db, section_id):
    if db.execute("SELECT 1 FROM sections WHERE id = ?", (section_id,)).fetchone() is None:
        raise HTTPException(404, "Раздел не найден.")


def require_task(db, task_id, *, active=False):
    row = db.execute(
        f"SELECT *, {archived_at} AS archived_at FROM tasks WHERE id = ?", (task_id,)
    ).fetchone()
    if row is None:
        raise HTTPException(404, "Задача не найдена.")
    if active and row["archived_at"] is not None:
        raise HTTPException(409, "Задача уже в архиве.")
    return row


@router.get("/", name="tasks_page")
def tasks_page(request: Request):
    return request.app.state.templates.TemplateResponse(request, "tasks.html")


@router.get("/api/board")
def board(archive: bool = False):
    with connection() as db:
        sections = db.execute("SELECT id, name FROM sections ORDER BY id").fetchall()
        order = "archived_at DESC, id DESC" if archive else "id DESC"
        predicate = "IS NOT NULL" if archive else "IS NULL"
        tasks = db.execute(
            f"""SELECT *, {archived_at} AS archived_at FROM tasks
                WHERE ({archived_at}) {predicate} ORDER BY {order}"""
        ).fetchall()
    return {"sections": [dict(row) for row in sections], "tasks": [dict(row) for row in tasks]}


@router.post("/api/sections", status_code=201)
def create_section(data: SectionInput):
    with connection() as db:
        try:
            result = db.execute(
                "INSERT INTO sections (name, name_key) VALUES (?, ?)",
                (data.name, data.name.casefold()),
            )
        except sqlite3.IntegrityError as error:
            raise HTTPException(409, "Раздел с таким названием уже существует.") from error
        return {"id": result.lastrowid}


@router.put("/api/sections/{section_id}")
def rename_section(section_id: int, data: SectionInput):
    with connection() as db:
        try:
            result = db.execute(
                "UPDATE sections SET name = ?, name_key = ? WHERE id = ?",
                (data.name, data.name.casefold(), section_id),
            )
        except sqlite3.IntegrityError as error:
            raise HTTPException(409, "Раздел с таким названием уже существует.") from error
        if not result.rowcount:
            raise HTTPException(404, "Раздел не найден.")
    return {"id": section_id}


@router.post("/api/tasks", status_code=201)
def create_task(data: TaskInput):
    fields = data.model_dump(mode="json")
    with connection() as db:
        require_section(db, data.section_id)
        result = db.execute(
            """INSERT INTO tasks (section_id, title, description, deadline, assigned_by, priority)
               VALUES (:section_id, :title, :description, :deadline, :assigned_by, :priority)""",
            fields,
        )
        return {"id": result.lastrowid}


@router.get("/api/tasks/{task_id}")
def task_detail(task_id: int):
    with connection() as db:
        task = dict(require_task(db, task_id))
        task["messages"] = [
            dict(row) for row in db.execute(
                "SELECT id, body, created_at FROM task_messages WHERE task_id = ? ORDER BY id",
                (task_id,),
            )
        ]
    return task


@router.put("/api/tasks/{task_id}")
def edit_task(task_id: int, data: TaskEdit):
    with connection() as db:
        db.execute("BEGIN IMMEDIATE")
        task = require_task(db, task_id, active=True)
        require_section(db, data.section_id)
        db.execute(
            """UPDATE tasks SET section_id = :section_id, title = :title,
               description = :description, deadline = :deadline,
               assigned_by = :assigned_by, priority = :priority, status = :status,
               done_at = CASE WHEN :status = 'done' THEN coalesce(:done_at, unixepoch()) END
               WHERE id = :id""",
            {**data.model_dump(mode="json"), "id": task_id, "done_at": task["done_at"]},
        )
    return {"id": task_id}


@router.patch("/api/tasks/{task_id}/move")
def move_task(task_id: int, data: MoveInput):
    with connection() as db:
        db.execute("BEGIN IMMEDIATE")
        task = require_task(db, task_id, active=True)
        require_section(db, data.section_id)
        db.execute(
            """UPDATE tasks SET section_id = ?, status = ?,
               done_at = CASE WHEN ? = 'done' THEN coalesce(?, unixepoch()) END WHERE id = ?""",
            (data.section_id, data.status, data.status, task["done_at"], task_id),
        )
    return {"id": task_id}


@router.post("/api/tasks/{task_id}/cancel")
def cancel_task(task_id: int):
    with connection() as db:
        db.execute("BEGIN IMMEDIATE")
        require_task(db, task_id, active=True)
        db.execute("UPDATE tasks SET cancelled_at = unixepoch() WHERE id = ?", (task_id,))
    return {"id": task_id}


@router.post("/api/tasks/{task_id}/messages", status_code=201)
def add_message(task_id: int, data: MessageInput):
    with connection() as db:
        db.execute("BEGIN IMMEDIATE")
        require_task(db, task_id, active=True)
        result = db.execute(
            "INSERT INTO task_messages (task_id, body) VALUES (?, ?)", (task_id, data.body)
        )
        return {"id": result.lastrowid}
