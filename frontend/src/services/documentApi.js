const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

export async function checkBackendHealth() {
  try {
    const res = await fetch(`${API_BASE_URL}/health`);
    if (!res.ok) return false;
    const data = await res.json();
    return data.status === "healthy";
  } catch {
    return false;
  }
}

export async function fetchTemplates() {
  const res = await fetch(`${API_BASE_URL}/api/documents/templates`);
  if (!res.ok) {
    throw new Error(`Failed to fetch templates: ${res.statusText}`);
  }
  return res.json();
}

export async function generateExecutiveMeet(payload) {
  const res = await fetch(`${API_BASE_URL}/api/documents/executive-meet/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Executive Meet generation failed.");
  }
  return res.json();
}

export async function generateBillCertificate(payload) {
  const res = await fetch(`${API_BASE_URL}/api/documents/bill-certificate/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Bill Certificate generation failed.");
  }
  return res.json();
}

export async function generateBillSummary(payload) {
  const res = await fetch(`${API_BASE_URL}/api/documents/bill-summary/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Bill Summary generation failed.");
  }
  return res.json();
}

export async function extractFromNLP(text) {
  const res = await fetch(`${API_BASE_URL}/api/documents/nlp/extract`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "NLP Extraction failed.");
  }
  return res.json();
}

export function getFullDownloadUrl(relativeUrl) {
  if (relativeUrl.startsWith("http")) return relativeUrl;
  return `${API_BASE_URL}${relativeUrl}`;
}
