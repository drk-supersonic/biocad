import { useState, useRef, useEffect } from "react";
import { sendChatMessage } from "../api.js";

export default function ChatPanel({ apiKey, onTasksUpdated }) {
  const [messages, setMessages] = useState([
    {
      role: "system",
      content:
        "Опиши, что изменить в плане: перенести задачу, поменять зависимости, добавить задачу, сменить исполнителя.",
    },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current?.scrollTo) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages, sending]);

  async function handleSubmit(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    if (!apiKey.trim()) {
      setMessages((prev) => [
        ...prev,
        { role: "user", content: text },
        { role: "error", content: "Сначала введи ключ OpenRouter в поле сверху." },
      ]);
      setInput("");
      return;
    }

    const history = messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setInput("");
    setSending(true);

    try {
      const data = await sendChatMessage(text, history, apiKey);
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
      onTasksUpdated(data.tasks);
    } catch (err) {
      setMessages((prev) => [...prev, { role: "error", content: err.message }]);
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  return (
    <div className="chat-panel">
      <div className="chat-panel__header">Чат редактирования плана</div>
      <div className="chat-panel__messages" ref={scrollRef}>
        {messages.map((m, i) => (
          <div key={i} className={`chat-msg chat-msg--${m.role}`}>
            {m.content}
          </div>
        ))}
        {sending && (
          <div className="chat-msg chat-msg--assistant">
            <span className="typing-dots">
              <span /><span /><span />
            </span>
          </div>
        )}
      </div>
      <form className="chat-panel__form" onSubmit={handleSubmit}>
        <textarea
          className="input"
          placeholder="Например: перенеси тестирование на 2 дня позже"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={sending}
        />
        <button className="btn btn--primary" type="submit" disabled={sending || !input.trim()}>
          Отправить
        </button>
      </form>
    </div>
  );
}
