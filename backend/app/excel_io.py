from __future__ import annotations

import io

import pandas as pd

from .models import Task

COLUMNS = ["задача", "описание", "исполнитель", "длительность", "предшественники"]


def parse_excel(file_bytes: bytes) -> list[dict]:
    """Парсит Excel в формате из ТЗ и возвращает список "сырых" задач
    (ещё без id/расписания) — по имени, с предшественниками как списком имён.
    """
    df = pd.read_excel(io.BytesIO(file_bytes))
    df.columns = [str(c).strip().lower() for c in df.columns]

    missing = [c for c in COLUMNS if c not in df.columns]
    if missing:
        raise ValueError(f"В файле отсутствуют колонки: {', '.join(missing)}")

    tasks: list[dict] = []
    for _, row in df.iterrows():
        raw_pred = row.get("предшественники")
        if pd.isna(raw_pred) or str(raw_pred).strip() == "":
            predecessors: list[str] = []
        else:
            predecessors = [p.strip() for p in str(raw_pred).split(",") if p.strip()]

        tasks.append({
            "name": str(row["задача"]).strip(),
            "description": "" if pd.isna(row.get("описание")) else str(row["описание"]).strip(),
            "assignee": "" if pd.isna(row.get("исполнитель")) else str(row["исполнитель"]).strip(),
            "duration": int(row["длительность"]),
            "predecessors": predecessors,
        })
    return tasks


def build_excel(tasks: list[Task]) -> bytes:
    """Собирает Excel обратно в исходном формате колонок из ТЗ.
    Зависимости экспортируются по именам задач (человекочитаемо)."""
    by_id = {t.id: t for t in tasks}

    rows = []
    for t in tasks:
        pred_names = [by_id[p].name for p in t.predecessors if p in by_id]
        rows.append({
            "задача": t.name,
            "описание": t.description,
            "исполнитель": t.assignee,
            "длительность": t.duration,
            "предшественники": ", ".join(pred_names),
            "начало": t.start.isoformat() if t.start else "",
            "окончание": t.finish.isoformat() if t.finish else "",
        })

    df = pd.DataFrame(rows, columns=COLUMNS + ["начало", "окончание"])
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="План")
    return buf.getvalue()
