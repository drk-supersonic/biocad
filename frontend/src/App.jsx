import { useState, useEffect, useCallback, useRef } from "react";
import GanttChart from "./components/GanttChart.jsx";
import ChatPanel from "./components/ChatPanel.jsx";
import TaskModal from "./components/TaskModal.jsx";
import { fetchTasks, uploadExcel, exportExcelUrl } from "./api.js";

export default function App() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [apiKey, setApiKey] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTasks();
      setTasks(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const data = await uploadExcel(file);
      setTasks(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  const tasksById = Object.fromEntries(tasks.map((t) => [t.id, t]));
  const selectedTask = selectedTaskId ? tasksById[selectedTaskId] : null;

  return (
    <div className="app">
      <header className="toolbar">
        <div className="toolbar__title">
          Gantt <span>AI</span> Planner
        </div>

        <div className="toolbar__group">
          <button
            className="btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? "Загрузка…" : "Загрузить Excel"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            style={{ display: "none" }}
            onChange={handleFileChange}
          />
          <a className="btn" href={exportExcelUrl()} download>
            Экспорт в Excel
          </a>
        </div>

        <div className="toolbar__spacer" />

        <div className="api-key-field">
          <input
            className="input"
            type="password"
            placeholder="Ключ OpenRouter (для чата)"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            autoComplete="off"
          />
          <span className={`api-key-field__status ${apiKey.trim() ? "api-key-field__status--ok" : ""}`} />
        </div>
      </header>

      {error && (
        <div className="chat-msg chat-msg--error" style={{ margin: "12px 20px 0" }}>
          {error}
        </div>
      )}

      <div className="main">
        <div className="gantt-pane">
          {loading ? (
            <div className="gantt-pane__empty">Загружаю план…</div>
          ) : tasks.length === 0 ? (
            <div className="empty-state">
              <h2>Задач пока нет</h2>
              <p>Загрузи Excel с планом или подожди — сервер засеет тестовые данные при первом обращении.</p>
            </div>
          ) : (
            <GanttChart tasks={tasks} onSelectTask={setSelectedTaskId} />
          )}
        </div>

        <ChatPanel apiKey={apiKey} onTasksUpdated={setTasks} />
      </div>

      <TaskModal task={selectedTask} tasksById={tasksById} onClose={() => setSelectedTaskId(null)} />
    </div>
  );
}
