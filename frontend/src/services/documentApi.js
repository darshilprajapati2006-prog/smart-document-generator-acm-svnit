import { firebaseAuth, authReady } from "./firebase";
import { AUTH_SESSION_PATH, postAuthSession, BOOTSTRAP_ADMIN_PATH, postBootstrapAdmin } from "./authEndpoints.js";
import {
  createUserWithEmailAndPassword,
  updateProfile,
  sendEmailVerification,
  signInWithEmailAndPassword,
  reload,
  sendPasswordResetEmail,
  signOut,
} from "firebase/auth";
const configuredApiBase = (import.meta.env.VITE_API_BASE_URL || "")
  .trim()
  .replace(/\/+$/, "")
  .replace(/\/api$/i, "");
// Local Vite requests use its /api and /health proxy; production must provide
// the deployed FastAPI base URL through VITE_API_BASE_URL.
const API_BASE_URL = configuredApiBase || (import.meta.env.DEV ? "" : "https://smart-document-generator-backend.onrender.com");

export function apiUrl(path) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}

let authToken = "";
if (typeof window !== "undefined") {
  window.addEventListener("smartdocs-firebase-token", (event) => { authToken = event.detail; });
}

export function setAuthToken(token) {
  authToken = token;
  // Firebase owns token persistence and refresh; keep only the active token in memory.
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
    const res = await fetch(apiUrl("/health"));
    if (!res.ok) return false;
    const data = await res.json();
    return data.status === "healthy";
  } catch {
    return false;
  }
}

export async function fetchTemplates() {
  const res = await fetch(apiUrl("/api/documents/templates"), { headers: getHeaders() });
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
  await authReady;
  const credential = await signInWithEmailAndPassword(firebaseAuth, email, password);
  await reload(credential.user);
  if (!credential.user.emailVerified) {
    const error = new Error("Verify your email using the link we sent before signing in.");
    error.code = "auth/email-not-verified";
    throw error;
  }
  const token = await credential.user.getIdToken(true);
  setAuthToken(token);
  const res = await postAuthSession(fetch, apiUrl(AUTH_SESSION_PATH), {
    Authorization: `Bearer ${token}`,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    if (res.status === 403 && err.detail === "No SmartDocs account found. Create an account first.") {
      const profileError = new Error("Your verified Firebase account needs a SmartDocs profile. Complete the secure setup to continue.");
      profileError.code = "smartdocs/profile-not-found";
      throw profileError;
    }
    await signOut(firebaseAuth);
    throw new Error(err.detail || "Authentication failed.");
  }
  const data = await res.json();
  return { access_token: token, user: data.user, requires_otp: false };
}

export async function completeVerifiedAccountSetup(fullName) {
  await authReady;
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error("Sign in with your Firebase account to continue.");
  await reload(user);
  if (!user.emailVerified) throw new Error("Verify your institutional email before completing account setup.");
  if (!fullName?.trim()) throw new Error("Enter your full name to complete account setup.");

  const token = await user.getIdToken(true);
  const registration = await fetch(apiUrl("/api/auth/register"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      requested_role: "author",
      full_name: fullName.trim(),
      email: user.email,
    }),
  });
  if (!registration.ok) {
    const result = await registration.json().catch(() => ({}));
    throw new Error(result.detail || "Could not create your SmartDocs profile.");
  }

  const session = await postAuthSession(fetch, apiUrl(AUTH_SESSION_PATH), {
    Authorization: `Bearer ${token}`,
  });
  if (!session.ok) {
    const result = await session.json().catch(() => ({}));
    throw new Error(result.detail || "Profile created, but sign-in could not be completed. Please try again.");
  }
  setAuthToken(token);
  const data = await session.json();
  return { access_token: token, user: data.user };
}

