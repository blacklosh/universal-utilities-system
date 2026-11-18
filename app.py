from contextlib import asynccontextmanager
from hashlib import sha256
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from queue_tool import initialize_queue, router as queue_router
from quotes_tool import initialize_quotes, router as quotes_router
from tasks_tool import initialize_tasks, router as tasks_router
from uuid_tool import router as uuid_router

root = Path(__file__).resolve().parent

@asynccontextmanager
async def lifespan(app: FastAPI):
    initialize_tasks()
    initialize_quotes()
    initialize_queue()
    yield


app = FastAPI(title="Universal Utility Tool", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=root / "static"), name="static")
templates = Jinja2Templates(directory=root / "templates")


def app_css_version():
    return sha256((root / "static" / "app.css").read_bytes()).hexdigest()[:12]


templates.env.globals["app_css_version"] = app_css_version
app.state.templates = templates
app.include_router(uuid_router)
app.include_router(tasks_router)
app.include_router(quotes_router)
app.include_router(queue_router)


@app.get("/", name="catalog")
def catalog(request: Request):
    return templates.TemplateResponse(request, "catalog.html")


@app.get("/tools/base64/", name="base64_page")
def base64_page(request: Request):
    return templates.TemplateResponse(request, "base64.html")


@app.get("/tools/jwt/", name="jwt_page")
def jwt_page(request: Request):
    return templates.TemplateResponse(request, "jwt.html")


@app.get("/tools/json/", name="json_page")
def json_page(request: Request):
    return templates.TemplateResponse(request, "json.html")
