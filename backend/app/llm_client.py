"""Оркестрация LLM + MCP.

Поток:
1. Забираем список инструментов у MCP-сервера (session.list_tools()).
2. Конвертируем их в OpenAI-совместимый формат tools (OpenRouter поддерживает
   этот же контракт для большинства моделей, включая Claude/GPT/Gemini).
3. Отправляем сообщение пользователя + историю + tools в LLM.
4. Если модель просит вызвать инструмент — вызываем его через MCP-сессию
   (session.call_tool), результат кладём обратно в историю сообщений и
   повторяем запрос к модели. Цикл до тех пор, пока модель не ответит текстом
   или не будет достигнут лимит итераций (защита от зацикливания).
"""
from __future__ import annotations

import json
import os

import httpx
from mcp import ClientSession

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
MODEL = os.environ.get("OPENROUTER_MODEL", "google/gemini-3-flash-preview")
MAX_TOOL_ITERATIONS = 6

# Ключ OpenRouter НЕ хранится на сервере — пользователь вводит его в интерфейсе,
# фронт присылает его в теле каждого запроса к /api/chat, бэкенд использует его
# только для этого одного запроса и нигде не сохраняет (ни в БД, ни на диске,
# ни в логах). Тот же паттерн, что в contact-extractor.

SYSTEM_PROMPT = (
    "Ты — ассистент по управлению планом проекта (диаграмма Гантта). "
    "У тебя есть инструменты для чтения и редактирования плана. "
    "Все инструменты принимают ссылку на задачу (task_id) как её id ИЛИ "
    "как точное название — поиск по названию регистронезависимый и делается "
    "на стороне инструмента. Если пользователь упомянул название задачи "
    "(даже в другом регистре или падеже, близко к оригиналу) — сразу вызывай "
    "инструмент с этим названием, не переспрашивай и не проси уточнить id. "
    "Пользователь пишет на естественном языке, что нужно изменить "
    "(перенести задачу, поменять зависимости, добавить задачу, "
    "сменить исполнителя и т.д.). Разбей запрос на конкретные вызовы "
    "инструментов, выполни их, затем кратко (1-3 предложения, по-русски) "
    "опиши, что именно изменилось в плане. Если запрос неоднозначен — "
    "сделай наиболее разумное предположение и упомяни его в ответе, "
    "не переспрашивай."
)


def _mcp_tools_to_openai_format(mcp_tools: list) -> list[dict]:
    result = []
    for tool in mcp_tools:
        result.append({
            "type": "function",
            "function": {
                "name": tool.name,
                "description": tool.description or "",
                "parameters": tool.inputSchema or {"type": "object", "properties": {}},
            },
        })
    return result


# Набор инструментов статичен на всё время жизни процесса (один mcp_server,
# один набор @mcp.tool()), поэтому схему достаточно спросить у сервера один
# раз и переиспользовать — вместо запроса list_tools() на каждый ход чата.
_tools_cache: list[dict] | None = None


async def _call_openrouter(messages: list[dict], tools: list[dict], api_key: str) -> dict:
    if not api_key or not api_key.strip():
        raise RuntimeError("Не передан ключ OpenRouter. Введи его в поле на странице.")
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            OPENROUTER_URL,
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "model": MODEL,
                "messages": messages,
                "tools": tools,
                "tool_choice": "auto",
            },
        )
        resp.raise_for_status()
        return resp.json()


async def run_chat_turn(
    session: ClientSession,
    user_message: str,
    history: list[dict],
    api_key: str,
) -> str:
    """Прогоняет один ход чата: пользователь -> (LLM + MCP tool loop) -> текстовый ответ."""
    global _tools_cache
    if _tools_cache is None:
        mcp_tools_resp = await session.list_tools()
        _tools_cache = _mcp_tools_to_openai_format(mcp_tools_resp.tools)
    tools = _tools_cache

    messages: list[dict] = [{"role": "system", "content": SYSTEM_PROMPT}]
    messages.extend(history)
    messages.append({"role": "user", "content": user_message})

    for _ in range(MAX_TOOL_ITERATIONS):
        data = await _call_openrouter(messages, tools, api_key)
        choice = data["choices"][0]["message"]
        tool_calls = choice.get("tool_calls")

        if not tool_calls:
            return choice.get("content") or "(пустой ответ модели)"

        messages.append(choice)
        for call in tool_calls:
            fn = call["function"]
            try:
                args = json.loads(fn["arguments"] or "{}")
            except json.JSONDecodeError:
                args = {}
            try:
                tool_result = await session.call_tool(fn["name"], args)
                content = "\n".join(
                    block.text for block in tool_result.content if hasattr(block, "text")
                )
            except Exception as exc:  # noqa: BLE001 — отдаём ошибку модели, пусть исправится
                content = f"Ошибка при вызове инструмента: {exc}"

            messages.append({
                "role": "tool",
                "tool_call_id": call["id"],
                "content": content,
            })

    return "Не удалось завершить обработку запроса за отведённое число шагов."
