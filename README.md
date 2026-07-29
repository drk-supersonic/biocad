# Gantt AI Planner

Full-stack тестовое задание: интерактивная диаграмма Гантта с редактированием
плана через чат на естественном языке (LLM + MCP).

## Структура репозитория

```
backend/    FastAPI + MCP-сервер (готово, см. backend/README.md)
frontend/   React + диаграмма Гантта + чат (в разработке)
render.yaml Blueprint для деплоя на Render (backend: Web Service, frontend: Static Site)
```

## Деплой

Через Render Blueprint (`render.yaml` в корне):
1. dashboard.render.com → New → Blueprint → подключить этот репозиторий.
2. Render создаст два сервиса: `gantt-backend` (Web Service) и `gantt-frontend`
   (Static Site).
3. В `gantt-backend` → Environment вписать `OPENROUTER_API_KEY` (не хранится в репо).
4. Если имена `gantt-backend`/`gantt-frontend` уже заняты на Render — он
   добавит случайный суффикс к URL; тогда поправь `CORS_ORIGINS` в backend и
   `VITE_API_URL` в frontend на реальные адреса и сделай redeploy.

## Локальный запуск — см. backend/README.md (frontend/README.md появится после сборки фронта)
