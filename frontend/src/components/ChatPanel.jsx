import { useState, useRef, useEffect, useMemo } from "react";
import { sendChatMessage } from "../api.js";

/**
 * Минимальный markdown для ответов ассистента: жирный текст, инлайн-код,
 * маркированные/нумерованные списки, абзацы. Без внешней библиотеки —
 * формат ответов LLM простой, полноценный markdown-парсер был бы избыточен.
 * Инпут сначала экранируется как текст (React делает это сам за счёт того,
 * что мы возвращаем строки, а не dangerouslySetInnerHTML), так что теги
 * внутри пользовательского/модельного текста не интерпретируются как HTML.
 */
 
function renderMarkdownLite(text) {
  const lines = text.split("\n");
  const blocks = [];
  let listBuffer = [];
  let listType = null;

  function renderInline(line, key) {
    const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
    return (
      <span key={key}>
        {parts.map((part, i) => {
          if (part.startsWith("**") && part.endsWith("**")) {
            return <strong key={i}>{part.slice(2, -2)}</strong>;
          }
          if (part.startsWith("`") && part.endsWith("`")) {
            return <code key={i} className="chat-msg__code">{part.slice(1, -1)}</code>;
          }
          return part;
        })}
      </span>
    );
  }

  function flushList() {
    if (listBuffer.length === 0) return;
    const Tag = listType === "ol" ? "ol" : "ul";
    blocks.push(
      <Tag key={blocks.length} className="chat-msg__list">
        {listBuffer.map((item, i) => (
          <li key={i}>{renderInline(item, i)}</li>
        ))}
      </Tag>
    );
    listBuffer = [];
    listType = null;
  }

  lines.forEach((line, idx) => {
    const bulletMatch = line.match(/^\s*[-*]\s+(.*)/);
    const numberedMatch = line.match(/^\s*\d+[.)]\s+(.*)/);

    if (bulletMatch) {
      if (listType !== "ul") flushList();
      listType = "ul";
      listBuffer.push(bulletMatch[1]);
    } else if (numberedMatch) {
      if (listType !== "ol") flushList();
      listType = "ol";
      listBuffer.push(numberedMatch[1]);
    } else {
      flushList();
      if (line.trim() === "") {
        blocks.push(<div key={`sp-${idx}`} className="chat-msg__spacer" />);
      } else {
        blocks.push(<p key={idx}>{renderInline(line, idx)}</p>);
      }
    }
  });
  flushList();
  return blocks;
}

function ChatMessage({ role, content }) {
  if (role === "user") {
    return (
      <div className="chat-msg chat-msg--user">
        <span>{content}</span>
      </div>
    );
  }
  if (role === "system") {
    return <div className="chat-msg chat-msg--system">{content}</div>;
  }
  if (role === "error") {
    return <div className="chat-msg chat-msg--error">{content}</div>;
  }
  // assistant — обычный текст без пузыря, с лёгким markdown
  return <div className="chat-msg chat-msg--assistant">{renderMarkdownLite(content)}</div>;
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 13V3M8 3L3.5 7.5M8 3L12.5 7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function ChatPanel({ apiKey, onTasksUpdated }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current?.scrollTo) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages, sending]);

  // Поле ввода растёт вместе с текстом, как в чате Claude, вместо
  // фиксированной высоты с внутренним скроллом.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  const canSend = useMemo(() => input.trim().length > 0 && !sending, [input, sending]);

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
          <ChatMessage key={i} role={m.role} content={m.content} />
        ))}
        {sending && (
          <div className="chat-msg chat-msg--assistant chat-msg--typing">
            <span className="typing-dots">
              <span /><span /><span />
            </span>
          </div>
        )}
      </div>
      <form className="chat-panel__form" onSubmit={handleSubmit}>
        <div className="chat-input-box">
          <textarea
            ref={textareaRef}
            className="chat-input-box__textarea"
            placeholder="Например: перенеси тестирование на 2 дня позже"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={sending}
            rows={1}
          />
          <button
            className="chat-send-btn"
            type="submit"
            disabled={!canSend}
            aria-label="Отправить"
          >
            <SendIcon />
          </button>
        </div>
      </form>
    </div>
  );
}
