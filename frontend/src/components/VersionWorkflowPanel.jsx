import { useState, useEffect } from "react";
import {
  fetchDocumentHistory,
  fetchDocumentVersions,
  restoreDocumentVersion,
  transitionWorkflow,
  fetchWorkflowHistory,
  signDocument,
  verifySignature,
  exportToGoogleDrive,
  distributeByEmail
} from "../services/documentApi";

export default function VersionWorkflowPanel({ documentId, role }) {
  const [documents, setDocuments] = useState([]);
  const [selectedDocId, setSelectedDocId] = useState(documentId || "");
  const [versions, setVersions] = useState([]);
  const [workflowLogs, setWorkflowLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionFeedback, setActionFeedback] = useState({ type: "", message: "" });

  // Transition form
  const [targetStatus, setTargetStatus] = useState("ready_for_review");
  const [comment, setComment] = useState("");

  // Signature state
  const [signatureResult, setSignatureResult] = useState(null);

  // Email form
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailRecipients, setEmailRecipients] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailMessage, setEmailMessage] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const res = await fetchDocumentHistory();
        if (!active) return;
        setDocuments(res.documents || []);
        if (res.documents && res.documents.length > 0 && !selectedDocId && !documentId) {
          setSelectedDocId(res.documents[0].id);
        }
      } catch (err) {
        if (active) setActionFeedback({ type: "error", message: err.message });
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [documentId, selectedDocId]);

  useEffect(() => {
    const targetId = selectedDocId || documentId;
    if (targetId) {
      loadDocDetails(targetId);
    }
  }, [selectedDocId, documentId]);

  async function loadDocs() {
    setLoading(true);
    try {
      const res = await fetchDocumentHistory();
      setDocuments(res.documents || []);
      if (res.documents && res.documents.length > 0 && !selectedDocId) {
        setSelectedDocId(res.documents[0].id);
      }
    } catch (err) {
      setActionFeedback({ type: "error", message: err.message });
    } finally {
      setLoading(false);
    }
  }

  async function loadDocDetails(docId) {
    try {
      const [vRes, wRes] = await Promise.all([
        fetchDocumentVersions(docId),
        fetchWorkflowHistory(docId)
      ]);
      setVersions(vRes.versions || []);
      setWorkflowLogs(wRes.history || []);
      setSignatureResult(null);
    } catch (err) {
      setActionFeedback({ type: "error", message: err.message });
    }
  }

  async function handleRestore(versionNum) {
    try {
      const res = await restoreDocumentVersion(selectedDocId, versionNum);
      setActionFeedback({ type: "success", message: res.message });
      loadDocs();
      loadDocDetails(selectedDocId);
    } catch (err) {
      setActionFeedback({ type: "error", message: err.message });
    }
  }

  async function handleTransitionSubmit(e) {
    e.preventDefault();
    try {
      const res = await transitionWorkflow(selectedDocId, targetStatus, comment);
      setActionFeedback({
        type: "success",
        message: `Workflow state updated to '${res.to_status}' successfully.`
      });
      setComment("");
      loadDocs();
      loadDocDetails(selectedDocId);
    } catch (err) {
      setActionFeedback({ type: "error", message: err.message });
    }
  }

  async function handleSign() {
    try {
      const res = await signDocument(selectedDocId);
      setSignatureResult(res);
      setActionFeedback({ type: "success", message: res.message });
      loadDocDetails(selectedDocId);
    } catch (err) {
      setActionFeedback({ type: "error", message: err.message });
    }
  }

  async function handleVerifySignature() {
    try {
      const res = await verifySignature(selectedDocId);
      setSignatureResult(res);
      setActionFeedback({
        type: res.is_valid ? "success" : "error",
        message: res.detail
      });
    } catch (err) {
      setActionFeedback({ type: "error", message: err.message });
    }
  }

  async function handleExportDrive() {
    try {
      const res = await exportToGoogleDrive(selectedDocId, "pdf");
      setActionFeedback({
        type: "success",
        message: res.message || `Exported to Drive: File ID ${res.file_id}`
      });
    } catch (err) {
      setActionFeedback({ type: "error", message: err.message });
    }
  }

  async function handleSendEmail(e) {
    e.preventDefault();
    const recList = emailRecipients.split(",").map(r => r.trim()).filter(Boolean);
    try {
      const res = await distributeByEmail(selectedDocId, {
        recipients: recList,
        subject: emailSubject || "Official ACM SVNIT Document",
        message: emailMessage || "Please find the attached document.",
        file_format: "pdf"
      });
      setActionFeedback({ type: "success", message: res.message });
      setShowEmailModal(false);
    } catch (err) {
      setActionFeedback({ type: "error", message: err.message });
    }
  }

  const activeDoc = documents.find(d => d.id === selectedDocId);

  return (
    <section className="page-panel version-page">
      <div className="page-panel-heading version-heading">
        <div>
          <h2 className="panel-title">
            🗂️ Document Version History & Approval Workflow
          </h2>
          <p className="panel-subtitle">
            Track persistent version snapshots, manage review lifecycle transitions, apply cryptographic digital signatures, and distribute via email / Drive.
          </p>
        </div>
        <div className="version-heading-actions">
          {role && (
            <span className="version-role-badge">
              👤 Role: {role}
            </span>
          )}
          {loading && <span style={{ fontSize: "0.85rem", color: "#64748b" }}>Loading...</span>}
          <button type="button" className="secondary-btn" onClick={loadDocs} style={{ padding: "6px 14px", fontSize: "0.85rem" }}>
            🔄 Refresh
          </button>
        </div>
      </div>

      {actionFeedback.message && (
        <div style={{
          padding: "10px 14px",
          background: actionFeedback.type === "success" ? "#f0fdf4" : "#fef2f2",
          color: actionFeedback.type === "success" ? "#166534" : "#991b1b",
          borderRadius: "8px",
          border: `1px solid ${actionFeedback.type === "success" ? "#bbf7d0" : "#fecaca"}`,
          marginBottom: "1rem",
          fontSize: "0.9rem"
        }}>
          {actionFeedback.type === "success" ? "✔ " : "⚠️ "} {actionFeedback.message}
        </div>
      )}

      {documents.length === 0 ? (
      <div className="empty-state">
          No persisted documents found yet. Generate a document from the generator tab to start tracking versions.
        </div>
      ) : (
        <div className="version-workspace-grid">
          {/* Left: Document List */}
          <div className="version-document-list">
            <h3 style={{ fontSize: "0.95rem", textTransform: "uppercase", color: "#64748b", marginBottom: "8px", letterSpacing: "0.5px" }}>
              Documents ({documents.length})
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {documents.map((d) => (
                <div
                  key={d.id}
                  className={`version-document-option ${d.id === selectedDocId ? "is-selected" : ""}`}
                  onClick={() => setSelectedDocId(d.id)}
                  role="button"
                  tabIndex={0}
                  aria-pressed={d.id === selectedDocId}
                  onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedDocId(d.id); } }}
                  style={{
                    padding: "10px",
                    borderRadius: "8px",
                    cursor: "pointer",
                    border: d.id === selectedDocId ? "2px solid #2563eb" : "1px solid #cbd5e1",
                    background: d.id === selectedDocId ? "#eff6ff" : "#f8fafc"
                  }}
                >
                  <div style={{ fontWeight: "600", fontSize: "0.9rem", color: "#0f172a" }}>
                    {d.title || "Untitled Document"}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: "6px", fontSize: "0.8rem", color: "#64748b" }}>
                    <span>v{d.current_version}</span>
                    <span className={`version-status status-${d.status}`} style={{
                      padding: "2px 6px",
                      borderRadius: "4px",
                      fontSize: "0.75rem",
                      fontWeight: "700",
                      background: d.status === "approved" ? "#dcfce7" : d.status === "changes_requested" ? "#fee2e2" : "#fef3c7",
                      color: d.status === "approved" ? "#15803d" : d.status === "changes_requested" ? "#b91c1c" : "#b45309"
                    }}>
                      {d.status.toUpperCase()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Selected Document Detail & Lifecycle */}
          <div className="version-detail">
            {activeDoc && (
              <div>
                <div className="version-detail-heading">
                  <div>
                    <h3 style={{ fontSize: "1.15rem", fontWeight: "700", margin: 0, color: "#0f172a" }}>
                      {activeDoc.title}
                    </h3>
                    <div style={{ fontSize: "0.85rem", color: "#64748b", marginTop: "4px" }}>
                      ID: {activeDoc.id} | Type: {activeDoc.document_type} | Created: {activeDoc.created_at}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button type="button" className="secondary-btn" onClick={handleExportDrive} style={{ padding: "6px 12px", fontSize: "0.82rem" }}>
                      ☁️ Export Drive
                    </button>
                    <button type="button" className="secondary-btn" onClick={() => setShowEmailModal(true)} style={{ padding: "6px 12px", fontSize: "0.82rem" }}>
                      ✉️ Send Email
                    </button>
                  </div>
                </div>

                {/* Section A: Versions Timeline */}
                <div style={{ marginBottom: "20px" }}>
                  <h4 style={{ fontSize: "0.95rem", fontWeight: "700", color: "#1e293b", marginBottom: "10px" }}>
                    📜 Version History ({versions.length} versions)
                  </h4>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {versions.map((v) => (
                      <div key={v.version_num} className="version-timeline-row">
                        <div>
                          <span style={{ fontWeight: "700", color: "#1d4ed8" }}>Version {v.version_num}</span>
                          <span style={{ marginLeft: "10px", fontSize: "0.85rem", color: "#334155" }}>
                            {v.change_summary || "Initial version"}
                          </span>
                          <div style={{ fontSize: "0.78rem", color: "#94a3b8", marginTop: "3px" }}>
                            {v.created_at} {v.signature_hash ? "• 🔏 Signed" : ""}
                          </div>
                        </div>
                        {v.version_num !== activeDoc.current_version && (
                          <button
                            type="button"
                            className="secondary-btn"
                            onClick={() => handleRestore(v.version_num)}
                            style={{ padding: "4px 10px", fontSize: "0.8rem" }}
                          >
                            Restore as v{activeDoc.current_version + 1}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Section B: Approval Workflow Transition */}
                <div className="workflow-panel">
                  <h4 style={{ fontSize: "0.95rem", fontWeight: "700", color: "#1e293b", margin: "0 0 10px 0" }}>
                    🔄 Review & Approval Lifecycle (Active Status: <span style={{ color: "#2563eb" }}>{activeDoc.status}</span>)
                  </h4>
                  <form onSubmit={handleTransitionSubmit} style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                    <select
                      value={targetStatus}
                      onChange={(e) => setTargetStatus(e.target.value)}
                      style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.88rem" }}
                    >
                      <option value="ready_for_review">Ready for Review (Author)</option>
                      <option value="in_review">In Review (Reviewer/Approver)</option>
                      <option value="approved">Approved (Approver)</option>
                      <option value="changes_requested">Changes Requested (Reviewer/Approver)</option>
                      <option value="rejected">Rejected (Approver)</option>
                    </select>
                    <input
                      type="text"
                      placeholder="Reviewer comments or revision notes..."
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      style={{ flex: 1, minWidth: "220px", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.88rem" }}
                    />
                    <button type="submit" className="primary-btn" style={{ padding: "8px 16px", fontSize: "0.88rem" }}>
                      Submit Status
                    </button>
                  </form>

                  {/* Audit Logs */}
                  {workflowLogs.length > 0 && (
                    <div style={{ marginTop: "12px", borderTop: "1px solid #e2e8f0", paddingTop: "10px" }}>
                      <div style={{ fontSize: "0.82rem", fontWeight: "700", color: "#64748b", marginBottom: "6px" }}>
                        AUDIT TRAIL:
                      </div>
                      {workflowLogs.map((log) => (
                        <div key={log.id} style={{ fontSize: "0.8rem", color: "#475569", marginBottom: "4px" }}>
                          • <b>{log.actor_name}</b> ({log.actor_role}): {log.from_status} ➔ <b>{log.to_status}</b> {log.comment ? `("${log.comment}")` : ""} <span style={{ color: "#94a3b8" }}>[{log.created_at}]</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Section C: Cryptographic Digital Signature & Tamper Detection */}
                <div className="signature-panel">
                  <h4 style={{ fontSize: "0.95rem", fontWeight: "700", color: "var(--text, #1e293b)", margin: "0 0 10px 0" }}>
                    🔏 Cryptographic Digital Signature (HMAC-SHA256)
                  </h4>
                  <div style={{ display: "flex", gap: "10px" }}>
                    <button type="button" className="primary-btn" onClick={handleSign} style={{ padding: "8px 14px", fontSize: "0.85rem" }}>
                      Apply HMAC-SHA256 Signature
                    </button>
                    <button type="button" className="secondary-btn" onClick={handleVerifySignature} style={{ padding: "8px 14px", fontSize: "0.85rem" }}>
                      Verify Signature & Tamper Check
                    </button>
                  </div>
                  {signatureResult && (
                    <div style={{ marginTop: "10px", padding: "10px", background: signatureResult.is_valid !== false ? "#f0fdf4" : "#fef2f2", borderRadius: "6px", fontSize: "0.82rem" }}>
                      <div><b>Algorithm:</b> {signatureResult.algorithm || "HMAC-SHA256"}</div>
                      {signatureResult.signature_token && (
                        <div style={{ wordBreak: "break-all", marginTop: "3px" }}><b>Token:</b> {signatureResult.signature_token}</div>
                      )}
                      {signatureResult.computed_hash && (
                        <div style={{ wordBreak: "break-all", marginTop: "3px" }}><b>Payload Hash:</b> {signatureResult.computed_hash}</div>
                      )}
                      <div style={{ marginTop: "4px", fontWeight: "700", color: signatureResult.is_valid !== false ? "#166534" : "#991b1b" }}>
                        {signatureResult.detail || signatureResult.message}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Email Modal */}
      {showEmailModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div className="theme-modal-card version-email-modal" style={{ width: "450px", maxWidth: "90%" }}>
            <h3 style={{ margin: "0 0 12px 0", fontSize: "1.1rem" }}>✉️ Distribute Document via Email</h3>
            <form onSubmit={handleSendEmail} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <div>
                <label style={{ fontSize: "0.85rem", fontWeight: "600" }}>Recipients (comma separated):</label>
                <input
                  type="text"
                  required
                  placeholder="faculty@svnit.ac.in, chair@svnit.acm.org"
                  value={emailRecipients}
                  onChange={(e) => setEmailRecipients(e.target.value)}
                  style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1", marginTop: "4px" }}
                />
              </div>
              <div>
                <label style={{ fontSize: "0.85rem", fontWeight: "600" }}>Subject:</label>
                <input
                  type="text"
                  required
                  placeholder="Official ACM SVNIT Document"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1", marginTop: "4px" }}
                />
              </div>
              <div>
                <label style={{ fontSize: "0.85rem", fontWeight: "600" }}>Message:</label>
                <textarea
                  rows={3}
                  placeholder="Please review the attached official document..."
                  value={emailMessage}
                  onChange={(e) => setEmailMessage(e.target.value)}
                  style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1", marginTop: "4px" }}
                />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "10px" }}>
                <button type="button" className="secondary-btn" onClick={() => setShowEmailModal(false)}>Cancel</button>
                <button type="submit" className="primary-btn">Dispatch Email</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
