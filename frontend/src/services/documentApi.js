const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

let authToken = localStorage.getItem("acm_doc_token") || "";

export function setAuthToken(token) {
  authToken = token;
  if (token) {
    localStorage.setItem("acm_doc_token", token);
  } else {
    localStorage.removeItem("acm_doc_token");
  }
}

export function getAuthToken() {
  return authToken;
}

function getHeaders() {
  const headers = { "Content-Type": "application/json" };
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }
  return headers;
}

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
  const res = await fetch(`${API_BASE_URL}/api/documents/templates`, { headers: getHeaders() });
  if (!res.ok) throw new Error(`Failed to fetch templates: ${res.statusText}`);
  return res.json();
}

// -------------------------------------------------------------
// Core Document Generation
// -------------------------------------------------------------

export async function generateExecutiveMeet(payload) {
  const res = await fetch(`${API_BASE_URL}/api/documents/executive-meet/generate`, {
    method: "POST",
    headers: getHeaders(),
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
    headers: getHeaders(),
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
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Bill Summary generation failed.");
  }
  return res.json();
}

// -------------------------------------------------------------
// Feature 1: Automatic Document-Type Detection
// -------------------------------------------------------------

export async function classifyPrompt(prompt, explicitlySelected) {
  const res = await fetch(`${API_BASE_URL}/api/documents/classify`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ prompt, explicitly_selected: explicitlySelected }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Classification failed.");
  }
  return res.json();
}

export async function extractFromNLP(text, documentType) {
  const res = await fetch(`${API_BASE_URL}/api/documents/nlp/extract`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ text, document_type: documentType }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "NLP Extraction failed.");
  }
  return res.json();
}

// -------------------------------------------------------------
// Feature 3: Batch Document Generation
// -------------------------------------------------------------

export async function batchGenerate(jobs) {
  const res = await fetch(`${API_BASE_URL}/api/documents/batch/generate`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ jobs }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Batch generation failed.");
  }
  return res.json();
}

// -------------------------------------------------------------
// Feature 4: Version History & Restores
// -------------------------------------------------------------

export async function fetchDocumentHistory() {
  const res = await fetch(`${API_BASE_URL}/api/documents/history/list`, { headers: getHeaders() });
  if (!res.ok) throw new Error("Failed to load document history.");
  return res.json();
}

export async function fetchDocumentVersions(docId) {
  const res = await fetch(`${API_BASE_URL}/api/documents/${docId}/versions`, { headers: getHeaders() });
  if (!res.ok) throw new Error("Failed to load version history.");
  return res.json();
}

export async function fetchDocumentVersionDetail(docId, versionNum) {
  const res = await fetch(`${API_BASE_URL}/api/documents/${docId}/versions/${versionNum}`, { headers: getHeaders() });
  if (!res.ok) throw new Error("Failed to load version details.");
  return res.json();
}

export async function restoreDocumentVersion(docId, versionNum) {
  const res = await fetch(`${API_BASE_URL}/api/documents/${docId}/versions/${versionNum}/restore`, {
    method: "POST",
    headers: getHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to restore version.");
  }
  return res.json();
}

// -------------------------------------------------------------
// Feature 5: Approval / Review Workflow
// -------------------------------------------------------------

export async function transitionWorkflow(docId, targetStatus, comment) {
  const res = await fetch(`${API_BASE_URL}/api/documents/${docId}/workflow/transition`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ target_status: targetStatus, comment }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Workflow transition rejected.");
  }
  return res.json();
}

export async function fetchWorkflowHistory(docId) {
  const res = await fetch(`${API_BASE_URL}/api/documents/${docId}/workflow/history`, { headers: getHeaders() });
  if (!res.ok) throw new Error("Failed to load approval audit history.");
  return res.json();
}

// -------------------------------------------------------------
// Feature 6: Reusable Clauses & Sections
// -------------------------------------------------------------

