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
        backgroundColor: "#e8a33d",
        backgroundSelectedColor: "#f0af54",
        progressColor: "#c98a2e",
        progressSelectedColor: "#c98a2e",
      },
    }));
}

export default function GanttChart({ tasks, onSelectTask }) {
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
      <Gantt
        tasks={ganttTasks}
        viewMode={ViewMode.Day}
        listCellWidth="180"
        columnWidth={40}
        onClick={(task) => onSelectTask(task.id)}
        onDoubleClick={(task) => onSelectTask(task.id)}
      />
    </div>
  );
}
