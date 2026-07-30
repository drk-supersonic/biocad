import { useState } from "react";
import { Gantt, ViewMode } from "gantt-task-react";

/**
 * Конвертирует наши задачи (id/name/start/finish/predecessors) в формат,
 * который ожидает gantt-task-react (start/end как Date, dependencies).
 * Задачи без вычисленного расписания (start/finish == null) пропускаются —
 * такое возможно на долю секунды сразу после мутации до пересчёта на бэке.
 */
function toGanttTasks(tasks) {
  return tasks
    .filter((t) => t.start && t.finish)
    .map((t) => ({
      id: t.id,
      name: t.name,
      start: new Date(t.start),
      end: new Date(t.finish),
      type: "task",
      progress: 0,
      dependencies: t.predecessors || [],
      isDisabled: true, // редактирование — только через чат, не drag-n-drop
      styles: {
        backgroundColor: "#6d5ef4",
        backgroundSelectedColor: "#8677f7",
        progressColor: "#564adf",
        progressSelectedColor: "#564adf",
      },
    }));
}

// Ширины колонок левой таблицы задаются нами, а не listCellWidth-проп'ом
// библиотеки: реальная ширина всё равно измеряется библиотекой через ref
// после рендера (см. offsetWidth в исходниках gantt-task-react), так что
// колонки можно делать разной ширины без последствий для позиционирования
// самой диаграммы справа.
const NAME_COL_WIDTH = 160;
const DATE_COL_WIDTH = 136;

function formatShortDate(date) {
  // month: "short" в ru-локали сам даёт "11 авг. 2026 г." — короче, чем
  // дефолтный "long" у библиотеки ("11 августа 2026 г."), и освобождает
  // место под саму диаграмму.
  return date.toLocaleDateString("ru", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// Библиотека сама локализует названия дней недели и месяцев в шапке
// диаграммы через стандартный Intl (см. проп locale ниже), но заголовки
// левой таблицы ("Name" / "From" / "To") у неё захардкожены на английском
// и локалью не управляются — задаём их отдельным компонентом.
function TaskListHeader({ headerHeight, fontFamily, fontSize }) {
  return (
    <div
      className="gantt-list-header"
      style={{ fontFamily, fontSize, height: headerHeight }}
    >
      <div className="gantt-list-header__cell" style={{ width: NAME_COL_WIDTH }}>
        Задача
      </div>
      <div className="gantt-list-header__cell" style={{ width: DATE_COL_WIDTH }}>
        Начало
      </div>
      <div className="gantt-list-header__cell" style={{ width: DATE_COL_WIDTH }}>
        Окончание
      </div>
    </div>
  );
}

// Свой TaskListTable вместо дефолтного: у библиотеки name-ячейка не
// обрезается многоточием на деле, потому что внутри table-cell стоит
// display:flex без min-width:0 — флекс-контейнер не сжимается и текст
// вылезает поверх соседней колонки на длинных названиях задач. Здесь
// сжатие явно разрешено (min-width: 0 в CSS), плюс короткий формат дат.
function TaskListTable({ rowHeight, tasks }) {
  return (
    <div className="gantt-list-table">
      {tasks.map((t) => (
        <div className="gantt-list-row" style={{ height: rowHeight }} key={t.id}>
          <div
            className="gantt-list-cell gantt-list-cell--name"
            style={{ width: NAME_COL_WIDTH }}
            title={t.name}
          >
            <span className="gantt-list-cell__truncate">{t.name}</span>
          </div>
          <div className="gantt-list-cell gantt-list-cell--date" style={{ width: DATE_COL_WIDTH }}>
            {formatShortDate(t.start)}
          </div>
          <div className="gantt-list-cell gantt-list-cell--date" style={{ width: DATE_COL_WIDTH }}>
            {formatShortDate(t.end)}
          </div>
        </div>
      ))}
    </div>
  );
}

const VIEW_MODES = [
  { mode: ViewMode.Day, label: "День" },
  { mode: ViewMode.Week, label: "Неделя" },
  { mode: ViewMode.Month, label: "Месяц" },
];

export default function GanttChart({ tasks, onSelectTask }) {
  const [viewMode, setViewMode] = useState(ViewMode.Day);
  const ganttTasks = toGanttTasks(tasks);

  if (ganttTasks.length === 0) {
    return (
      <div className="gantt-pane__empty">
        Нет задач с рассчитанным расписанием
      </div>
    );
  }

  return (
    <div className="gantt-card">
      <div className="gantt-card__toolbar">
        {VIEW_MODES.map(({ mode, label }) => (
          <button
            key={mode}
            type="button"
            className={`gantt-view-btn ${viewMode === mode ? "gantt-view-btn--active" : ""}`}
            onClick={() => setViewMode(mode)}
          >
            {label}
          </button>
        ))}
      </div>
      <Gantt
        tasks={ganttTasks}
        viewMode={viewMode}
        locale="ru"
        listCellWidth={`${NAME_COL_WIDTH}px`}
        TaskListHeader={TaskListHeader}
        TaskListTable={TaskListTable}
        todayColor="rgba(109, 94, 244, 0.08)"
        onClick={(task) => onSelectTask(task.id)}
        onDoubleClick={(task) => onSelectTask(task.id)}
      />
    </div>
  );
}
