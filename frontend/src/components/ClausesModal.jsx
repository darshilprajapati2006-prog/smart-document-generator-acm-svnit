import { useState, useEffect } from "react";
import { fetchClauses, interpolateClause } from "../services/documentApi";

export default function ClausesModal({ documentType, formValues, onInsertClause, onClose }) {
  const [clauses, setClauses] = useState([]);
  const [selectedClauseId, setSelectedClauseId] = useState("");
  const [interpolatedText, setInterpolatedText] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const res = await fetchClauses(documentType);
        if (!active) return;
        setClauses(res.clauses || []);
        if (res.clauses && res.clauses.length > 0) {
          setSelectedClauseId(res.clauses[0].id);
          try {
            const interpolated = await interpolateClause(res.clauses[0].id, res.clauses[0].content, formValues);
            if (active) setInterpolatedText(interpolated.rendered_content);
          } catch {
            if (active) setInterpolatedText(res.clauses[0].content);
          }
        }
      } catch {
        // fallback
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [documentType, formValues]);

  async function handlePreviewClause(clause) {
    if (!clause) return;
    try {
      const res = await interpolateClause(clause.id, clause.content, formValues);
      setInterpolatedText(res.rendered_content);
    } catch {
      setInterpolatedText(clause.content);
    }
  }

  function handleSelectChange(e) {
    const cid = e.target.value;
    setSelectedClauseId(cid);
    const found = clauses.find(c => c.id === cid);
    handlePreviewClause(found);
  }

  function handleInsert() {
    if (interpolatedText) {
      onInsertClause(interpolatedText);
      onClose();
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
      <div style={{ background: "#ffffff", padding: "20px", borderRadius: "10px", width: "540px", maxWidth: "90%" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <h3 style={{ margin: 0, fontSize: "1.15rem", color: "#0f172a" }}>
            📑 Pre-Approved Reusable Clauses (Feature 6)
          </h3>
          <button type="button" onClick={onClose} style={{ background: "transparent", border: "none", fontSize: "1.2rem", cursor: "pointer" }}>✕</button>
        </div>

        <p style={{ margin: "0 0 12px 0", fontSize: "0.85rem", color: "#64748b" }}>
          Select standard institute-approved language to safely interpolate variables into your document without manual re-typing.
        </p>

        {loading && (
          <div style={{ fontSize: "0.85rem", color: "#64748b", marginBottom: "8px" }}>
            Loading approved clauses...
          </div>
        )}

        {clauses.length === 0 ? (
          <div style={{ padding: "20px", textAlign: "center", color: "#64748b" }}>
            No clauses available for this document type.
          </div>
        ) : (
          <div>
            <label style={{ fontSize: "0.85rem", fontWeight: "600", color: "#334155" }}>Select Clause Template:</label>
            <select
              value={selectedClauseId}
              onChange={handleSelectChange}
              style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1", margin: "6px 0 12px 0" }}
            >
              {clauses.map(c => (
                <option key={c.id} value={c.id}>
                  [{c.category.toUpperCase()}] {c.name}
                </option>
              ))}
            </select>

            <label style={{ fontSize: "0.85rem", fontWeight: "600", color: "#334155" }}>Interpolated Preview:</label>
            <div style={{ padding: "12px", background: "#f8fafc", borderRadius: "6px", border: "1px solid #e2e8f0", fontSize: "0.85rem", minHeight: "80px", margin: "6px 0 16px 0", lineHeight: "1.5" }}>
              {interpolatedText}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button type="button" className="secondary-btn" onClick={onClose}>Cancel</button>
              <button type="button" className="primary-btn" onClick={handleInsert}>Insert into Form</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