export async function fetchClauses(documentType) {
  const param = documentType ? `?document_type=${encodeURIComponent(documentType)}` : "";
  try {
    let res = await fetch(`${API_BASE_URL}/api/documents/clauses${param}`, { headers: getHeaders() });
    if (!res.ok) {
      res = await fetch(`${API_BASE_URL}/api/documents/clauses/list${param}`, { headers: getHeaders() });
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch reusable clauses.`);
    return await res.json();
  } catch (err) {
    console.warn("fetchClauses error:", err);
    throw err;
  }
}

export async function interpolateClause(clauseId, content, context) {
  const res = await fetch(`${API_BASE_URL}/api/documents/clauses/interpolate`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ clause_id: clauseId, content, context }),
  });
  if (!res.ok) throw new Error("Failed to interpolate clause.");
  return res.json();
}

// -------------------------------------------------------------
// Feature 7: Update Existing Documents
// -------------------------------------------------------------

export async function updateDocumentSource(docId, data, changeSummary) {
  const res = await fetch(`${API_BASE_URL}/api/documents/${docId}`, {
    method: "PUT",
    headers: getHeaders(),
    body: JSON.stringify({ data, change_summary: changeSummary }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to update document source.");
  }
  return res.json();
}

// -------------------------------------------------------------
// Feature 8: Template Preview / Editor
// -------------------------------------------------------------

export async function fetchTemplateConfigs() {
  const res = await fetch(`${API_BASE_URL}/api/documents/templates-config/list`, { headers: getHeaders() });
  if (!res.ok) throw new Error("Failed to fetch template configurations.");
  return res.json();
}

export async function fetchTemplatePreview(templateId) {
  const res = await fetch(`${API_BASE_URL}/api/documents/templates-config/${templateId}/preview`, { headers: getHeaders() });
  if (!res.ok) throw new Error("Failed to fetch template preview.");
  return res.json();
}

export async function updateTemplateConfig(templateId, payload) {
  const res = await fetch(`${API_BASE_URL}/api/documents/templates-config/${templateId}`, {
    method: "PUT",
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to update template configuration.");
  }
  return res.json();
}

// -------------------------------------------------------------
// Feature 9: RBAC & Authentication
// -------------------------------------------------------------

export async function loginUser(email, password) {
  const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Authentication failed.");
  }
  const data = await res.json();
  if (data.access_token) {
    setAuthToken(data.access_token);
  }
  return data;
}

export async function fetchCurrentUserProfile() {
  if (!authToken) return null;
  const res = await fetch(`${API_BASE_URL}/api/auth/me`, { headers: getHeaders() });
  if (!res.ok) return null;
  return res.json();
}

// -------------------------------------------------------------
// Features 10 & 11: Integrations & Distribution
// -------------------------------------------------------------

export async function getIntegrationsStatus() {
  const res = await fetch(`${API_BASE_URL}/api/documents/integrations/status`, { headers: getHeaders() });
  if (!res.ok) throw new Error("Failed to fetch integrations status.");
  return res.json();
}

export async function exportToGoogleDrive(docId, fileFormat = "pdf") {
  const res = await fetch(`${API_BASE_URL}/api/documents/${docId}/export/google-drive`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ file_format: fileFormat }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Google Drive export failed.");
  }
  return res.json();
}

export async function exportToGoogleSheets(docId) {
  const res = await fetch(`${API_BASE_URL}/api/documents/${docId}/export/google-sheets`, {
    method: "POST",
    headers: getHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Google Sheets export failed.");
  }
  return res.json();
}

export async function distributeByEmail(docId, payload) {
  const res = await fetch(`${API_BASE_URL}/api/documents/${docId}/distribute/email`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Email distribution failed.");
  }
  return res.json();
}

// -------------------------------------------------------------
// Feature 12: Digital Signatures
// -------------------------------------------------------------

export async function signDocument(docId, versionNum) {
  const res = await fetch(`${API_BASE_URL}/api/documents/${docId}/signatures/sign?version_num=${versionNum || 1}`, {
    method: "POST",
    headers: getHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Signing failed.");
  }
  return res.json();
}

export async function verifySignature(docId, versionNum) {
  const res = await fetch(`${API_BASE_URL}/api/documents/${docId}/signatures/verify?version_num=${versionNum || 1}`, {
    headers: getHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Verification request failed.");
  }
  return res.json();
}

// -------------------------------------------------------------
// Feature 13: Usage Analytics
// -------------------------------------------------------------

export async function fetchAnalyticsDashboard(documentType) {
  const url = documentType
    ? `${API_BASE_URL}/api/documents/analytics/dashboard?document_type=${documentType}`
    : `${API_BASE_URL}/api/documents/analytics/dashboard`;
  const res = await fetch(url, { headers: getHeaders() });
  if (!res.ok) throw new Error("Failed to load analytics dashboard.");
  return res.json();
}

export function getFullDownloadUrl(relativeUrl) {
  if (relativeUrl.startsWith("http")) return relativeUrl;
  return `${API_BASE_URL}${relativeUrl}`;
}
