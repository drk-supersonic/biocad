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

- `app/mcp_server.py` — MCP-сервер (FastMCP, stdio transport). Держит
  единственный источник истины по плану (`app/state.py`) и экспортирует
  инструменты `list_tasks`, `load_tasks`, `add_task`, `update_task`,
  `set_dependencies`, `move_task`, `reassign_task`, `delete_task`.
  Запускается как **отдельный процесс**, а не как часть FastAPI-приложения.
- `app/main.py` — FastAPI-хост. При старте (`lifespan`) поднимает
  `mcp_server.py` дочерним процессом через `stdio_client` и держит с ним
  живую `ClientSession` на всё время жизни приложения. REST-эндпоинты
  (`/api/tasks`, `/api/upload-excel`, `/api/export-excel`) — это просто
  прямые вызовы MCP-инструментов из кода (не через LLM).
- `app/llm_client.py` — для `/api/chat`: забирает список MCP-инструментов,
  конвертирует их схему в OpenAI-совместимый `tools`, отправляет в LLM
  через OpenRouter с `tool_choice="auto"`, в цикле исполняет вызовы через
  ту же MCP-сессию, пока модель не ответит текстом.
- `app/scheduler.py` — пересчёт дат: topological sort + правило
  finish-to-start с учётом ручного сдвига (`manual_start`). Каскадно
  сдвигает всех потомков при переносе задачи.

## Почему MCP как отдельный процесс, а не просто функции в FastAPI

Чтобы LLM реально общался с планом через MCP-протокол (как того требует
ТЗ), а не просто дергал обычные python-функции под видом «MCP». Это
честнее и, как бонус, позволяет в будущем подключить тот же MCP-сервер
к другому клиенту (например, Claude Desktop) без изменений.
