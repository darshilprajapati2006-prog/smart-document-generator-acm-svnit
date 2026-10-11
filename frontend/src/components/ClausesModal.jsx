import React, { useState, useEffect, useMemo } from "react";
import { fetchClauses, interpolateClause } from "../services/documentApi";

// Verified institutional fallback catalog matching database seeds
// Ensures instantaneous availability and zero downtime even during server cold-starts
const VERIFIED_FALLBACK_CLAUSES = [
  // Executive Meet
  {
    id: "cl-exec-hall-guidelines",
    name: "SVNIT Seminar Hall Usage & Decorum Rules",
    category: "Decorum",
    applicable_types: "exec_meet",
    applicable_types_list: ["exec_meet"],
    content: "The organizers undertake to ensure that Seminar Hall property, audiovisual systems, and air conditioning equipment are handled with due care on {{event_date}}. No eatables are permitted inside the hall premises.",
    variables: ["event_date"],
    approval_status: "pre_approved",
    active: 1
  },
  {
    id: "cl-exec-obj-workshop",
    name: "Technical Workshop Learning Objectives",
    category: "Objective",
    applicable_types: "exec_meet",
    applicable_types_list: ["exec_meet"],
    content: "To impart practical exposure, industry-aligned technical skills, and collaborative hands-on knowledge to students of SVNIT through structured domain sessions for {{event_name}}.",
    variables: ["event_name"],
    approval_status: "pre_approved",
    active: 1
  },
  {
    id: "cl-exec-venue-permission",
    name: "Executive Meet Venue Reservation Request",
    category: "Permission",
    applicable_types: "exec_meet",
    applicable_types_list: ["exec_meet"],
    content: "Permission is kindly requested to reserve {{venue}} for {{event_name}} on {{event_date}} from {{time_from}} to {{time_to}} for approximately {{participants}} attendees, coordinated by {{lead_name}}.",
    variables: ["venue", "event_name", "event_date", "time_from", "time_to", "participants", "lead_name"],
    approval_status: "sample_draft",
    active: 1
  },
  {
    id: "cl-exec-online-platform",
    name: "Online / Hybrid Session Recording Notice",
    category: "Virtual Conduct",
    applicable_types: "exec_meet",
    applicable_types_list: ["exec_meet"],
    content: "The virtual session for {{event_name}} will be hosted on {{online_meeting_platform}} (Link: {{online_meeting_link}}). Participants are advised that sessions may be recorded for archival purposes.",
    variables: ["event_name", "online_meeting_platform", "online_meeting_link"],
    approval_status: "sample_draft",
    active: 1
  },

  // Bill Certificate
  {
    id: "cl-bill-cert-audit",
    name: "SVNIT Store & Purchase Audit Declaration",
    category: "Compliance",
    applicable_types: "bill_certificate",
    applicable_types_list: ["bill_certificate"],
    content: "Certified that the purchases detailed herein from {{supplier_name}} (Invoice {{invoice_no_and_date}}) were made in the best interest of the Chapter activities, rates are reasonable, and items have been entered into the recurring stock register.",
    variables: ["supplier_name", "invoice_no_and_date"],
    approval_status: "pre_approved",
    active: 1
  },
  {
    id: "cl-bill-cert-tax-exemption",
    name: "GST Surcharge & Tax Invoice Verification",
    category: "Taxation",
    applicable_types: "bill_certificate",
    applicable_types_list: ["bill_certificate"],
    content: "Certified that statutory GST applied by vendor {{supplier_name}} (GSTIN: {{supplier_gst}}) is consistent with government procurement guidelines for educational chapters.",
    variables: ["supplier_name", "supplier_gst"],
    approval_status: "pre_approved",
    active: 1
  },
  {
    id: "cl-bill-cert-advance-settle",
    name: "Advance Settlement & Account Adjustment",
    category: "Accounting",
    applicable_types: "bill_certificate",
    applicable_types_list: ["bill_certificate"],
    content: "The expenditure for {{chapter_name}} under Head of Account {{head_of_account}} is certified for direct payment to {{party_name}} against Bank Account {{account_number}} ({{bank_name}}).",
    variables: ["chapter_name", "head_of_account", "party_name", "account_number", "bank_name"],
    approval_status: "sample_draft",
    active: 1
  },

  // Bill Summary
  {
    id: "cl-bill-sum-contingency",
    name: "Contingency Reimbursement Verification",
    category: "Verification",
    applicable_types: "bill_summary",
    applicable_types_list: ["bill_summary"],
    content: "All expenditure vouchers and payment receipts for {{subtitle}} have been verified by the student head and faculty chairman. Amount claimed reflects actual expenses incurred.",
    variables: ["subtitle"],
    approval_status: "pre_approved",
    active: 1
  },
  {
    id: "cl-bill-sum-disbursement",
    name: "Electronic Bank Transfer Reimbursement Mandate",
    category: "Disbursement",
    applicable_types: "bill_summary",
    applicable_types_list: ["bill_summary"],
    content: "Reimbursement amounts approved under {{title}} shall be disbursed directly to beneficiary bank accounts under Chapter Code 6/52 with approval of {{faculty_chairman_name}}.",
    variables: ["title", "faculty_chairman_name"],
    approval_status: "pre_approved",
    active: 1
  },
  {
    id: "cl-bill-sum-hackathon-prizes",
    name: "Competition Prize Distribution Acknowledgement",
    category: "Prizes",
    applicable_types: "bill_summary",
    applicable_types_list: ["bill_summary"],
    content: "Certified that prizes awarded for {{subtitle}} have been adjudicated according to official evaluation rubrics verified by Student Head {{student_head_name}} and Student Secretary {{student_secretary_name}}.",
    variables: ["subtitle", "student_head_name", "student_secretary_name"],
    approval_status: "sample_draft",
    active: 1
  }
];

