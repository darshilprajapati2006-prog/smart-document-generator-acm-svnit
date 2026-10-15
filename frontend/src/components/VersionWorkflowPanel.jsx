import { useState, useEffect } from "react";
import {
  fetchDocumentHistory,
  fetchDocumentVersions,
  restoreDocumentVersion,
  transitionWorkflow,
  fetchWorkflowHistory,
  signDocument,
  verifySignature,
  downloadDocumentFile,
  exportToGoogleDrive,
  distributeByEmail
} from "../services/documentApi";
import { getWorkflowActions } from "../utils/workflowActions.js";

function decodeAuditText(value) {
  if (value == null) return "";
  const text = String(value);
  if (typeof window === "undefined" || !/[&](?:amp|#\d+|#x[\da-f]+|lt|gt|quot|apos);/i.test(text)) return text;
  const parser = new DOMParser();
  return parser.parseFromString(text, "text/html").documentElement.textContent || "";
}

function formatAuditTimestamp(value) {
  if (!value) return "Timestamp unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return decodeAuditText(value);
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true
  }).format(date).replace(",", " ·");
}

export default function VersionWorkflowPanel({ documentId, role }) {
  const [documents, setDocuments] = useState([]);
  const [selectedDocId, setSelectedDocId] = useState(documentId || "");
  const [versions, setVersions] = useState([]);
  const [workflowLogs, setWorkflowLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [downloadingFormat, setDownloadingFormat] = useState("");
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState("");
  const [actionFeedback, setActionFeedback] = useState({ type: "", message: "" });

  // Transition form
  const [targetStatus, setTargetStatus] = useState("ready_for_review");
  const [comment, setComment] = useState("");

  // Signature state
  const [signatureResult, setSignatureResult] = useState(null);
  const [signatureVersion, setSignatureVersion] = useState(1);
  const [signatureLoading, setSignatureLoading] = useState(false);

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
      const currentVersion = vRes.versions?.[0]?.version_num || 1;
      setSignatureVersion(currentVersion);
      setSignatureLoading(true);
      try {
        setSignatureResult(await verifySignature(docId, currentVersion));
      } catch (signatureError) {
        setSignatureResult({ is_signed: false, is_valid: false, verification_status: "Not Verified", detail: signatureError.message });
      } finally {
        setSignatureLoading(false);
      }
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
    if (signatureLoading || role !== "approver") return;
    setSignatureLoading(true);
    try {
      const res = await signDocument(selectedDocId, signatureVersion);
      setSignatureResult({ ...res, is_signed: true, is_valid: false, verification_status: "Not Verified", detail: res.message });
      setActionFeedback({ type: "success", message: res.message });
    } catch (err) {
      setActionFeedback({ type: "error", message: err.message });
    } finally {
      setSignatureLoading(false);
    }
  }

  async function handleVerifySignature() {
    if (signatureLoading) return;
    setSignatureLoading(true);
    try {
      const res = await verifySignature(selectedDocId, signatureVersion);
      setSignatureResult(res);
      setActionFeedback({ type: res.is_valid ? "success" : "error", message: res.detail });
    } catch (err) {
      setSignatureResult((previous) => ({ ...(previous || {}), is_valid: false, verification_status: "Not Verified", detail: err.message }));
      setActionFeedback({ type: "error", message: err.message });
    } finally {
      setSignatureLoading(false);
    }
  }

  async function handleSignatureVersionChange(event) {
    const versionNum = Number(event.target.value);
    setSignatureVersion(versionNum);
    setSignatureLoading(true);
    try {
      setSignatureResult(await verifySignature(selectedDocId, versionNum));
    } catch (err) {
      setSignatureResult({ is_signed: false, is_valid: false, verification_status: "Not Verified", detail: err.message });
    } finally {
      setSignatureLoading(false);
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

  async function handleDownload(fileFormat) {
    setDownloadingFormat(fileFormat);
    try {
      const { blob, filename } = await downloadDocumentFile(selectedDocId, fileFormat);
      const objectUrl = URL.createObjectURL(blob);
      const anchor = window.document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = filename;
      anchor.style.display = "none";
      window.document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      setActionFeedback({ type: "success", message: `${fileFormat.toUpperCase()} downloaded.` });
    } catch (err) {
      setActionFeedback({ type: "error", message: err.message || `Unable to download the ${fileFormat.toUpperCase()}.` });
    } finally {
      setDownloadingFormat("");
    }
  }

  async function handlePreviewPdf() {
    setDownloadingFormat("preview");
    try {
      const { blob } = await downloadDocumentFile(selectedDocId, "pdf");
      setPdfPreviewUrl((previousUrl) => {
        if (previousUrl) URL.revokeObjectURL(previousUrl);
        return URL.createObjectURL(blob);
      });
      setActionFeedback({ type: "success", message: "Current PDF opened for preview." });
    } catch (err) {
      setActionFeedback({ type: "error", message: err.message || "Unable to open this PDF." });
    } finally {
      setDownloadingFormat("");
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
  const stageActions = getWorkflowActions(activeDoc, role);

  useEffect(() => {
    if (stageActions.length && !stageActions.some((action) => action.value === targetStatus)) {
      setTargetStatus(stageActions[0].value);
    }
  }, [activeDoc?.id, activeDoc?.workflow_stage, activeDoc?.status, role]);

  useEffect(() => () => {
    if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
  }, [pdfPreviewUrl]);

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
                    <button
                      type="button"
                      className="secondary-btn"
                      onClick={handlePreviewPdf}
                      disabled={Boolean(downloadingFormat)}
                      style={{ padding: "6px 12px", fontSize: "0.82rem" }}
                    >
                      {downloadingFormat === "preview" ? "Opening PDF…" : "View PDF"}
                    </button>
                    <button
                      type="button"
                      className="secondary-btn"
                      onClick={() => handleDownload("pdf")}
                      disabled={Boolean(downloadingFormat)}
                      style={{ padding: "6px 12px", fontSize: "0.82rem" }}
                    >
                      {downloadingFormat === "pdf" ? "Preparing PDF…" : "⬇ Download PDF"}
                    </button>
                    <button
                      type="button"
                      className="secondary-btn"
                      onClick={() => handleDownload("docx")}
                      disabled={Boolean(downloadingFormat)}
                      style={{ padding: "6px 12px", fontSize: "0.82rem" }}
                    >
                      {downloadingFormat === "docx" ? "Preparing DOCX…" : "⬇ Download DOCX"}
                    </button>
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
                    🔄 Review & Approval Lifecycle (Stage: <span style={{ color: "#2563eb" }}>{(activeDoc.workflow_stage || "author").replaceAll("_", " ")}</span> · Status: <span style={{ color: "#2563eb" }}>{activeDoc.status}</span>)
                  </h4>
                  {stageActions.length > 0 ? <form onSubmit={handleTransitionSubmit} style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                    <select
                      value={targetStatus}
                      onChange={(e) => setTargetStatus(e.target.value)}
                      style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.88rem" }}
                    >
                      {stageActions.map((action) => <option key={action.value} value={action.value}>{action.label}</option>)}
                    </select>
                    <input
                      type="text"
                      placeholder="Review comments or revision notes..."
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      style={{ flex: 1, minWidth: "220px", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.88rem" }}
                    />
                    <button type="submit" className="primary-btn" disabled={loading} style={{ padding: "8px 16px", fontSize: "0.88rem" }}>
                      Submit decision
                    </button>
                  </form> : <p style={{ color: "#64748b", margin: "4px 0 12px" }}>
                    {activeDoc.status === "approved"
                      ? (workflowLogs[workflowLogs.length - 1]?.actor_role === "admin" && workflowLogs[workflowLogs.length - 1]?.action === "approved"
                        ? "Workflow complete: this version has final System Admin approval."
                        : "This version is marked approved in its existing workflow history.")
                      : activeDoc.status === "rejected"
                        ? "This document was rejected by the Approver. An Author can create a revised version to restart review."
                        : `Waiting for the ${activeDoc.workflow_stage || "author"} stage. Authorized participants can view and download the current files above.`}
                  </p>}

                  {/* Audit Logs */}
                  {workflowLogs.length > 0 && (
                    <div style={{ marginTop: "12px", borderTop: "1px solid #e2e8f0", paddingTop: "10px" }}>
                      <div style={{ fontSize: "0.82rem", fontWeight: "700", color: "#64748b", marginBottom: "6px" }}>
                        AUDIT TRAIL:
                      </div>
                      <div className="audit-trail-list">
                        {workflowLogs.map((log) => (
                          <article className="audit-event-card" key={log.id}>
                            <header className="audit-event-header">
                              <span className="audit-actor-check" aria-hidden="true">✓</span>
                              <div className="audit-actor-details">
                                <strong>{decodeAuditText(log.actor_name) || "Unknown actor"}</strong>
                                <span>{decodeAuditText(log.actor_role) || "Role unavailable"}</span>
                              </div>
                            </header>
                            <div className="audit-event-sections">
                              <section className="audit-info-section audit-transition-section">
                                <h5><span aria-hidden="true">✓</span> Workflow Transition</h5>
                                <div className="audit-transition-values">
                                  <span className="audit-state-value"><small>FROM</small>{decodeAuditText(log.from_stage ? `${log.from_stage} · ${log.from_status || ""}` : log.from_status) || "Unavailable"}</span>
                                  <span className="audit-transition-arrow" aria-label="to">→</span>
                                  <span className="audit-state-value audit-state-to"><small>TO</small>{decodeAuditText(log.to_stage ? `${log.to_stage} · ${log.to_status || ""}` : log.to_status) || "Unavailable"}</span>
                                </div>
                              </section>
                              <section className="audit-info-section">
                                <h5><span aria-hidden="true">✓</span> Comment</h5>
                                <p>{decodeAuditText(log.comment) || "No comment provided"}</p>
                              </section>
                              <section className="audit-info-section audit-time-section">
                                <h5><span aria-hidden="true">✓</span> Date &amp; Time</h5>
                                <p>{formatAuditTimestamp(log.created_at)}</p>
                              </section>
                            </div>
                          </article>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Section C: Cryptographic Digital Signature & Tamper Detection */}
                <div className="signature-panel">
                  <h4 style={{ fontSize: "0.95rem", fontWeight: "700", color: "var(--text, #1e293b)", margin: "0 0 10px 0" }}>
                    🔏 Cryptographic Digital Signature (HMAC-SHA256)
                  </h4>
                  <div className="signature-controls">
                    <label className="signature-version-select">Document version
                      <select value={signatureVersion} onChange={handleSignatureVersionChange} disabled={signatureLoading}>
                        {versions.map((version) => <option key={version.version_num} value={version.version_num}>Version {version.version_num}</option>)}
                      </select>
                    </label>
                    {role === "approver" && <button type="button" className="primary-btn" onClick={handleSign} disabled={signatureLoading} style={{ padding: "8px 14px", fontSize: "0.85rem" }}>
                      {signatureLoading ? "Signing…" : "Apply HMAC-SHA256 Signature"}
                    </button>}
                    <button type="button" className="secondary-btn" onClick={handleVerifySignature} disabled={signatureLoading} style={{ padding: "8px 14px", fontSize: "0.85rem" }}>
                      {signatureLoading ? "Verifying…" : "Verify Signature & Tamper Check"}
                    </button>
                  </div>
                  <div className="signature-result-grid" aria-live="polite" aria-busy={signatureLoading}>
                    <div className="signature-result-item"><small>Algorithm</small><strong>HMAC-SHA256</strong></div>
                    <div className="signature-result-item"><small>Signature Status</small><strong className={signatureResult?.is_signed ? "signature-status-good" : "signature-status-neutral"}>{signatureResult?.is_signed ? "Signed" : "Not Signed"}</strong></div>
                    <div className="signature-result-item"><small>Verification Status</small><strong className={signatureResult?.is_valid ? "signature-status-good" : signatureResult?.is_signed ? "signature-status-bad" : "signature-status-neutral"}>{signatureResult?.verification_status || "Not Verified"}</strong></div>
                    <div className="signature-result-item signature-hash-item"><small>Payload Hash</small><code>{signatureResult?.computed_hash || signatureResult?.payload_hash || signatureResult?.expected_hash || "Not available"}</code></div>
                  </div>
                  {signatureLoading && <p className="signature-loading-message" role="status">Checking version {signatureVersion}…</p>}
                  {signatureResult?.detail && <p className={`signature-detail ${signatureResult.is_valid ? "signature-status-good" : signatureResult.is_signed ? "signature-status-bad" : "signature-status-neutral"}`}>{signatureResult.detail}</p>}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {pdfPreviewUrl && (
        <div role="dialog" aria-modal="true" aria-label="PDF document preview" className="pdf-preview-backdrop" onClick={() => setPdfPreviewUrl("")}>
          <div className="pdf-preview-dialog" onClick={(event) => event.stopPropagation()}>
            <div className="pdf-preview-header">
              <strong>{activeDoc?.title || "Document PDF"} · v{activeDoc?.current_version}</strong>
              <button type="button" className="secondary-btn" onClick={() => setPdfPreviewUrl("")}>Close preview</button>
            </div>
            <iframe title="Current canonical document PDF" src={pdfPreviewUrl} className="pdf-preview-frame" />
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
