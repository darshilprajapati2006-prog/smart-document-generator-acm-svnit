import { useState } from "react";
import { createRoleRequest } from "../services/documentApi";

export default function RoleRequestModal({ onClose }) {
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
    <div role="dialog" aria-modal="true" aria-label="Request a role" className="clauses-modal-overlay">
      <form onSubmit={submit} className="clauses-modal" style={{ maxWidth: 420, padding: 24 }}>
        <h3>Request a role</h3>
        <p>Choose the access level you need. An administrator must approve the request.</p>
        <label htmlFor="role-request">Requested role</label>
        <select id="role-request" value={role} onChange={(event) => setRole(event.target.value)}>
          <option value="reviewer">Reviewer</option>
          <option value="approver">Approver</option>
          <option value="template_admin">Template Admin</option>
        </select>
        {message && <p role="status">{message}</p>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
          <button type="button" onClick={onClose}>Close</button>
          <button type="submit" disabled={busy}>{busy ? "Submitting…" : "Submit request"}</button>
        </div>
      </form>
    </div>
  );
}