export default function ClausesModal({
  isOpen,
  onClose,
  documentType,
  docType,
  formValues = {},
  onInsertClause,
  onSelectClause
}) {
  if (!isOpen) return null;

  const activeDocType = documentType || docType || "exec_meet";
  const handleInsertProp = onInsertClause || onSelectClause;

  const [clauses, setClauses] = useState([]);
  const [selectedClauseId, setSelectedClauseId] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [customVariables, setCustomVariables] = useState({});
  const [targetField, setTargetField] = useState("");
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState(null);

  // Set default insertion target field based on document type
  useEffect(() => {
    if (activeDocType === "exec_meet") {
      setTargetField("brief_description");
    } else if (activeDocType === "bill_certificate") {
      setTargetField("tax_details");
    } else if (activeDocType === "bill_summary") {
      setTargetField("subtitle");
    }
  }, [activeDocType]);

  // Fetch clauses from API with reliable verified fallback
  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setApiError(null);
      try {
        const res = await fetchClauses(activeDocType);
        if (!active) return;
        const fetched = res?.clauses || [];
        if (fetched.length > 0) {
          setClauses(fetched);
          setSelectedClauseId(fetched[0].id);
        } else {
          // Fallback to verified local clauses for this docType
          const fallback = VERIFIED_FALLBACK_CLAUSES.filter(c =>
            c.applicable_types.split(",").map(s => s.trim()).includes(activeDocType)
          );
          setClauses(fallback);
          if (fallback.length > 0) setSelectedClauseId(fallback[0].id);
        }
      } catch (err) {
        console.warn("Could not reach backend clauses endpoint, using verified catalog:", err);
        if (!active) return;
        setApiError("Backend clauses sync offline. Displaying verified institutional clause catalog.");
        const fallback = VERIFIED_FALLBACK_CLAUSES.filter(c =>
          c.applicable_types.split(",").map(s => s.trim()).includes(activeDocType)
        );
        setClauses(fallback);
        if (fallback.length > 0) setSelectedClauseId(fallback[0].id);
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [activeDocType]);

  // Categories for the active document type
  const categories = useMemo(() => {
    const set = new Set();
    clauses.forEach(c => {
      if (c.category) set.add(c.category);
    });
    return ["all", ...Array.from(set)];
  }, [clauses]);

  // Filter clauses by selected category
  const filteredClauses = useMemo(() => {
    if (selectedCategory === "all") return clauses;
    return clauses.filter(c => c.category === selectedCategory);
  }, [clauses, selectedCategory]);

  // Selected clause object
  const activeClause = useMemo(() => {
    return clauses.find(c => c.id === selectedClauseId) || filteredClauses[0] || null;
  }, [clauses, filteredClauses, selectedClauseId]);

  // Interpolation logic: combine formValues with custom modal variable inputs
  const { renderedContent, missingVars, allVars } = useMemo(() => {
    if (!activeClause) return { renderedContent: "", missingVars: [], allVars: [] };
    const content = activeClause.content || "";
    const regex = /\{\{([a-zA-Z0-9_]+)\}\}/g;
    const missing = [];
    const varsFound = [];

    const rendered = content.replace(regex, (_, key) => {
      varsFound.push(key);
      // Priority 1: User typed value in modal input
      if (customVariables[key] !== undefined && customVariables[key].trim() !== "") {
        return customVariables[key];
      }
      // Priority 2: Active form value
      if (formValues && formValues[key] !== undefined && String(formValues[key]).trim() !== "") {
        return String(formValues[key]);
      }
      // Missing variable
      missing.push(key);
      return `[${key.replace(/_/g, " ").toUpperCase()}]`;
    });

    return {
      renderedContent: rendered,
      missingVars: Array.from(new Set(missing)),
      allVars: Array.from(new Set(varsFound))
    };
  }, [activeClause, customVariables, formValues]);

  function handleSelectChange(e) {
    setSelectedClauseId(e.target.value);
    setCustomVariables({}); // Reset custom overrides on clause change
  }

  function handleCustomVariableChange(varName, value) {
    setCustomVariables(prev => ({
      ...prev,
      [varName]: value
    }));
  }

  function handleInsert() {
    if (!renderedContent) return;
    if (typeof handleInsertProp === "function") {
      handleInsertProp(renderedContent, targetField);
    }
    onClose();
  }

  // Display human-readable title for document type
  const docTypeTitle = {
    exec_meet: "Executive Meet",
    bill_certificate: "Bill Certificate",
    bill_summary: "Bill Summary"
  }[activeDocType] || activeDocType;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="clauses-modal-title"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.75)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "16px"
      }}
    >
      <div
        className="theme-modal-card clauses-modal-card"
        style={{
          background: "#ffffff",
          borderRadius: "14px",
          width: "680px",
          maxWidth: "100%",
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
          border: "1px solid #e2e8f0",
          overflow: "hidden"
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: "18px 24px",
            borderBottom: "1px solid #f1f5f9",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "#f8fafc"
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
              <span style={{ fontSize: "1.25rem" }}>📑</span>
              <h3
                id="clauses-modal-title"
                style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700, color: "var(--text, #0f172a)" }}
              >
                Standard Reusable Clauses
              </h3>
              <span
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  padding: "2px 8px",
                  borderRadius: "12px",
                  background: "#e0e7ff",
                  color: "#3730a3"
                }}
              >
                {docTypeTitle}
              </span>
            </div>
            <p style={{ margin: 0, fontSize: "0.82rem", color: "#64748b" }}>
              Select verified SVNIT chapter clauses and safely interpolate variables without manual re-typing.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            style={{
              background: "transparent",
              border: "none",
              fontSize: "1.3rem",
              color: "#94a3b8",
              cursor: "pointer",
              padding: "4px 8px",
              borderRadius: "6px"
            }}
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: "20px 24px", overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: "16px" }}>
          {apiError && (
            <div style={{ padding: "8px 12px", background: "#fef3c7", border: "1px solid #fde68a", borderRadius: "6px", fontSize: "0.8rem", color: "#92400e" }}>
              ℹ️ {apiError}
            </div>
          )}

          {loading ? (
            <div style={{ padding: "30px", textAlign: "center", color: "#64748b", fontSize: "0.9rem" }}>
              Loading approved clauses...
            </div>
          ) : clauses.length === 0 ? (
            <div style={{ padding: "30px", textAlign: "center", color: "#64748b", fontSize: "0.9rem" }}>
              No clauses available for this document type.
            </div>
          ) : (
            <>
              {/* Category Filter Tabs */}
              {categories.length > 2 && (
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {categories.map(cat => (
                    <button
                      key={cat}
                      type="button"
                      className={`clause-category-tab${selectedCategory === cat ? " is-active" : ""}`}
                      onClick={() => setSelectedCategory(cat)}
                      style={{
                        padding: "5px 12px",
                        borderRadius: "20px",
                        fontSize: "0.78rem",
                        fontWeight: 600,
                        cursor: "pointer",
                        border: selectedCategory === cat ? "1px solid #0284c7" : "1px solid #e2e8f0",
                        background: selectedCategory === cat ? "#0284c7" : "#f8fafc",
                        color: selectedCategory === cat ? "#ffffff" : "#475569"
                      }}
                    >
                      {cat === "all" ? "All Categories" : cat}
                    </button>
                  ))}
                </div>
              )}

              {/* Clause Selector */}
              <div>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "#334155", marginBottom: "6px" }}>
                  Select Clause:
                </label>
                <select
                  value={activeClause?.id || ""}
                  onChange={handleSelectChange}
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    fontSize: "0.88rem",
                    color: "#0f172a",
                    background: "#ffffff"
                  }}
                >
                  {filteredClauses.map(c => (
                    <option key={c.id} value={c.id}>
                      [{c.category.toUpperCase()}] {c.name} {c.approval_status === "pre_approved" ? "✓ [Pre-Approved]" : "🧪 [Sample Draft]"}
                    </option>
                  ))}
                </select>
              </div>

              {/* Clause Metadata Badges */}
              {activeClause && (
                <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", fontSize: "0.78rem" }}>
                  <span style={{ color: "#64748b" }}>Status:</span>
                  {activeClause.approval_status === "pre_approved" ? (
                    <span
                      style={{
                        padding: "3px 10px",
                        borderRadius: "12px",
                        background: "#dcfce7",
                        color: "#166534",
                        fontWeight: 600
                      }}
                    >
                      ✓ Officially Pre-Approved (ACM Maintainer)
                    </span>
                  ) : (
                    <span
                      style={{
                        padding: "3px 10px",
                        borderRadius: "12px",
                        background: "#fef9c3",
                        color: "#854d0e",
                        fontWeight: 600
                      }}
                    >
                      🧪 Sample / Draft Clause
                    </span>
                  )}
                  <span style={{ color: "#94a3b8" }}>•</span>
                  <span style={{ color: "#64748b" }}>Category: <strong>{activeClause.category}</strong></span>
                </div>
              )}

              {/* Variable Interpolation Editor */}
              {allVars.length > 0 && (
                <div
                  style={{
                    background: "var(--surface-raised)",
                    border: "1px solid var(--line)",
                    borderRadius: "8px",
                    padding: "12px 14px"
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                      Template Variables ({allVars.length})
                    </span>
                    {missingVars.length > 0 ? (
                      <span style={{ fontSize: "0.75rem", color: "var(--warning)", fontWeight: 600 }}>
                        ⚠️ {missingVars.length} variable{missingVars.length > 1 ? "s" : ""} pending input
                      </span>
                    ) : (
                      <span style={{ fontSize: "0.75rem", color: "var(--success)", fontWeight: 600 }}>
                        ✓ All variables resolved
                      </span>
                    )}
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "8px" }}>
                    {allVars.map(v => {
                      const isFromForm = formValues && formValues[v] !== undefined && String(formValues[v]).trim() !== "";
                      const currentVal = customVariables[v] !== undefined ? customVariables[v] : (formValues[v] || "");
                      return (
                        <div key={v}>
                          <label
                            className="clause-variable-label"
                            style={{
                              display: "block",
                              fontSize: "0.73rem",
                              fontWeight: 600,
                              color: isFromForm ? "var(--violet)" : "var(--muted)",
                              marginBottom: "2px"
                            }}
                          >
                            {v} {isFromForm ? "(from form)" : "*"}
                          </label>
                          <input
                            type="text"
                            placeholder={`Enter ${v.replace(/_/g, " ")}`}
                            value={currentVal}
                            onChange={(e) => handleCustomVariableChange(v, e.target.value)}
                            style={{
                              width: "100%",
                              padding: "6px 8px",
                              fontSize: "0.8rem",
                              borderRadius: "5px",
                              border: isFromForm ? "1px solid rgba(179, 155, 255, 0.45)" : "1px solid var(--line)",
                              background: "var(--surface-soft)",
                              color: "var(--text)"
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Live Preview Box */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                  <label style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                    Interpolated Live Preview:
                  </label>
                  <span style={{ fontSize: "0.72rem", color: "var(--muted)" }}>
                    Safe regex variable interpolation (no code execution)
                  </span>
                </div>
                <div
                  style={{
                    padding: "14px",
                    background: "var(--surface-soft)",
                    borderRadius: "8px",
                    border: "1px solid var(--line)",
                    fontSize: "0.88rem",
                    lineHeight: "1.6",
                    color: "var(--text-secondary)",
                    minHeight: "85px",
                    whiteSpace: "pre-wrap"
                  }}
                >
                  {renderedContent}
                </div>
              </div>

              {/* Target Section Selector */}
              <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "0.82rem" }}>
                <label style={{ fontWeight: 600, color: "#334155" }}>
                  Insert into Section:
                </label>
                <select
                  value={targetField}
                  onChange={(e) => setTargetField(e.target.value)}
                  style={{
                    padding: "6px 10px",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    fontSize: "0.82rem",
                    color: "#0f172a"
                  }}
                >
                  {activeDocType === "exec_meet" && (
                    <>
                      <option value="brief_description">Brief Description / Event Details</option>
                      <option value="objective">Objective / Learning Outcomes</option>
                    </>
                  )}
                  {activeDocType === "bill_certificate" && (
                    <>
                      <option value="tax_details">Tax / Remarks Details</option>
                      <option value="expenditure_purpose">Expenditure Purpose</option>
                    </>
                  )}
                  {activeDocType === "bill_summary" && (
                    <>
                      <option value="subtitle">Document Subtitle</option>
                      <option value="title">Document Title</option>
                    </>
                  )}
                </select>
              </div>
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: "14px 24px",
            borderTop: "1px solid #f1f5f9",
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            gap: "12px",
            background: "#f8fafc"
          }}
        >
          <button
            type="button"
            className="secondary-button"
            onClick={onClose}
            style={{
              padding: "8px 16px",
              borderRadius: "6px",
              border: "1px solid #cbd5e1",
              background: "#ffffff",
              color: "#475569",
              fontSize: "0.85rem",
              fontWeight: 500,
              cursor: "pointer"
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={handleInsert}
            disabled={!renderedContent}
            style={{
              padding: "8px 18px",
              borderRadius: "6px",
              border: "none",
              background: renderedContent ? "#0284c7" : "#94a3b8",
              color: "#ffffff",
              fontSize: "0.85rem",
              fontWeight: 600,
              cursor: renderedContent ? "pointer" : "not-allowed",
              boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.05)"
            }}
          >
            Insert Clause into Document
          </button>
        </div>
      </div>
    </div>
  );
}
