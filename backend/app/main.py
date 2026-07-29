from __future__ import annotations

import os
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

from .excel_io import build_excel, parse_excel
from .llm_client import run_chat_turn
from .models import ChatRequest, ChatResponse, Task

# Параметры запуска MCP-сервера как отдельного процесса (stdio transport).
_SERVER_PARAMS = StdioServerParameters(
    command=sys.executable,
    args=["-m", "app.mcp_server"],
    cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with stdio_client(_SERVER_PARAMS) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            app.state.mcp_session = session
            yield


app = FastAPI(title="Gantt AI Planner API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


def _session(app_: FastAPI) -> ClientSession:
    return app_.state.mcp_session


async def _call(app_: FastAPI, tool: str, **kwargs) -> dict | list | str:
    """Вызывает MCP-инструмент и возвращает уже разобранные данные.

    FastMCP кладёт структурированный результат в structuredContent, оборачивая
    не-объектные значения (списки, скаляры) в {"result": ...}; это надёжнее,
    чем парсить текстовые content-блоки вручную.
    """
    result = await _session(app_).call_tool(tool, kwargs)
    if result.isError:
        text = "\n".join(b.text for b in result.content if hasattr(b, "text"))
        raise HTTPException(status_code=400, detail=text or "Ошибка MCP-инструмента")

    structured = result.structuredContent
    if structured is not None:
        if isinstance(structured, dict) and set(structured.keys()) == {"result"}:
            return structured["result"]
        return structured

    return "\n".join(b.text for b in result.content if hasattr(b, "text"))



@app.get("/api/tasks", response_model=list[Task])
async def get_tasks():
    return await _call(app, "list_tasks")


@app.post("/api/upload-excel", response_model=list[Task])
async def upload_excel(file: UploadFile):
    raw_bytes = await file.read()
    try:
        raw_tasks = parse_excel(raw_bytes)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await _call(app, "load_tasks", tasks=raw_tasks)
    return await _call(app, "list_tasks")


@app.get("/api/export-excel")
async def export_excel():
    tasks_raw = await _call(app, "list_tasks")
    tasks = [Task(**t) for t in tasks_raw]
    content = build_excel(tasks)
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=plan.xlsx"},
    )


@app.post("/api/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    history = [{"role": m.role, "content": m.content} for m in req.history]
    try:
        reply = await run_chat_turn(_session(app), req.message, history, req.api_key)
    except RuntimeError as exc:
        # Например, пустой api_key — понятная ошибка, а не голый 500.
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    tasks_raw = await _call(app, "list_tasks")
    return ChatResponse(reply=reply, tasks=[Task(**t) for t in tasks_raw])
