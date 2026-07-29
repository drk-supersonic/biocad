function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "short", year: "numeric" });
}

export default function TaskModal({ task, tasksById, onClose }) {
  if (!task) return null;

  const predecessorNames = (task.predecessors || [])
    .map((id) => tasksById[id]?.name || id)
    .join(", ") || "нет";

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal__header">
          <div>
            <h2 className="modal__title">{task.name}</h2>
            <div className="modal__id">{task.id}</div>
          </div>
          <button className="modal__close" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>

        {task.description && (
          <div className="modal__field">
            <div className="modal__field-label">Описание</div>
            <div className="modal__field-value">{task.description}</div>
          </div>
        )}

        <div className="modal__grid">
          <div className="modal__field">
            <div className="modal__field-label">Исполнитель</div>
            <div className="modal__field-value">
              <span className="badge">{task.assignee || "не назначен"}</span>
            </div>
          </div>
          <div className="modal__field">
            <div className="modal__field-label">Длительность</div>
            <div className="modal__field-value">{task.duration} дн.</div>
          </div>
          <div className="modal__field">
            <div className="modal__field-label">Начало</div>
            <div className="modal__field-value">{formatDate(task.start)}</div>
          </div>
          <div className="modal__field">
            <div className="modal__field-label">Окончание</div>
            <div className="modal__field-value">{formatDate(task.finish)}</div>
          </div>
        </div>

        <div className="modal__field">
          <div className="modal__field-label">Зависит от</div>
          <div className="modal__field-value">{predecessorNames}</div>
        </div>
      </div>
    </div>
  );
}
