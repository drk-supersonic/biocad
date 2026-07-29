from __future__ import annotations

from datetime import date

from .models import Task
from .scheduler import compute_schedule


class PlanState:
    def __init__(self) -> None:
        self.tasks: dict[str, Task] = {}
        self.anchor_date: date = date.today()
        self._counter = 0

    def next_id(self) -> str:
        self._counter += 1
        return f"T{self._counter:03d}"

    def recompute(self) -> None:
        compute_schedule(self.tasks, self.anchor_date)

    def resolve(self, ref: str) -> str:
        """Находит id задачи по id или по имени (регистронезависимо).
        Нужно, потому что LLM/пользователь чаще ссылаются на задачи по названию."""
        if ref in self.tasks:
            return ref
        ref_lower = ref.strip().lower()
        for t in self.tasks.values():
            if t.name.strip().lower() == ref_lower:
                return t.id
        raise KeyError(f"Задача не найдена: {ref!r}")

    def clear(self) -> None:
        self.tasks.clear()
        self._counter = 0


# Единственный экземпляр состояния на процесс MCP-сервера.
plan_state = PlanState()