export async function bootstrapSystemAdmin() {
  await authReady;
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error("Sign in with your Firebase account before starting bootstrap.");
  await reload(user);
  if (!user.emailVerified) throw new Error("Verify your Firebase email before starting bootstrap.");

  const idToken = await user.getIdToken(true);
  const response = await postBootstrapAdmin(fetch, apiUrl(BOOTSTRAP_ADMIN_PATH), idToken);
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.detail || "System Admin bootstrap could not be completed.");
  }
  setAuthToken(idToken);
  const result = await response.json();
  const profileResponse = await fetch(apiUrl("/api/auth/me"), {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (!profileResponse.ok) {
    throw new Error("Bootstrap was accepted, but profile verification could not be completed. Do not retry; check the authenticated profile endpoint.");
  }
  const profile = await profileResponse.json();
  if (profile?.user?.role !== "admin") {
    throw new Error("Bootstrap returned, but the authenticated profile does not show System Admin. Do not retry; contact the administrator.");
  }
  return { ...result, user: profile.user };
}

export async function registerUser({ role, full_name, email, password, confirm_password, invitation_token }) {
  if (password !== confirm_password) throw new Error("Passwords do not match.");
  if (role !== "author") throw new Error("Only Author registration is available.");
  const credential = await createUserWithEmailAndPassword(firebaseAuth, email, password);
  await updateProfile(credential.user, { displayName: full_name });
  const token = await credential.user.getIdToken(true);
  const res = await fetch(`${API_BASE_URL}/api/auth/register`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ requested_role: role, full_name, email, invitation_token }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    // Keep Firebase accounts intact if profile creation fails; verified users
    // can sign in and retry SmartDocs profile setup safely.
    throw new Error(err.detail || "Registration failed.");
  }
  await sendEmailVerification(credential.user, { url: window.location.origin });
  return res.json();
}

export async function forgotPassword({ email }) {
  await sendPasswordResetEmail(firebaseAuth, email);
  return { success: true, message: "If an account exists, a password reset link has been sent." };
}

export async function fetchCurrentUserProfile() {
  await authReady;
  const user = firebaseAuth.currentUser;
  if (!user) return null;
  await user.reload();
  if (!user.emailVerified) return null;
  authToken = await user.getIdToken(true);
  const res = await postAuthSession(fetch, apiUrl(AUTH_SESSION_PATH), getHeaders());
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      setAuthToken("");
      localStorage.removeItem("acm_doc_user");
    }
    return null;
  }
  return res.json();
}

export async function logoutUser() {
  try {
    await fetch(`${API_BASE_URL}/api/auth/logout`, {
      method: "POST",
      headers: getHeaders(),
    });
  } catch {
    // ignore network errors on logout
  }
  setAuthToken("");
  await signOut(firebaseAuth);
  localStorage.removeItem("acm_doc_user");
  localStorage.removeItem("acm_doc_token");
}

export async function fetchUsers() {
  const res = await fetch(`${API_BASE_URL}/api/auth/users`, { headers: getHeaders() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to load users list.");
  }
  return res.json();
}

export async function createInvitation(invitationData) {
  const res = await fetch(`${API_BASE_URL}/api/auth/users/invitations`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(invitationData),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to create invitation.");
  }
  return res.json();
}

export async function updateUserRole(userId, newRole, confirmPrivilegedChange = false) {
  const res = await fetch(`${API_BASE_URL}/api/auth/users/${userId}/role`, {
    method: "PUT",
    headers: getHeaders(),
    body: JSON.stringify({ role: newRole, confirm_privileged_change: confirmPrivilegedChange }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to update user role.");
  }
  return res.json();
}

export async function revokeInvitation(invitationId) {
  const res = await fetch(`${API_BASE_URL}/api/auth/users/invitations/${encodeURIComponent(invitationId)}/revoke`, {
    method: "POST", headers: getHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to revoke invitation.");
  }
  return res.json();
}

export async function validateInvitation(token) {
  const res = await fetch(`${API_BASE_URL}/api/auth/invitations/validate`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Invitation is invalid or expired.");
  }
  return res.json();
}

export async function createRoleRequest(requestedRole) {
  const res = await fetch(`${API_BASE_URL}/api/auth/role-requests`, {
    method: "POST", headers: getHeaders(), body: JSON.stringify({ requested_role: requestedRole }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Could not submit role request.");
  }
  return res.json();
}

export async function fetchRoleRequests() {
  const res = await fetch(`${API_BASE_URL}/api/auth/role-requests`, { headers: getHeaders() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to load role requests.");
  }
  return res.json();
}

export async function reviewRoleRequest(requestId, decision, confirmPrivilegedChange = false) {
  const res = await fetch(`${API_BASE_URL}/api/auth/role-requests/${encodeURIComponent(requestId)}/review`, {
    method: "POST", headers: getHeaders(), body: JSON.stringify({ decision, confirm_privileged_change: confirmPrivilegedChange }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to review role request.");
  }
  return res.json();
}

export async function updateUserStatus(userId, status) {
  const res = await fetch(`${API_BASE_URL}/api/auth/users/${userId}/status`, {
    method: "PUT",
    headers: getHeaders(),
    body: JSON.stringify({ status }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to update user status.");
  }
  return res.json();
}

export async function deleteUser(userId) {
  const res = await fetch(`${API_BASE_URL}/api/auth/users/${userId}`, {
    method: "DELETE",
    headers: getHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to delete user account.");
  }
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
