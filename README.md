# Gantt AI Planner

Full-stack тестовое задание: интерактивная диаграмма Гантта с редактированием
плана через чат на естественном языке (LLM + MCP).

## Структура репозитория

```
backend/       FastAPI + MCP-сервер, см. backend/README.md
frontend/      React + диаграмма Гантта + чат, см. frontend/README.md
render.yaml    Blueprint для деплоя на Render (backend: Web Service, frontend: Static Site)
ROADMAP.md     Что нужно доработать для боевого состояния: техдолг, риски, план
```

## Архитектура (кратко)

- **Бэкенд**: FastAPI-хост + MCP-сервер (`FastMCP`) в одном процессе,
  соединены через in-memory MCP-transport (без отдельного OS-процесса и
  stdio). REST-эндпоинты (`/api/tasks`, `/api/upload-excel`,
  `/api/export-excel`) — прямые вызовы; `/api/chat` — та же MCP-сессия,
  но вызовы инструментов инициирует LLM (OpenRouter, tool-calling).
  Подробности — `backend/README.md`.
- **Фронтенд**: React + `gantt-task-react` для диаграммы, чат-панель и
  модалка задачи. Вся правда о плане — на бэкенде, фронт только
  отображает и шлёт команды. Подробности — `frontend/README.md`.

## Деплой

Через Render Blueprint (`render.yaml` в корне):
1. dashboard.render.com → New → Blueprint → подключить этот репозиторий.
2. Render создаст два сервиса: `gantt-backend` (Web Service) и `gantt-frontend`
   (Static Site) — переменные окружения уже прописаны в `render.yaml`.
3. Ключ OpenRouter **не** прописывается на бэкенде — пользователь вводит его
   в поле в интерфейсе, он уходит в теле запроса `/api/chat` и нигде на
   сервере не сохраняется (см. `backend/README.md`).
4. Если имена `gantt-backend`/`gantt-frontend` уже заняты на Render — он
   добавит случайный суффикс к URL; тогда поправь `CORS_ORIGINS` в backend и
   `VITE_API_URL` в frontend на реальные адреса и сделай redeploy.

Известное ограничение текущего деплоя (бесплатный план Render, "холодный
старт" после простоя) описано в `ROADMAP.md`.

## Локальный запуск

См. `backend/README.md` и `frontend/README.md` — запускать нужно оба
(бэкенд первым).

## Использование AI-ассистентов при разработке

<!-- TODO: заполнить от первого лица — какие ассистенты использовались
(например, Claude), для каких задач (архитектура, конкретные баги,
рефакторинг, ревью кода, дизайн интерфейса), что бралось как есть, а что
переписывалось руками, и как проверялась предложенная логика (тесты,
ручная проверка сценария). -->

