import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import GanttChart from "../components/GanttChart.jsx";
import TaskModal from "../components/TaskModal.jsx";
import ChatPanel from "../components/ChatPanel.jsx";

const sampleTasks = [
  { id: "T001", name: "Сбор требований", description: "Интервью", assignee: "Ирина",
    duration: 3, predecessors: [], start: "2026-07-29", finish: "2026-08-01" },
  { id: "T002", name: "Дизайн интерфейса", description: "Прототипы", assignee: "Павел",
    duration: 5, predecessors: ["T001"], start: "2026-08-01", finish: "2026-08-06" },
];

// gantt-task-react использует ResizeObserver и getBoundingClientRect — в jsdom их нет по умолчанию
beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  // jsdom не реализует SVG-геометрию — в реальных браузерах она есть.
  SVGElement.prototype.createSVGPoint = () => ({
    x: 0,
    y: 0,
    matrixTransform: () => ({ x: 0, y: 0 }),
  });
  SVGElement.prototype.getScreenCTM = () => ({ inverse: () => ({}) });
  SVGElement.prototype.getBBox = () => ({ x: 0, y: 0, width: 100, height: 20 });
});

describe("GanttChart", () => {
  it("рендерит без ошибок и показывает названия задач", () => {
    const onSelect = vi.fn();
    render(<GanttChart tasks={sampleTasks} onSelectTask={onSelect} />);
    expect(screen.getAllByText("Сбор требований").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Дизайн интерфейса").length).toBeGreaterThan(0);
  });

  it("показывает заглушку, если задач с расписанием нет", () => {
    render(<GanttChart tasks={[]} onSelectTask={vi.fn()} />);
    expect(screen.getByText(/Нет задач/)).toBeTruthy();
  });

  it("не зацикливается на длинном названии задачи в узком баре (регресс на баг усечения текста)", () => {
    // Раньше эффект усечения текста бара мог войти в бесконечный ре-рендер
    // (label !== task.name всегда истинно после усечения, а label стоял в
    // зависимостях эффекта) — React в этом случае бросает "Maximum update
    // depth exceeded", и render() ниже упал бы с ошибкой.
    const longNameTasks = [
      {
        id: "T001",
        name: "Очень длинное название задачи, которое точно не влезает в узкий однодневный бар на диаграмме",
        description: "",
        assignee: "Кто-то",
        duration: 1,
        predecessors: [],
        start: "2026-07-29",
        finish: "2026-07-30",
      },
    ];
    expect(() => {
      render(<GanttChart tasks={longNameTasks} onSelectTask={vi.fn()} />);
    }).not.toThrow();
  });
});

describe("TaskModal", () => {
  it("показывает детали выбранной задачи", () => {
    const tasksById = Object.fromEntries(sampleTasks.map((t) => [t.id, t]));
    render(<TaskModal task={sampleTasks[1]} tasksById={tasksById} onClose={vi.fn()} />);
    expect(screen.getByText("Дизайн интерфейса")).toBeTruthy();
    expect(screen.getByText("Сбор требований")).toBeTruthy(); // предшественник по имени
    expect(screen.getByText("Павел")).toBeTruthy();
  });

  it("ничего не рендерит, если задача не выбрана", () => {
    const { container } = render(<TaskModal task={null} tasksById={{}} onClose={vi.fn()} />);
    expect(container.innerHTML).toBe("");
  });
});

describe("ChatPanel", () => {
  it("просит ввести ключ, если он пуст", () => {
    render(<ChatPanel apiKey="" onTasksUpdated={vi.fn()} />);
    const textarea = screen.getByPlaceholderText(/перенеси тестирование/);
    fireEvent.change(textarea, { target: { value: "перенеси задачу" } });
    fireEvent.click(screen.getByRole("button", { name: "Отправить" }));
    return screen.findByText(/ключ OpenRouter/);
  });
});
