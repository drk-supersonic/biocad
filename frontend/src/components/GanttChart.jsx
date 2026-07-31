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
const PERIOD_COL_WIDTH = 176;

// Полная "вт, 18 авг. 2026 г. - чт, 20 авг. 2026 г." с днём недели с обеих
// сторон — это ~40 символов и колонке пришлось бы стать ШИРЕ, чем две
// прежние колонки дат вместе (то есть отнять место у диаграммы, а не
// добавить). Год и день недели у обеих дат почти всегда избыточны при
// показе диапазона — здесь день недели убран, а год показан один раз в
// конце, если обе даты попадают в один год (иначе — у обеих). Это и даёт
// реальную экономию ширины, которую просили, при этом ничего важного не
// теряется.
function formatPeriod(start, end) {
  const sameYear = start.getFullYear() === end.getFullYear();
  const startOpts = sameYear
    ? { day: "numeric", month: "short" }
    : { day: "numeric", month: "short", year: "numeric" };
  const endOpts = { day: "numeric", month: "short", year: "numeric" };
  return (
    start.toLocaleDateString("ru", startOpts) +
    " – " +
    end.toLocaleDateString("ru", endOpts)
  );
}

function pluralDays(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "день";
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return "дня";
  return "дней";
}

// Свой тултип вместо дефолтного: у библиотеки он на английском ("Duration:
// N day(s)"), с датами в формате "2-8-2026", уродливой тенью без скругления
// и лишним пустым абзацем внизу (дефолтный компонент всегда рендерит блок
// под прогресс, даже когда его нет — отсюда "лишний воздух"). Прогресс мы
// не используем (задачи правятся только через чат), поэтому просто не
// рендерим этот блок вовсе.
function TaskTooltip({ task, fontSize, fontFamily }) {
  const days = Math.max(1, Math.round((task.end - task.start) / 86400000));
  return (
    <div className="gantt-tooltip" style={{ fontSize, fontFamily }}>
      <div className="gantt-tooltip__title">{task.name}</div>
      <div className="gantt-tooltip__dates">{formatPeriod(task.start, task.end)}</div>
      <div className="gantt-tooltip__duration">
        Длительность: {days} {pluralDays(days)}
      </div>
    </div>
  );
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
      <div className="gantt-list-header__cell gantt-list-header__cell--date" style={{ width: PERIOD_COL_WIDTH }}>
        Период
      </div>
    </div>
  );
}

// Свой TaskListTable вместо дефолтного: у библиотеки name-ячейка не
// обрезается многоточием на деле, потому что внутри table-cell стоит
// display:flex без min-width:0 — флекс-контейнер не сжимается и текст
// вылезает поверх соседней колонки на длинных названиях задач. Здесь
// сжатие явно разрешено (min-width: 0 в CSS), плюс компактный формат дат.
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
          <div className="gantt-list-cell gantt-list-cell--date" style={{ width: PERIOD_COL_WIDTH }}>
            {formatPeriod(t.start, t.end)}
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
        headerHeight={62}
        TaskListHeader={TaskListHeader}
        TaskListTable={TaskListTable}
        TooltipContent={TaskTooltip}
        todayColor="rgba(109, 94, 244, 0.08)"
        onClick={(task) => onSelectTask(task.id)}
        onDoubleClick={(task) => onSelectTask(task.id)}
      />
    </div>
  );
}
