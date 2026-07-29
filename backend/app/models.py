from __future__ import annotations

from datetime import date
from typing import Optional

from pydantic import BaseModel, Field


class Task(BaseModel):
    """Одна задача в плане проекта."""

    id: str
    name: str
    description: str = ""
    assignee: str = ""
    duration: int = 1  # длительность в рабочих днях
    predecessors: list[str] = Field(default_factory=list)  # id задач-предшественников

    # Ручной якорь начала (если None — задача планируется автоматически сразу
    # после самого позднего предшественника, либо с anchor_date проекта).
    manual_start: Optional[date] = None

    # Вычисляются планировщиком (scheduler.py), не редактируются напрямую.
    start: Optional[date] = None
    finish: Optional[date] = None


class ChatMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    message: str
    history: list[ChatMessage] = Field(default_factory=list)
    api_key: str  # ключ OpenRouter, введённый пользователем на странице; не сохраняется


class ChatResponse(BaseModel):
    reply: str
    tasks: list[Task]
