import { useState } from "react";
import { createRoleRequest } from "../services/documentApi";

export default function RoleRequestPage({ onClose }) {
  const [role, setRole] = useState("reviewer");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await createRoleRequest(role);
      setMessage("Request submitted. An administrator will review it.");
    } catch (error) {
      setMessage(error.message || "Could not submit role request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="page-panel role-request-page" aria-labelledby="role-request-title">
      <div className="role-request-heading">
        <div>
          <span className="role-request-eyebrow">ACCOUNT ACCESS</span>
          <h1 id="role-request-title">Request a role</h1>
          <p>Choose the access level you need. A System Admin will review your request.</p>
        </div>
        <button type="button" className="secondary-btn role-request-back" onClick={onClose}>
          <span aria-hidden="true">←</span> Back to workspace
        </button>
      </div>

      <div className="role-request-card">
        <div className="role-request-card-icon" aria-hidden="true">🔐</div>
        <div className="role-request-card-copy">
          <h2>Access for your work</h2>
          <p>Requests are reviewed by an administrator. Your current access remains active while the request is pending.</p>
        </div>
        <form onSubmit={submit} className="role-request-form">
          <label htmlFor="role-request">Requested role</label>
          <select id="role-request" value={role} onChange={(event) => setRole(event.target.value)} disabled={busy}>
            <option value="reviewer">Reviewer</option>
            <option value="approver">Approver</option>
            <option value="template_admin">Template Admin</option>
          </select>
          {message && (
            <p className={`role-request-feedback ${message.startsWith("Request submitted") ? "success" : "error"}`} role="status">
              {message}
            </p>
          )}
          <div className="role-request-actions">
            <button type="button" className="secondary-btn" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className="primary-btn" disabled={busy}>
              {busy ? "Submitting…" : "Submit request"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
