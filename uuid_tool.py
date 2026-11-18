from typing import Literal
from uuid import uuid4, uuid7

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

router = APIRouter(prefix="/tools/uuid")
MAX_COUNT = 1000


class GenerationRequest(BaseModel):
    version: Literal[4, 7]
    count: int = Field(ge=1, le=MAX_COUNT, strict=True)


@router.get("/", name="uuid_page")
def uuid_page(request: Request):
    return request.app.state.templates.TemplateResponse(
        request, "uuid.html", {"max_count": MAX_COUNT}
    )


@router.post("/generate", name="generate_uuid")
def generate_uuid(options: GenerationRequest):
    generate = uuid4 if options.version == 4 else uuid7
    return {"items": [str(generate()) for _ in range(options.count)]}
