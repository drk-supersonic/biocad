# Backend (FastAPI + MCP)

## Запуск локально

```bash
cd backend
python3 -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt

uvicorn app.main:app --reload --port 8000
```

Проверка: http://localhost:8000/api/tasks должен вернуть список засидированных задач.

**Ключ OpenRouter (https://openrouter.ai/keys) нигде на сервере не хранится** —
пользователь вводит его в поле на странице фронтенда, оно передаётся в теле
каждого запроса `POST /api/chat` (`{"message": ..., "api_key": ...}`) и
используется только на время этого запроса, не сохраняется ни в БД, ни на
диске, ни в логах.

## Архитектура (кратко)

- `app/mcp_server.py` — MCP-сервер (`FastMCP`). Держит единственный
  источник истины по плану (`app/state.py`) и экспортирует инструменты
  `list_tasks`, `load_tasks`, `add_task`, `update_task`, `set_dependencies`,
  `move_task`, `reassign_task`, `delete_task`.
- `app/main.py` — FastAPI-хост. При старте (`lifespan`) поднимает
  `ClientSession`, соединённую с MCP-сервером через **in-memory transport**
  (`mcp.shared.memory`) — сервер и клиент работают в одном процессе поверх
  memory-стримов, без отдельного OS-процесса и без stdio. Протокол MCP при
  этом настоящий: тот же `ClientSession`, тот же `list_tools()`/`call_tool()`.
  REST-эндпоинты (`/api/tasks`, `/api/upload-excel`, `/api/export-excel`) —
  прямые вызовы MCP-инструментов из кода (не через LLM).
- `app/llm_client.py` — для `/api/chat`: получает список MCP-инструментов
  (кэшируется один раз на процесс — набор тулов статичен), конвертирует
  схему в OpenAI-совместимый `tools`, отправляет в LLM через OpenRouter с
  `tool_choice="auto"`, в цикле исполняет вызовы через ту же MCP-сессию,
  пока модель не ответит текстом.
- `app/scheduler.py` — пересчёт дат: topological sort + правило
  finish-to-start с учётом ручного сдвига (`manual_start`). Каскадно
  сдвигает всех потомков при переносе задачи.

## Почему MCP, а не просто функции в FastAPI

Чтобы LLM реально общался с планом через MCP-протокол (как того требует
ТЗ), а не просто дергал обычные python-функции под видом «MCP». Сервер и
клиент живут в одном процессе (in-memory transport) — это дешевле по
ресурсам, чем отдельный OS-процесс на stdio, но протокол не подделывается:
это настоящая MCP-сессия с настоящими JSON-RPC вызовами. Как бонус, тот же
`mcp_server.py` можно позже подключить к другому MCP-клиенту (например,
Claude Desktop) через stdio без изменений в самом сервере.
