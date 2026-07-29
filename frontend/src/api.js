const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

async function handleResponse(res) {
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const data = await res.json();
      detail = data.detail || JSON.stringify(data);
    } catch {
      // тело не JSON — оставляем statusText
    }
    throw new Error(detail);
  }
  return res.json();
}

export async function fetchTasks() {
  const res = await fetch(`${API_URL}/api/tasks`);
  return handleResponse(res);
}

export async function uploadExcel(file) {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_URL}/api/upload-excel`, {
    method: "POST",
    body: formData,
  });
  return handleResponse(res);
}

export function exportExcelUrl() {
  return `${API_URL}/api/export-excel`;
}

export async function sendChatMessage(message, history, apiKey) {
  const res = await fetch(`${API_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history, api_key: apiKey }),
  });
  return handleResponse(res);
}
