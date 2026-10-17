import { useEffect, useRef, useState } from "react";
import { fetchTemplateConfigs, fetchTemplatePreview, updateTemplateConfig } from "../services/documentApi";

const TEMPLATE_OPTIONS = [
  { id: "exec_meet", label: "Executive Meet Request" },
  { id: "prize_money_receipt", label: "Prize Money Receipt" },
  { id: "bill_certificate", label: "Bill Certificate (Recurring)" },
  { id: "bill_summary", label: "Bill Summary" },
];
const EDITOR_ROLES = new Set(["template_admin", "tmpladmin", "admin"]);

function labelForKey(key) {
  return String(key)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export default function TemplateEditorPanel({ currentRole }) {
  const [configs, setConfigs] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState("exec_meet");
  const [preview, setPreview] = useState(null);
  const [loadingConfigs, setLoadingConfigs] = useState(true);
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState({ type: "", message: "" });
  const [displayName, setDisplayName] = useState("");
  const [sectionOrdering, setSectionOrdering] = useState([]);
  const [branding, setBranding] = useState({});
  const previewRequestId = useRef(0);
  const canEdit = EDITOR_ROLES.has(currentRole);
  const options = configs.length
    ? configs.map((config) => {
      const id = config.template_id || config.document_type;
      return { id, label: config.display_name || TEMPLATE_OPTIONS.find((option) => option.id === id)?.label || labelForKey(id) };
    }).filter((option) => option.id)
    : TEMPLATE_OPTIONS;
  const activePreview = preview?.template_id === selectedTemplate ? preview : null;
  const instituteName = branding.institute || branding.org_name || branding.sheet_title || "Sardar Vallabhbhai National Institute of Technology, Surat";
  const departmentName = branding.department || branding.footer || "";

  useEffect(() => {
    let active = true;
    fetchTemplateConfigs()
      .then((result) => {
        if (active) setConfigs(Array.isArray(result.configs) ? result.configs : []);
      })
      .catch((error) => {
        if (active) setFeedback({ type: "error", message: error.message || "Could not load template configurations." });
      })
      .finally(() => {
        if (active) setLoadingConfigs(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    const requestId = ++previewRequestId.current;
    fetchTemplatePreview(selectedTemplate)
      .then((result) => {
        if (!active || requestId !== previewRequestId.current) return;
        setPreview(result);
        setDisplayName(result.display_name || "");
        setSectionOrdering(Array.isArray(result.section_ordering) ? result.section_ordering : []);
        setBranding(result.branding && typeof result.branding === "object" ? result.branding : {});
      })
      .catch((error) => {
        if (active && requestId === previewRequestId.current) {
          setPreview(null);
          setFeedback({ type: "error", message: error.message || "Could not load this template preview." });
        }
      })
      .finally(() => {
        if (active && requestId === previewRequestId.current) setLoadingPreview(false);
      });
    return () => { active = false; };
  }, [selectedTemplate]);

  function moveSection(index, direction) {
    setSectionOrdering((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function handleSaveConfig() {
    if (!canEdit || !activePreview || !displayName.trim()) return;
    setSaving(true);
    setFeedback({ type: "", message: "" });
    try {
      const saved = await updateTemplateConfig(selectedTemplate, {
        display_name: displayName.trim(),
        section_ordering: sectionOrdering,
        branding,
      });
      setDisplayName(saved.display_name || displayName.trim());
      setSectionOrdering(Array.isArray(saved.section_ordering) ? saved.section_ordering : sectionOrdering);
      setBranding(saved.branding && typeof saved.branding === "object" ? saved.branding : branding);
      setPreview((current) => current?.template_id === selectedTemplate ? { ...current, ...saved } : current);
      setConfigs((current) => current.map((config) => (
        (config.template_id || config.document_type) === selectedTemplate ? { ...config, ...saved } : config
      )));
      setFeedback({ type: "success", message: "Template settings saved." });
    } catch (error) {
      setFeedback({ type: "error", message: error.message || "Could not save template settings." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="page-panel template-page">
      <div className="page-panel-heading">
        <div>
          <h2 className="template-page-title">🎨 Template Preview &amp; Configuration Editor</h2>
          <p className="template-page-description">Preview sample layouts and configure document titles, section order, and branding.</p>
        </div>
      </div>

      {feedback.message && (
        <div className={`template-feedback template-feedback-${feedback.type}`} role={feedback.type === "error" ? "alert" : "status"}>
          {feedback.type === "success" ? "✓ " : "⚠ "}{feedback.message}
        </div>
      )}

      <div className="template-switcher" role="tablist" aria-label="Choose a document template">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={selectedTemplate === option.id}
            className={selectedTemplate === option.id ? "primary-btn" : "secondary-btn"}
            onClick={() => {
              if (selectedTemplate === option.id) return;
              setLoadingPreview(true);
              setFeedback({ type: "", message: "" });
              setSelectedTemplate(option.id);
            }}
            disabled={saving}
          >
            {option.label}
          </button>
        ))}
      </div>

      {currentRole && !canEdit && (
        <div className="template-access-note">
          🔒 Read-only preview. Template changes require Template Admin or System Admin access.
        </div>
      )}

      {loadingConfigs && !configs.length && <p className="template-loading" role="status">Loading template list…</p>}
      {loadingPreview && !activePreview && <p className="template-loading" role="status">Loading template preview…</p>}

      {activePreview && (
        <div className="template-editor-grid">
          <div className="template-settings-card">
            <h3 className="template-settings-title">⚙️ Template Settings</h3>

            <div className="template-field">
              <label htmlFor="template-display-name">Template display name</label>
              <input
                id="template-display-name"
                type="text"
                value={displayName}
                maxLength={120}
                onChange={(event) => setDisplayName(event.target.value)}
                disabled={!canEdit || saving}
              />
            </div>

            <fieldset className="template-order-fieldset" disabled={!canEdit || saving}>
              <legend>Section order</legend>
              {sectionOrdering.length ? (
                <ol className="template-order-list">
                  {sectionOrdering.map((section, index) => (
                    <li className="template-order-item" key={`${section}-${index}`}>
                      <span className="template-order-index">{index + 1}</span>
                      <span className="template-order-name">{labelForKey(section)}</span>
                      <span className="template-order-actions">
                        <button type="button" aria-label={`Move ${labelForKey(section)} up`} onClick={() => moveSection(index, -1)} disabled={index === 0 || !canEdit || saving}>↑</button>
                        <button type="button" aria-label={`Move ${labelForKey(section)} down`} onClick={() => moveSection(index, 1)} disabled={index === sectionOrdering.length - 1 || !canEdit || saving}>↓</button>
                      </span>
                    </li>
                  ))}
                </ol>
              ) : <p className="template-empty-state">No sections are configured for this template.</p>}
            </fieldset>

            {Object.keys(branding).length > 0 && (
              <fieldset className="template-branding-fieldset" disabled={!canEdit || saving}>
                <legend>Document branding</legend>
                {Object.entries(branding).map(([key, value]) => (
                  <div className="template-field" key={key}>
                    <label htmlFor={`template-branding-${key}`}>{labelForKey(key)}</label>
                    <input
                      id={`template-branding-${key}`}
                      type="text"
                      value={value == null ? "" : String(value)}
                      maxLength={240}
                      onChange={(event) => setBranding((current) => ({ ...current, [key]: event.target.value }))}
                      disabled={!canEdit || saving}
                    />
                  </div>
                ))}
              </fieldset>
            )}

            <button
              type="button"
              className="primary-btn template-save-button"
              onClick={handleSaveConfig}
              disabled={!canEdit || !activePreview || !displayName.trim() || saving || loadingPreview}
            >
              {saving ? "Saving…" : "Save Template Settings"}
            </button>
            <p className="template-permission-hint">Changes are saved to this template configuration.</p>
          </div>

          <div className="template-preview-paper" aria-label="Sample document preview">
            <div className="template-preview-warning">⚠️ {activePreview.preview_notice || "Sample preview only. Do not use as an official document."}</div>
            <header className="template-preview-header">
              <h3>{displayName || activePreview.display_name}</h3>
              <div>{instituteName}</div>
              {departmentName && <small>{departmentName}</small>}
            </header>
            <section className="template-preview-sections" aria-label="Configured section order">
              <h4>Document section order</h4>
              <ol>
                {sectionOrdering.map((section, index) => <li key={`${section}-${index}`}>{labelForKey(section)}</li>)}
              </ol>
            </section>
            <section className="template-sample-section">
              <h4>Sample data values</h4>
              <pre className="template-sample-data">{JSON.stringify(activePreview.sample_data || {}, null, 2)}</pre>
            </section>
          </div>
        </div>
      )}

      {!loadingPreview && !activePreview && !feedback.message && (
        <p className="template-empty-state" role="status">This template preview is unavailable.</p>
      )}
    </section>
  );
}
