from __future__ import annotations

from collections import deque
from datetime import date, timedelta

from .models import Task


class ScheduleError(ValueError):
    pass


def _add_workdays(start: date, days: int) -> date:
    """Простая версия: без учёта выходных, длительность в календарных днях.
    Оставлено как осознанный технический долг для MVP (см. Roadmap to production).
    """
    return start + timedelta(days=days)


def compute_schedule(tasks: dict[str, Task], anchor_date: date) -> None:
    """Пересчитывает start/finish всех задач по зависимостям (finish-to-start).

    Правило: effective_start(t) = max(manual_start(t) or anchor_date,
                                       max(finish(p) for p in predecessors(t)))
    finish(t) = effective_start(t) + duration(t)

    Мутирует переданные Task in-place. Бросает ScheduleError при цикле
    зависимостей или ссылке на несуществующий id.
    """
    # Валидация ссылок
    for t in tasks.values():
        for p in t.predecessors:
            if p not in tasks:
                raise ScheduleError(f"Задача {t.id} ссылается на несуществующего предшественника {p}")

    # Топологическая сортировка (Kahn)
    indegree = {tid: 0 for tid in tasks}
    children: dict[str, list[str]] = {tid: [] for tid in tasks}
    for t in tasks.values():
        for p in t.predecessors:
            indegree[t.id] += 1
            children[p].append(t.id)

    queue = deque([tid for tid, deg in indegree.items() if deg == 0])
    order: list[str] = []
    indegree_work = dict(indegree)
    while queue:
        tid = queue.popleft()
        order.append(tid)
        for child in children[tid]:
            indegree_work[child] -= 1
            if indegree_work[child] == 0:
                queue.append(child)

    if len(order) != len(tasks):
        raise ScheduleError("Обнаружен цикл в зависимостях задач")

    for tid in order:
        t = tasks[tid]
        earliest = t.manual_start or anchor_date
        for p in t.predecessors:
            pf = tasks[p].finish
            if pf is not None and pf > earliest:
                earliest = pf
        t.start = earliest
        t.finish = _add_workdays(earliest, t.duration)
