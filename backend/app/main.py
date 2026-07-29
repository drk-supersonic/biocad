from __future__ import annotations

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from mcp import ClientSession
from mcp.shared.memory import create_connected_server_and_client_session

from .excel_io import build_excel, parse_excel
from .llm_client import run_chat_turn
from .mcp_server import mcp as mcp_app
from .models import ChatRequest, ChatResponse, Task

# MCP-сервер (app/mcp_server.py) раньше запускался отдельным процессом и
# общался с бэкендом через stdio — на каждый вызов инструмента (в том числе
# на простые list_tasks для GET /api/tasks) уходил IPC-раунд-трип в другой
# процесс. Здесь используется in-memory transport из самого mcp-sdk: та же
# ClientSession и тот же протокол (list_tools/call_tool по JSON-RPC), но
# сервер и клиент работают в одном процессе поверх memory-стримов — без
# спавна процесса и сериализации через stdio.


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with create_connected_server_and_client_session(mcp_app) as session:
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
