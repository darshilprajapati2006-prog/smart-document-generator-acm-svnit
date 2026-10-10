import { useState, useEffect } from "react";
import { fetchTemplateConfigs, fetchTemplatePreview, updateTemplateConfig } from "../services/documentApi";

export default function TemplateEditorPanel({ currentRole }) {
  const [configs, setConfigs] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState("exec_meet");
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState({ type: "", message: "" });

  // Editable fields
  const [displayName, setDisplayName] = useState("");

  useEffect(() => {
    loadConfigs();
  }, []);

  useEffect(() => {
    if (selectedTemplate) {
      loadPreview(selectedTemplate);
    }
  }, [selectedTemplate]);

  async function loadConfigs() {
    try {
      const res = await fetchTemplateConfigs();
      setConfigs(res.configs || []);
    } catch (err) {
      setFeedback({ type: "error", message: err.message });
    }
  }

  async function loadPreview(tmplId) {
    setLoading(true);
    setFeedback({ type: "", message: "" });
    try {
      const res = await fetchTemplatePreview(tmplId);
      setPreview(res);
      setDisplayName(res.display_name || "");
    } catch (err) {
      setFeedback({ type: "error", message: err.message });
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveConfig() {
    setLoading(true);
    try {
      await updateTemplateConfig(selectedTemplate, {
        display_name: displayName
      });
      setFeedback({ type: "success", message: `Template settings for '${selectedTemplate}' saved successfully.` });
      loadConfigs();
    } catch (err) {
      setFeedback({ type: "error", message: err.message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="page-panel template-page">
      <div className="page-panel-heading">
        <div>
          <h2 style={{ fontSize: "1.3rem", fontWeight: "700", color: "#0f172a", margin: 0 }}>
            🎨 Template Preview & Configuration Editor (Feature 8)
          </h2>
          <p style={{ margin: "4px 0 0 0", color: "#64748b", fontSize: "0.9rem" }}>
            Preview template layout with isolated sample data and configure display titles, section order, and branding.
          </p>
        </div>
      </div>

      {feedback.message && (
        <div className={`feedback-banner ${feedback.type === "success" ? "feedback-success" : "feedback-error"}`} style={{
          padding: "10px 14px",
          background: feedback.type === "success" ? "#f0fdf4" : "#fef2f2",
          color: feedback.type === "success" ? "#166534" : "#991b1b",
          borderRadius: "8px",
          border: `1px solid ${feedback.type === "success" ? "#bbf7d0" : "#fecaca"}`,
          marginBottom: "1rem",
          fontSize: "0.9rem"
        }}>
          {feedback.type === "success" ? "✔ " : "⚠️ "} {feedback.message}
        </div>
      )}

      {/* Template Selectors */}
      <div className="template-switcher">
        {(configs.length > 0 ? configs.map((c) => c.document_type) : ["exec_meet", "bill_certificate", "bill_summary"]).map((tId) => (
          <button
            key={tId}
            type="button"
            className={selectedTemplate === tId ? "primary-btn" : "secondary-btn"}
            onClick={() => setSelectedTemplate(tId)}
            style={{ padding: "8px 16px", fontSize: "0.9rem" }}
          >
            {tId === "exec_meet" ? "Executive Meet" : tId === "bill_certificate" ? "Bill Certificate" : "Bill Summary"}
          </button>
        ))}
      </div>

      {currentRole && !["template_admin", "tmpladmin", "admin"].includes(currentRole) && (
        <div className="template-access-note">
          🔒 Read-Only Preview Mode: Role '{currentRole}' cannot modify institutional template configurations. Switch role to 'Template Admin' or 'System Admin' to save changes.
        </div>
      )}

      {preview && (
        <div className="template-editor-grid">
          {/* Settings Panel */}
          <div className="template-settings-card">
            <h4 style={{ fontSize: "0.95rem", fontWeight: "700", margin: "0 0 10px 0", color: "#1e293b" }}>
              ⚙️ Template Settings
            </h4>
            <div style={{ marginBottom: "12px" }}>
              <label style={{ fontSize: "0.82rem", fontWeight: "600", color: "#475569" }}>Template Display Name:</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1", marginTop: "4px" }}
              />
            </div>

            <div style={{ marginBottom: "12px" }}>
              <label style={{ fontSize: "0.82rem", fontWeight: "600", color: "#475569" }}>Section Ordering:</label>
              <div style={{ fontSize: "0.8rem", color: "#64748b", marginTop: "4px" }}>
                {preview.section_ordering.map((sec, idx) => (
                  <div key={sec} style={{ padding: "4px 8px", background: "#ffffff", borderRadius: "4px", border: "1px solid #e2e8f0", marginBottom: "4px" }}>
                    {idx + 1}. {sec}
                  </div>
                ))}
              </div>
            </div>

            <button
              type="button"
              className="primary-btn"
              onClick={handleSaveConfig}
              disabled={loading}
              style={{ width: "100%", padding: "8px", fontSize: "0.88rem" }}
            >
              {loading ? "Saving..." : "Save Template Settings"}
            </button>
            <p style={{ fontSize: "0.75rem", color: "#94a3b8", marginTop: "6px" }}>
              *Requires Template Administrator or Admin role.
            </p>
          </div>

          {/* Sample Preview Display */}
          <div className="template-preview-paper">
            <div className="template-preview-warning">
              ⚠️ {preview.preview_notice}
            </div>

            <div style={{ borderBottom: "2px solid #0f172a", paddingBottom: "10px", marginBottom: "12px" }}>
              <h3 style={{ margin: 0, fontSize: "1.1rem", color: "#0f172a" }}>{preview.display_name}</h3>
              <div style={{ fontSize: "0.82rem", color: "#64748b", marginTop: "2px" }}>
                {preview.branding?.institute || "Sardar Vallabhbhai National Institute of Technology, Surat"}
              </div>
            </div>

            <div style={{ fontSize: "0.88rem" }}>
              <div style={{ fontWeight: "700", color: "#1e293b", marginBottom: "8px" }}>Sample Data Values:</div>
              <pre className="template-sample-data">
                {JSON.stringify(preview.sample_data, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
