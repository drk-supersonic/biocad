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

// Библиотека сама локализует названия дней недели и месяцев в шапке
// диаграммы через стандартный Intl (см. проп locale ниже), но заголовки
// левой таблицы ("Name" / "From" / "To") у неё захардкожены на английском
// и локалью не управляются — задаём их отдельным компонентом.
function TaskListHeader({ headerHeight, rowWidth, fontFamily, fontSize }) {
  return (
    <div
      className="gantt-list-header"
      style={{ fontFamily, fontSize, height: headerHeight - 2 }}
    >
      <div className="gantt-list-header__cell" style={{ minWidth: rowWidth }}>
        Задача
      </div>
      <div className="gantt-list-header__cell" style={{ minWidth: rowWidth }}>
        Начало
      </div>
      <div className="gantt-list-header__cell" style={{ minWidth: rowWidth }}>
        Окончание
      </div>
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
        TaskListHeader={TaskListHeader}
        todayColor="rgba(109, 94, 244, 0.08)"
        onClick={(task) => onSelectTask(task.id)}
        onDoubleClick={(task) => onSelectTask(task.id)}
      />
    </div>
  );
}
