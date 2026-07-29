"""MCP-сервер плана проекта.

Запускается как ОТДЕЛЬНЫЙ процесс (stdio transport). Держит единственный
источник истины по состоянию плана (plan_state) внутри своего процесса.
Host-приложение (FastAPI, см. main.py) подключается к нему как MCP-клиент
и вызывает эти инструменты — как напрямую по запросу пользователя, так и
через LLM (function/tool calling) в чате.
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Optional

from mcp.server.fastmcp import FastMCP

from .models import Task
from .seed import SEED_TASKS
from .state import plan_state

mcp = FastMCP("gantt-planner")


def _task_to_dict(t: Task) -> dict:
    plan_state.recompute()
    return t.model_dump(mode="json")


def _seed_if_empty() -> None:
    if plan_state.tasks:
        return
    _load_raw(SEED_TASKS)


def _load_raw(raw_tasks: list[dict]) -> None:
    """Общая логика загрузки списка задач (по именам) в состояние с нуля."""
    plan_state.clear()
    name_to_id: dict[str, str] = {}

    # Первый проход — создаём задачи с временными пустыми predecessors
    for raw in raw_tasks:
        tid = plan_state.next_id()
        name_to_id[raw["name"].strip().lower()] = tid
        plan_state.tasks[tid] = Task(
            id=tid,
            name=raw["name"],
            description=raw.get("description", ""),
            assignee=raw.get("assignee", ""),
            duration=int(raw.get("duration", 1)),
            predecessors=[],
        )

    # Второй проход — резолвим предшественников по именам
    for raw, tid in zip(raw_tasks, [name_to_id[r["name"].strip().lower()] for r in raw_tasks]):
        preds = []
        for p in raw.get("predecessors", []):
            key = p.strip().lower()
            if key in name_to_id:
                preds.append(name_to_id[key])
        plan_state.tasks[tid].predecessors = preds

    plan_state.recompute()


@mcp.tool()
def list_tasks() -> list[dict]:
    """Вернуть все задачи текущего плана с вычисленным расписанием (start/finish)."""
    _seed_if_empty()
    plan_state.recompute()
    return [t.model_dump(mode="json") for t in plan_state.tasks.values()]


@mcp.tool()
def load_tasks(tasks: list[dict]) -> str:
    """Полностью заменить план новым списком задач (например, после импорта Excel).

    Каждый элемент списка: {name, description, assignee, duration, predecessors}
    где predecessors — список ИМЁН задач (не id) из этого же списка.
    """
    _load_raw(tasks)
    return f"Загружено задач: {len(plan_state.tasks)}"


@mcp.tool()
def add_task(
    name: str,
    description: str = "",
    assignee: str = "",
    duration: int = 1,
    predecessors: Optional[list[str]] = None,
) -> dict:
    """Добавить новую задачу в план. predecessors — список имён или id существующих задач."""
    _seed_if_empty()
    tid = plan_state.next_id()
    resolved_preds = []
    for p in (predecessors or []):
        try:
            resolved_preds.append(plan_state.resolve(p))
        except KeyError:
            pass  # неизвестный предшественник молча игнорируется (MVP-упрощение)

    plan_state.tasks[tid] = Task(
        id=tid, name=name, description=description, assignee=assignee,
        duration=duration, predecessors=resolved_preds,
    )
    plan_state.recompute()
    return _task_to_dict(plan_state.tasks[tid])


@mcp.tool()
def update_task(
    task_id: str,
    name: Optional[str] = None,
    description: Optional[str] = None,
    assignee: Optional[str] = None,
    duration: Optional[int] = None,
) -> dict:
    """Обновить поля существующей задачи (по id или по названию). Меняются только переданные поля."""
    tid = plan_state.resolve(task_id)
    t = plan_state.tasks[tid]
    if name is not None:
        t.name = name
    if description is not None:
        t.description = description
    if assignee is not None:
        t.assignee = assignee
    if duration is not None:
        t.duration = duration
    plan_state.recompute()
    return _task_to_dict(t)


@mcp.tool()
def set_dependencies(task_id: str, predecessors: list[str]) -> dict:
    """Заменить список предшественников (зависимостей) задачи. Элементы — имена или id задач."""
    tid = plan_state.resolve(task_id)
    resolved = []
    for p in predecessors:
        resolved.append(plan_state.resolve(p))
    if tid in resolved:
        raise ValueError("Задача не может зависеть сама от себя")
    plan_state.tasks[tid].predecessors = resolved
    plan_state.recompute()
    return _task_to_dict(plan_state.tasks[tid])


@mcp.tool()
def move_task(task_id: str, new_start: Optional[str] = None, shift_days: Optional[int] = None) -> dict:
    """Перенести задачу во времени.

    Указать ЛИБО new_start (дата в формате YYYY-MM-DD) — жёсткая новая дата начала,
    ЛИБО shift_days — сдвиг в днях относительно текущей вычисленной даты начала
    (отрицательное значение — сдвиг раньше). Если после переноса задача всё ещё
    нарушает зависимости, она будет автоматически придвинута планировщиком к
    ближайшей допустимой дате, а последующие задачи пересчитаны каскадно.
    """
    tid = plan_state.resolve(task_id)
    t = plan_state.tasks[tid]
    plan_state.recompute()  # чтобы t.start было актуальным перед сдвигом

    if new_start is not None:
        t.manual_start = date.fromisoformat(new_start)
    elif shift_days is not None:
        base = t.start or plan_state.anchor_date
        t.manual_start = base + timedelta(days=shift_days)
    else:
        raise ValueError("Нужно указать new_start или shift_days")

    plan_state.recompute()
    return _task_to_dict(t)


@mcp.tool()
def reassign_task(task_id: str, assignee: str) -> dict:
    """Сменить исполнителя задачи."""
    tid = plan_state.resolve(task_id)
    plan_state.tasks[tid].assignee = assignee
    plan_state.recompute()
    return _task_to_dict(plan_state.tasks[tid])


@mcp.tool()
def delete_task(task_id: str) -> str:
    """Удалить задачу из плана. Также убирает её из зависимостей других задач."""
    tid = plan_state.resolve(task_id)
    del plan_state.tasks[tid]
    for t in plan_state.tasks.values():
        t.predecessors = [p for p in t.predecessors if p != tid]
    plan_state.recompute()
    return f"Задача {tid} удалена"


if __name__ == "__main__":
    mcp.run()
