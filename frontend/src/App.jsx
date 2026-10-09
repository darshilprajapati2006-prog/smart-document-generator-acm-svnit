import { useState, useEffect } from "react";
import "./App.css";
import {
  checkBackendHealth,
  generateExecutiveMeet,
  generateBillCertificate,
  generateBillSummary,
  extractFromNLP,
  getFullDownloadUrl,
} from "./services/documentApi";

const documentCards = [
  {
    id: "exec_meet",
    title: "Executive Meet",
    description: "Event proposals, official schedules and permission requests for ACM activities.",
    icon: "📋",
  },
  {
    id: "bill_certificate",
    title: "Bill Certificate",
    description: "Recurring expenditure certification, dynamic line items, supplier & payment details.",
    icon: "🧾",
  },
  {
    id: "bill_summary",
    title: "Bill Summary",
    description: "Reimbursement summary, multiple recipients, prize distributions, and bank details.",
    icon: "💳",
  },
];

// Initial Form States
const initialExecState = {
  ref_no: "ACM/26-27/ROOM/009",
  date: new Date().toISOString().split("T")[0].split("-").reverse().join("/"),
  submitted_to: "HoD(CSE Dept.)",
  subject: "Requesting Permission to Conduct ACM Executives Meet in Seminar Hall 402, CSE Department.",
  event_name: "ACM Executives Meet",
  event_date: "15/10/2026",
  time_from: "06:00 PM",
  time_to: "07:30 PM",
  venue: "Seminar Hall 402, CSE Department",
  participants: "150+",
  mode: "Offline",
  organizers: "ACM Core 2026-27",
  brief_description:
    "ACM NIT Surat is organizing an Executive Meet to discuss the chapter’s vision, provide guidance on organizing events and initiatives, and facilitate effective collaboration among executive members. The meet will also focus on planning upcoming activities and coordinating group projects.",
  objective:
    "To provide guidance to the ACM executive team on organizing events, coordinating group projects, and fostering effective collaboration in alignment with the chapter’s vision and upcoming initiatives.",
  lead_name: "Ansh Gupta",
  lead_designation: "Chairperson, ACM",
  lead_admission_no: "I24AI005",
  lead_branch: "Artificial Intelligence",
  lead_mobile: "",
  tech_assist_name: "Sunny Bodiwala",
  tech_assist_designation: "Tech Assistant, Seminar Hall",
  tech_assist_branch: "Computer Science & Engineering",
  tech_assist_mobile: "",
  faculty_incharge_name: "Shri. Rakesh P. Gohil",
  faculty_incharge_designation: "Faculty in-charge, Seminar Hall",
  faculty_incharge_branch: "Computer Science & Engineering",
  faculty_chairman_name: "Dr. Sankita J. Patel",
  faculty_chairman_designation: "Chairman, ACM",
  faculty_chairman_branch: "Computer Science & Engineering",
};

const initialBillCertState = {
  chapter_name: "ACM",
  code_no: "6/52",
  approval_note_no: "ACM/2026-27/SIH/001",
  date: new Date().toISOString().split("T")[0].split("-").reverse().join("/"),
  purchase_order_no: "NiL",
  head_of_account: "6/52",
  advance_drawn: "NiL",
  certifier_name: "Dr. Sankita J. Patel",
  items: [
    { name: "Executive Meet Stage Backdrop & Banner", quantity: 1, unit_cost: 1200 },
    { name: "Refreshments for Guest Speakers & Volunteers", quantity: 25, unit_cost: 60 },
  ],
  taxes_or_other_charges: 0,
  supplier_name: "Surat Digital Prints & Services",
  supplier_gst: "24AAACS1234D1Z5",
  any_other_taxes: "-",
  invoice_no_and_date: "INV-2026/089 dtd 08/09/2026",
  party_name: "Surat Digital Prints",
  account_number: "987654321012",
  account_holder_name: "Surat Digital Prints & Services",
  bank_name: "State Bank of India",
  branch_name: "SVNIT Campus Branch",
  ifsc_code: "SBIN0003320",
  lab_office: "Student Council",
  register_type: "Recurring Register",
  serial_number: "04",
  page_number: "42",
  stock_date: "08/09/2026",
  clerk_name: "M. K. Sharma",
  indenter_name: "Dr. Sankita J. Patel",
  indenter_designation: "Assistant Professor",
  indenter_department: "CSE",
};

const initialBillSummaryState = {
  date: new Date().toISOString().split("T")[0].split("-").reverse().join("/"),
  title: "BILL SUMMARY",
  subtitle: "Reimbursement for Cost incurred in SIH Internal Hackathon",
  rows: [
    {
      name: "Team Binary Bosses (1st Place)",
      account_details: "A/C: 38291048291, IFSC: SBIN0003320",
      to_be_paid_to: "Aarav Sharma",
      prize_money: 5000,
      other_amount: 0,
      account_no: "38291048291",
      ifsc_code: "SBIN0003320",
    },
    {
      name: "Team Quantum Coders (2nd Place)",
      account_details: "A/C: 98127391823, IFSC: HDFC0001827",
      to_be_paid_to: "Priya Patel",
      prize_money: 3000,
      other_amount: 0,
      account_no: "98127391823",
      ifsc_code: "HDFC0001827",
    },
  ],
  student_head_name: "Ansh Gupta",
  student_head_title: "Student Head",
  student_secretary_name: "Arshad Khatib",
  student_secretary_title: "Student Secretary",
  faculty_chairman_name: "Dr. Sankita Patel",
  faculty_chairman_title: "Faculty Chairman",
  club_name: "ACM NIT-Surat",
};

export default function App() {
  const [selectedType, setSelectedType] = useState("exec_meet");
  const [execData, setExecData] = useState(initialExecState);
  const [billCertData, setBillCertData] = useState(initialBillCertState);
  const [billSummaryData, setBillSummaryData] = useState(initialBillSummaryState);

  // Flow State
  const [reviewState, setReviewState] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedResult, setGeneratedResult] = useState(null);
  const [error, setError] = useState("");
  const [apiOnline, setApiOnline] = useState(false);

  // NLP State
  const [showNlp, setShowNlp] = useState(false);
  const [nlpPrompt, setNlpPrompt] = useState("");
  const [nlpLoading, setNlpLoading] = useState(false);
  const [nlpSuccessNote, setNlpSuccessNote] = useState("");

  // Live health check
  useEffect(() => {
    async function checkHealth() {
      const isHealthy = await checkBackendHealth();
      setApiOnline(isHealthy);
    }
    checkHealth();
    const interval = setInterval(checkHealth, 10000);
    return () => clearInterval(interval);
  }, []);

  function handleTypeChange(type) {
    setSelectedType(type);
    setReviewState(null);
    setGeneratedResult(null);
    setError("");
  }

  // NLP Assistant extraction
  async function handleNlpExtract() {
    if (!nlpPrompt.trim()) return;
    setNlpLoading(true);
    setError("");
    setNlpSuccessNote("");

    try {
      const res = await extractFromNLP(nlpPrompt);
      if (res && res.extracted_fields) {
        if (res.recommended_type && res.recommended_type !== selectedType) {
          setSelectedType(res.recommended_type);
        }

        if (res.recommended_type === "exec_meet" || selectedType === "exec_meet") {
          setExecData((prev) => ({
            ...prev,
            ...res.extracted_fields,
          }));
        }

        setNlpSuccessNote(
          `Extracted candidate event details for ${res.recommended_type.toUpperCase()}. Please review and confirm the form values.`
        );
      }
    } catch (err) {
      setError(`NLP assistant failed: ${err.message}. Please complete the structured form.`);
    } finally {
      setNlpLoading(false);
    }
  }

  // Dynamic Item row handlers for Bill Certificate
  function addBillItem() {
    setBillCertData((prev) => ({
      ...prev,
      items: [...prev.items, { name: "", quantity: 1, unit_cost: 0 }],
    }));
  }

  function removeBillItem(index) {
    if (billCertData.items.length <= 1) {
      setError("At least one bill item is required.");
      return;
    }
    setBillCertData((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  }

  function updateBillItem(index, field, value) {
    setBillCertData((prev) => {
      const newItems = [...prev.items];
      newItems[index] = { ...newItems[index], [field]: value };
      return { ...prev, items: newItems };
    });
  }

  // Dynamic Recipient row handlers for Bill Summary
  function addRecipientRow() {
    setBillSummaryData((prev) => ({
      ...prev,
      rows: [
        ...prev.rows,
        {
          name: "",
          account_details: "",
          to_be_paid_to: "",
          prize_money: 0,
          other_amount: 0,
          account_no: "",
          ifsc_code: "",
        },
      ],
    }));
  }

  function removeRecipientRow(index) {
    if (billSummaryData.rows.length <= 1) {
      setError("At least one recipient row is required.");
      return;
    }
    setBillSummaryData((prev) => ({
      ...prev,
      rows: prev.rows.filter((_, i) => i !== index),
    }));
  }

  function updateRecipientRow(index, field, value) {
    setBillSummaryData((prev) => {
      const newRows = [...prev.rows];
      newRows[index] = { ...newRows[index], [field]: value };
      return { ...prev, rows: newRows };
    });
  }

  // Calculation helpers for UI preview
  const certSubtotal = billCertData.items.reduce(
    (sum, itm) => sum + (Number(itm.quantity) || 0) * (Number(itm.unit_cost) || 0),
    0
  );
  const certGrandTotal = certSubtotal + (Number(billCertData.taxes_or_other_charges) || 0);

  const summaryPrizeTotal = billSummaryData.rows.reduce(
    (sum, r) => sum + (Number(r.prize_money) || 0),
    0
  );
  const summaryOtherTotal = billSummaryData.rows.reduce(
    (sum, r) => sum + (Number(r.other_amount) || 0),
    0
  );
  const summaryGrandTotal = summaryPrizeTotal + summaryOtherTotal;

  // STEP 3: Handle Review
  function handleReviewClick(e) {
    e.preventDefault();
    setError("");
    setGeneratedResult(null);

    // Validation
    if (selectedType === "exec_meet") {
      if (!execData.event_name.trim() || !execData.event_date.trim() || !execData.venue.trim()) {
        setError("Please enter the Event Name, Event Date, and Venue.");
        return;
      }
      setReviewState({
        type: "Executive Meet",
        data: { ...execData },
        displayFields: [
          { label: "Reference Number", value: execData.ref_no },
          { label: "Document Date", value: execData.date },
          { label: "Submitted To", value: execData.submitted_to },
          { label: "Event Name", value: execData.event_name },
          { label: "Event Date & Time", value: `${execData.event_date} (${execData.time_from} - ${execData.time_to})` },
          { label: "Venue", value: execData.venue },
          { label: "Participants", value: execData.participants },
          { label: "Mode", value: execData.mode },
          { label: "Organizers", value: execData.organizers },
          { label: "Objective", value: execData.objective },
          { label: "Student Lead", value: `${execData.lead_name} (${execData.lead_designation})` },
          { label: "Faculty Chairman", value: `${execData.faculty_chairman_name} (${execData.faculty_chairman_designation})` },
        ],
      });
    } else if (selectedType === "bill_certificate") {
      if (!billCertData.supplier_name.trim()) {
        setError("Please enter the Supplier Name.");
        return;
      }
      for (const itm of billCertData.items) {
        if (!itm.name.trim() || Number(itm.quantity) <= 0 || Number(itm.unit_cost) < 0) {
          setError("All items must have a valid description, positive quantity, and valid unit cost.");
          return;
        }
      }
      setReviewState({
        type: "Bill Certificate",
        data: { ...billCertData },
        displayFields: [
          { label: "Chapter & Code", value: `${billCertData.chapter_name} (Code: ${billCertData.code_no})` },
          { label: "Approval Note No.", value: billCertData.approval_note_no },
          { label: "Certificate Date", value: billCertData.date },
          { label: "Certifier Name", value: billCertData.certifier_name },
          { label: "Supplier Name", value: billCertData.supplier_name },
          { label: "Invoice No. & Date", value: billCertData.invoice_no_and_date || "N/A" },
          { label: "Beneficiary Party", value: billCertData.party_name || billCertData.supplier_name },
          { label: "Bank & IFSC", value: `${billCertData.bank_name || "-"} (${billCertData.ifsc_code || "-"})` },
          { label: "Indenter Faculty", value: `${billCertData.indenter_name}, ${billCertData.indenter_designation}` },
        ],
        calculation: {
          subtotal: certSubtotal,
          taxes: Number(billCertData.taxes_or_other_charges) || 0,
          total: certGrandTotal,
        },
      });
    } else if (selectedType === "bill_summary") {
      if (!billSummaryData.date.trim() || !billSummaryData.title.trim()) {
        setError("Please enter the Document Date and Title.");
        return;
      }
      for (const row of billSummaryData.rows) {
        if (!row.name.trim()) {
          setError("Every recipient row must have a valid recipient name.");
          return;
        }
      }
      setReviewState({
        type: "Bill Summary",
        data: { ...billSummaryData },
        displayFields: [
          { label: "Document Date", value: billSummaryData.date },
          { label: "Title", value: billSummaryData.title },
          { label: "Event Activity Subtitle", value: billSummaryData.subtitle },
          { label: "Student Head", value: `${billSummaryData.student_head_name} (${billSummaryData.club_name})` },
          { label: "Student Secretary", value: `${billSummaryData.student_secretary_name} (${billSummaryData.club_name})` },
          { label: "Faculty Chairman", value: `${billSummaryData.faculty_chairman_name} (${billSummaryData.club_name})` },
        ],
        calculation: {
          prizeTotal: summaryPrizeTotal,
          otherTotal: summaryOtherTotal,
          total: summaryGrandTotal,
        },
      });
    }
  }

  // STEP 4: Generate Document
  async function handleGenerateDocument() {
    setIsGenerating(true);
    setError("");
    setGeneratedResult(null);

    try {
      let result;
      if (selectedType === "exec_meet") {
        result = await generateExecutiveMeet(execData);
      } else if (selectedType === "bill_certificate") {
        result = await generateBillCertificate({
          ...billCertData,
          items: billCertData.items.map((itm) => ({
            name: itm.name,
            quantity: Number(itm.quantity),
            unit_cost: Number(itm.unit_cost),
          })),
          taxes_or_other_charges: Number(billCertData.taxes_or_other_charges) || 0,
        });
      } else if (selectedType === "bill_summary") {
        result = await generateBillSummary({
          ...billSummaryData,
          rows: billSummaryData.rows.map((r) => ({
            ...r,
            prize_money: Number(r.prize_money) || 0,
            other_amount: Number(r.other_amount) || 0,
          })),
        });
      }

      setGeneratedResult(result);
    } catch (err) {
      setError(`Document generation failed: ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  }

  const selectedDocInfo = documentCards.find((d) => d.id === selectedType);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#home">
          <span className="brand-icon">S</span>
          <span>
            <strong>SmartDocs</strong>
            <small>ACM · SVNIT SURAT</small>
          </span>
        </a>

        <div className="sidebar-label">WORKSPACE</div>

        <a className="nav-item active" href="#create">
          <span>▤</span> Create document
        </a>

        <div className="sidebar-note">
          <span
            className="status-dot"
            style={{ background: apiOnline ? "#10b981" : "#f59e0b" }}
          />
          <div>
            <strong>Document Studio</strong>
            <p>
              {apiOnline
                ? "Backend online & verified. Real DOCX & PDF generation ready."
                : "Connecting to FastAPI backend at 127.0.0.1:8000..."}
            </p>
          </div>
        </div>

        <div className="sidebar-footer">
          <div className="avatar">ACM</div>
          <div>
            <strong>ACM SVNIT Student Chapter</strong>
            <small>Official Document Automation</small>
          </div>
        </div>
      </aside>

      <main className="main-content" id="home">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span> Create document <span>/</span> {selectedDocInfo.title}
          </div>
          <div className="api-status">
            <span
              className="status-dot"
              style={{ background: apiOnline ? "#10b981" : "#f59e0b" }}
            />
            {apiOnline ? "FastAPI Backend Connected" : "Connecting to API..."}
          </div>
        </header>

        {/* Hero Section */}
        <section className="welcome" id="create">
          <div>
            <div className="eyebrow">DOCUMENT AUTOMATION WORKSPACE</div>
            <h1>
              Make documents.
              <br />
              <span>Skip the repetitive work.</span>
            </h1>
            <p>
              Automate official ACM SVNIT Surat Executive Meets, Bill Certificates, and
              Bill Summaries into standardized DOCX and PDF documents.
            </p>
          </div>
          <div className="welcome-art" aria-hidden="true">
            <div className="art-sheet sheet-back" />
            <div className="art-sheet sheet-front">
              <div className="art-line long" />
              <div className="art-line" />
              <div className="art-line short" />
              <div className="art-block" />
              <div className="art-line long" />
            </div>
            <div className="art-check">✓</div>
          </div>
        </section>

        {/* STEP 1: Document Selection */}
        <section className="section">
          <div className="section-heading">
            <div>
              <h2>Choose a document</h2>
              <p>Select the official club document to prepare.</p>
            </div>
            <span className="step-label">STEP 01</span>
          </div>

          <div className="document-grid">
            {documentCards.map((doc) => (
              <button
                type="button"
                key={doc.id}
                className={`document-card ${selectedType === doc.id ? "selected" : ""}`}
                onClick={() => handleTypeChange(doc.id)}
                aria-pressed={selectedType === doc.id}
              >
                <div className="card-top">
                  <span className="document-icon">{doc.icon}</span>
                  <span className="selection-indicator">
                    {selectedType === doc.id ? "✓" : "+"}
                  </span>
                </div>
                <h3>{doc.title}</h3>
                <p>{doc.description}</p>
                <span className="card-link">Use this template →</span>
              </button>
            ))}
          </div>
        </section>

        {/* Optional Natural-Language Quick Fill Banner */}
        <div className="nlp-banner">
          <div className="nlp-header">
            <strong>✨ Natural Language Quick-Fill (Optional)</strong>
            <button
              type="button"
              className="table-btn"
              style={{ background: "#4338ca", color: "#e0e7ff" }}
              onClick={() => setShowNlp(!showNlp)}
            >
              {showNlp ? "Hide Assistant ▲" : "Try NLP Assistant ▼"}
            </button>
          </div>
          {showNlp && (
            <div style={{ marginTop: 6 }}>
              <div className="nlp-input-row">
                <textarea
                  value={nlpPrompt}
                  onChange={(e) => setNlpPrompt(e.target.value)}
                  placeholder="e.g. Conduct an ACM technical workshop on 15 November at Seminar Hall 402 for 150 students..."
                  rows={2}
                />
                <button
                  type="button"
                  className="nlp-btn"
                  onClick={handleNlpExtract}
                  disabled={nlpLoading}
                >
                  {nlpLoading ? "Analyzing..." : "Auto-Fill Form 🪄"}
                </button>
              </div>
              {nlpSuccessNote && (
                <div style={{ fontSize: 11, color: "#a7f3d0", marginTop: 4 }}>
                  ✓ {nlpSuccessNote}
                </div>
              )}
            </div>
          )}
        </div>

        {/* STEP 2: Document Information Form */}
        <section className="section form-section">
          <div className="section-heading">
            <div>
              <h2>Document information</h2>
              <p>Enter the details that should appear in your document.</p>
            </div>
            <span className="step-label">STEP 02</span>
          </div>

          <form onSubmit={handleReviewClick}>
            <div className="form-card">
              <div className="form-card-heading">
                <span className="document-icon">{selectedDocInfo.icon}</span>
                <div>
                  <h3>{selectedDocInfo.title}</h3>
                  <p>Fields marked * are required. Official templates follow NITSER / SVNIT format.</p>
                </div>
              </div>

              {/* FORM TYPE 1: EXECUTIVE MEET */}
              {selectedType === "exec_meet" && (
                <>
                  <div className="form-section-title">ADMINISTRATIVE DETAILS</div>
                  <div className="form-grid">
                    <label className="field">
                      <span>Reference Number *</span>
                      <input
                        type="text"
                        value={execData.ref_no}
                        onChange={(e) => setExecData({ ...execData, ref_no: e.target.value })}
                        required
                      />
                    </label>
                    <label className="field">
                      <span>Document Date (DD/MM/YYYY) *</span>
                      <input
                        type="text"
                        value={execData.date}
                        onChange={(e) => setExecData({ ...execData, date: e.target.value })}
                        required
                      />
                    </label>
                    <label className="field">
                      <span>Submitted To *</span>
                      <input
                        type="text"
                        value={execData.submitted_to}
                        onChange={(e) => setExecData({ ...execData, submitted_to: e.target.value })}
                        required
                      />
                    </label>
                    <label className="field">
                      <span>Subject Line *</span>
                      <input
                        type="text"
                        value={execData.subject}
                        onChange={(e) => setExecData({ ...execData, subject: e.target.value })}
                        required
                      />
                    </label>
                  </div>

                  <div className="form-section-title">EVENT SPECIFICATIONS</div>
                  <div className="form-grid">
                    <label className="field">
                      <span>Event Name *</span>
                      <input
                        type="text"
                        value={execData.event_name}
                        onChange={(e) => setExecData({ ...execData, event_name: e.target.value })}
                        required
                      />
                    </label>
                    <label className="field">
                      <span>Event Date *</span>
                      <input
                        type="text"
                        value={execData.event_date}
                        onChange={(e) => setExecData({ ...execData, event_date: e.target.value })}
                        placeholder="DD/MM/YYYY"
                        required
                      />
                    </label>
                    <label className="field">
                      <span>Start Time *</span>
                      <input
                        type="text"
                        value={execData.time_from}
                        onChange={(e) => setExecData({ ...execData, time_from: e.target.value })}
                        placeholder="e.g. 06:00 PM"
                        required
                      />
                    </label>
                    <label className="field">
                      <span>End Time *</span>
                      <input
                        type="text"
                        value={execData.time_to}
                        onChange={(e) => setExecData({ ...execData, time_to: e.target.value })}
                        placeholder="e.g. 07:30 PM"
                        required
                      />
                    </label>
                    <label className="field">
                      <span>Venue *</span>
                      <input
                        type="text"
                        value={execData.venue}
                        onChange={(e) => setExecData({ ...execData, venue: e.target.value })}
                        required
                      />
                    </label>
                    <label className="field">
                      <span>Expected Participants *</span>
                      <input
                        type="text"
                        value={execData.participants}
                        onChange={(e) => setExecData({ ...execData, participants: e.target.value })}
                        required
                      />
                    </label>
                    <label className="field">
                      <span>Mode of Conduct *</span>
                      <select
                        style={{
                          width: "100%",
                          padding: "10px",
                          borderRadius: 8,
                          border: "1px solid #cbd5e1",
                        }}
                        value={execData.mode}
                        onChange={(e) => setExecData({ ...execData, mode: e.target.value })}
                      >
                        <option value="Offline">Offline</option>
                        <option value="Online">Online</option>
                        <option value="Hybrid">Hybrid</option>
                      </select>
                    </label>
                    <label className="field">
                      <span>Organizing Club *</span>
                      <input
                        type="text"
                        value={execData.organizers}
                        onChange={(e) => setExecData({ ...execData, organizers: e.target.value })}
                        required
                      />
                    </label>
                    <label className="field full-width">
                      <span>Brief Description *</span>
                      <textarea
                        rows={3}
                        value={execData.brief_description}
                        onChange={(e) => setExecData({ ...execData, brief_description: e.target.value })}
                        required
                      />
                    </label>
                    <label className="field full-width">
                      <span>Event Objective *</span>
                      <textarea
                        rows={3}
                        value={execData.objective}
                        onChange={(e) => setExecData({ ...execData, objective: e.target.value })}
                        required
                      />
                    </label>
                  </div>

                  <div className="form-section-title">OFFICIAL SIGNATORIES</div>
                  <div className="form-grid">
                    <label className="field">
                      <span>Student Lead Name *</span>
                      <input
                        type="text"
                        value={execData.lead_name}
                        onChange={(e) => setExecData({ ...execData, lead_name: e.target.value })}
                        required
                      />
                    </label>
                    <label className="field">
                      <span>Lead Designation & Roll No *</span>
                      <input
                        type="text"
                        value={`${execData.lead_designation} - ${execData.lead_admission_no}`}
                        onChange={(e) => {
                          const parts = e.target.value.split("-");
                          setExecData({
                            ...execData,
                            lead_designation: parts[0]?.trim() || execData.lead_designation,
                            lead_admission_no: parts[1]?.trim() || execData.lead_admission_no,
                          });
                        }}
                        required
                      />
                    </label>
                    <label className="field">
                      <span>Faculty In-Charge *</span>
                      <input
                        type="text"
                        value={execData.faculty_incharge_name}
                        onChange={(e) => setExecData({ ...execData, faculty_incharge_name: e.target.value })}
                        required
                      />
                    </label>
                    <label className="field">
                      <span>Faculty Chairman *</span>
                      <input
                        type="text"
                        value={execData.faculty_chairman_name}
                        onChange={(e) => setExecData({ ...execData, faculty_chairman_name: e.target.value })}
                        required
                      />
                    </label>
                  </div>
                </>
              )}

              {/* FORM TYPE 2: BILL CERTIFICATE */}
              {selectedType === "bill_certificate" && (
                <>
                  <div className="form-section-title">ADMINISTRATIVE DETAILS</div>
                  <div className="form-grid">
                    <label className="field">
                      <span>Chapter Name *</span>
                      <input
                        type="text"
                        value={billCertData.chapter_name}
                        onChange={(e) => setBillCertData({ ...billCertData, chapter_name: e.target.value })}
                        required
                      />
                    </label>
                    <label className="field">
                      <span>Approval Note Number *</span>
                      <input
                        type="text"
                        value={billCertData.approval_note_no}
                        onChange={(e) => setBillCertData({ ...billCertData, approval_note_no: e.target.value })}
                        required
                      />
                    </label>
                    <label className="field">
                      <span>Date *</span>
                      <input
                        type="text"
                        value={billCertData.date}
                        onChange={(e) => setBillCertData({ ...billCertData, date: e.target.value })}
                        required
                      />
                    </label>
                    <label className="field">
                      <span>Head of Account Code *</span>
                      <input
                        type="text"
                        value={billCertData.code_no}
                        onChange={(e) => setBillCertData({ ...billCertData, code_no: e.target.value, head_of_account: e.target.value })}
                        required
                      />
                    </label>
                    <label className="field">
                      <span>Certifier Faculty Name *</span>
                      <input
                        type="text"
                        value={billCertData.certifier_name}
                        onChange={(e) => setBillCertData({ ...billCertData, certifier_name: e.target.value })}
                        required
                      />
                    </label>
                  </div>

                  <div className="form-section-title">
                    <span>EXPENDITURE LINE ITEMS</span>
                    <button type="button" className="table-btn add-btn" onClick={addBillItem}>
                      + Add Item Row
                    </button>
                  </div>

                  <div className="table-container">
                    <table className="styled-table">
                      <thead>
                        <tr>
                          <th style={{ width: 40 }}>#</th>
                          <th>Name of Equipment / Item Description *</th>
                          <th style={{ width: 90 }}>Qty *</th>
                          <th style={{ width: 120 }}>Unit Cost (₹) *</th>
                          <th style={{ width: 120 }}>Total (₹)</th>
                          <th style={{ width: 60 }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {billCertData.items.map((item, idx) => (
                          <tr key={idx}>
                            <td>{idx + 1}</td>
                            <td>
                              <input
                                type="text"
                                placeholder="Item description"
                                value={item.name}
                                onChange={(e) => updateBillItem(idx, "name", e.target.value)}
                                required
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                min={1}
                                value={item.quantity}
                                onChange={(e) => updateBillItem(idx, "quantity", Math.max(1, parseInt(e.target.value) || 1))}
                                required
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                min={0}
                                step="any"
                                value={item.unit_cost}
                                onChange={(e) => updateBillItem(idx, "unit_cost", Math.max(0, parseFloat(e.target.value) || 0))}
                                required
                              />
                            </td>
                            <td>
                              <strong>
                                ₹{((Number(item.quantity) || 0) * (Number(item.unit_cost) || 0)).toFixed(2)}
                              </strong>
                            </td>
                            <td>
                              <button
                                type="button"
                                className="table-btn del-btn"
                                onClick={() => removeBillItem(idx)}
                              >
                                ✕
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="form-grid">
                    <label className="field">
                      <span>Taxes or Other Charges (₹)</span>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={billCertData.taxes_or_other_charges}
                        onChange={(e) =>
                          setBillCertData({
                            ...billCertData,
                            taxes_or_other_charges: Math.max(0, parseFloat(e.target.value) || 0),
                          })
                        }
                      />
                    </label>
                  </div>

                  <div className="calc-summary-card">
                    <div className="calc-stat">
                      <span>Calculated Subtotal</span>
                      <strong>₹{certSubtotal.toFixed(2)}</strong>
                    </div>
                    <div className="calc-stat">
                      <span>Taxes & Charges</span>
                      <strong>₹{Number(billCertData.taxes_or_other_charges || 0).toFixed(2)}</strong>
                    </div>
                    <div className="calc-stat">
                      <span>Total Estimated Amount</span>
                      <strong style={{ color: "#7c3aed" }}>₹{certGrandTotal.toFixed(2)}</strong>
                    </div>
                  </div>

                  <div className="form-section-title">SUPPLIER & PAYMENT DETAILS</div>
                  <div className="form-grid">
                    <label className="field">
                      <span>Supplier Name *</span>
                      <input
                        type="text"
                        value={billCertData.supplier_name}
                        onChange={(e) => setBillCertData({ ...billCertData, supplier_name: e.target.value })}
                        required
                      />
                    </label>
                    <label className="field">
                      <span>Supplier GST No.</span>
                      <input
                        type="text"
                        value={billCertData.supplier_gst}
                        onChange={(e) => setBillCertData({ ...billCertData, supplier_gst: e.target.value })}
                      />
                    </label>
                    <label className="field">
                      <span>Invoice No. & Date</span>
                      <input
                        type="text"
                        value={billCertData.invoice_no_and_date}
                        onChange={(e) => setBillCertData({ ...billCertData, invoice_no_and_date: e.target.value })}
                      />
                    </label>
                    <label className="field">
                      <span>Bank Account Number</span>
                      <input
                        type="text"
                        value={billCertData.account_number}
                        onChange={(e) => setBillCertData({ ...billCertData, account_number: e.target.value })}
                      />
                    </label>
                    <label className="field">
                      <span>Bank Name & Branch</span>
                      <input
                        type="text"
                        value={`${billCertData.bank_name} - ${billCertData.branch_name}`}
                        onChange={(e) => {
                          const parts = e.target.value.split("-");
                          setBillCertData({
                            ...billCertData,
                            bank_name: parts[0]?.trim() || billCertData.bank_name,
                            branch_name: parts[1]?.trim() || billCertData.branch_name,
                          });
                        }}
                      />
                    </label>
                    <label className="field">
                      <span>IFSC Code</span>
                      <input
                        type="text"
                        value={billCertData.ifsc_code}
                        onChange={(e) => setBillCertData({ ...billCertData, ifsc_code: e.target.value })}
                      />
                    </label>
                  </div>
                </>
              )}

              {/* FORM TYPE 3: BILL SUMMARY */}
              {selectedType === "bill_summary" && (
                <>
                  <div className="form-section-title">DOCUMENT HEADER</div>
                  <div className="form-grid">
                    <label className="field">
                      <span>Document Date *</span>
                      <input
                        type="text"
                        value={billSummaryData.date}
                        onChange={(e) => setBillSummaryData({ ...billSummaryData, date: e.target.value })}
                        required
                      />
                    </label>
                    <label className="field">
                      <span>Document Title *</span>
                      <input
                        type="text"
                        value={billSummaryData.title}
                        onChange={(e) => setBillSummaryData({ ...billSummaryData, title: e.target.value })}
                        required
                      />
                    </label>
                    <label className="field full-width">
                      <span>Activity Subtitle / Event Description *</span>
                      <input
                        type="text"
                        value={billSummaryData.subtitle}
                        onChange={(e) => setBillSummaryData({ ...billSummaryData, subtitle: e.target.value })}
                        required
                      />
                    </label>
                  </div>

                  <div className="form-section-title">
                    <span>RECIPIENTS & PRIZE BREAKDOWN</span>
                    <button type="button" className="table-btn add-btn" onClick={addRecipientRow}>
                      + Add Recipient
                    </button>
                  </div>

                  <div className="table-container">
                    <table className="styled-table">
                      <thead>
                        <tr>
                          <th style={{ width: 40 }}>#</th>
                          <th>Recipient / Team Name *</th>
                          <th>Payee Account Details</th>
                          <th style={{ width: 130 }}>Prize Money (₹)</th>
                          <th style={{ width: 130 }}>Other (₹)</th>
                          <th style={{ width: 60 }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {billSummaryData.rows.map((row, idx) => (
                          <tr key={idx}>
                            <td>{idx + 1}</td>
                            <td>
                              <input
                                type="text"
                                placeholder="Recipient or Team Name"
                                value={row.name}
                                onChange={(e) => updateRecipientRow(idx, "name", e.target.value)}
                                required
                              />
                            </td>
                            <td>
                              <input
                                type="text"
                                placeholder="A/C No, IFSC, or Bank"
                                value={row.account_details}
                                onChange={(e) => updateRecipientRow(idx, "account_details", e.target.value)}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                min={0}
                                step="any"
                                value={row.prize_money}
                                onChange={(e) => updateRecipientRow(idx, "prize_money", Math.max(0, parseFloat(e.target.value) || 0))}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                min={0}
                                step="any"
                                value={row.other_amount}
                                onChange={(e) => updateRecipientRow(idx, "other_amount", Math.max(0, parseFloat(e.target.value) || 0))}
                              />
                            </td>
                            <td>
                              <button
                                type="button"
                                className="table-btn del-btn"
                                onClick={() => removeRecipientRow(idx)}
                              >
                                ✕
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="calc-summary-card">
                    <div className="calc-stat">
                      <span>Total Prize Money</span>
                      <strong>₹{summaryPrizeTotal.toFixed(2)}</strong>
                    </div>
                    <div className="calc-stat">
                      <span>Total Other Reimbursed</span>
                      <strong>₹{summaryOtherTotal.toFixed(2)}</strong>
                    </div>
                    <div className="calc-stat">
                      <span>Grand Total Amount</span>
                      <strong style={{ color: "#7c3aed" }}>₹{summaryGrandTotal.toFixed(2)}</strong>
                    </div>
                  </div>

                  <div className="form-section-title">SIGNATORY DETAILS</div>
                  <div className="form-grid">
                    <label className="field">
                      <span>Student Head Name *</span>
                      <input
                        type="text"
                        value={billSummaryData.student_head_name}
                        onChange={(e) => setBillSummaryData({ ...billSummaryData, student_head_name: e.target.value })}
                        required
                      />
                    </label>
                    <label className="field">
                      <span>Student Secretary Name *</span>
                      <input
                        type="text"
                        value={billSummaryData.student_secretary_name}
                        onChange={(e) => setBillSummaryData({ ...billSummaryData, student_secretary_name: e.target.value })}
                        required
                      />
                    </label>
                    <label className="field">
                      <span>Faculty Chairman Name *</span>
                      <input
                        type="text"
                        value={billSummaryData.faculty_chairman_name}
                        onChange={(e) => setBillSummaryData({ ...billSummaryData, faculty_chairman_name: e.target.value })}
                        required
                      />
                    </label>
                    <label className="field">
                      <span>Club Designation *</span>
                      <input
                        type="text"
                        value={billSummaryData.club_name}
                        onChange={(e) => setBillSummaryData({ ...billSummaryData, club_name: e.target.value })}
                        required
                      />
                    </label>
                  </div>
                </>
              )}

              {error && <div className="error-message">{error}</div>}

              <div className="form-actions">
                <p>
                  Check all details before official generation. Totals are automatically
                  calculated and verified on the server.
                </p>
                <button className="primary-button" type="submit">
                  Review information <span>→</span>
                </button>
              </div>
            </div>
          </form>
        </section>

        {/* STEP 3: Review Information Screen */}
        {reviewState && !generatedResult && (
          <section className="section preview-section">
            <div className="section-heading">
              <div>
                <h2>Review your information</h2>
                <p>Verify details before sending to the FastAPI document generator.</p>
              </div>
              <span className="step-label">STEP 03</span>
            </div>

            <div className="preview-card">
              <div className="preview-title">
                <span className="document-icon">✓</span>
                <div>
                  <h3>{reviewState.type}</h3>
                  <p>Information Review · Ready for official generation</p>
                </div>
              </div>

              <dl className="preview-list">
                {reviewState.displayFields.map((f, i) => (
                  <div key={i}>
                    <dt>{f.label}</dt>
                    <dd>{f.value}</dd>
                  </div>
                ))}

                {reviewState.calculation && (
                  <div className="total-row">
                    <dt>Calculated Total Amount</dt>
                    <dd>
                      ₹{reviewState.calculation.total.toFixed(2)}
                      {reviewState.calculation.taxes ? ` (includes ₹${reviewState.calculation.taxes.toFixed(2)} tax)` : ""}
                    </dd>
                  </div>
                )}
              </dl>

              {error && <div className="error-message" style={{ marginTop: 14 }}>{error}</div>}

              <div className="form-actions" style={{ marginTop: 20 }}>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setReviewState(null)}
                >
                  ← Edit Information
                </button>
                <button
                  type="button"
                  className="primary-button"
                  onClick={handleGenerateDocument}
                  disabled={isGenerating}
                >
                  {isGenerating ? (
                    <>
                      <span className="spinner" /> Generating Official Documents...
                    </>
                  ) : (
                    <>Generate DOCX & PDF ⚡</>
                  )}
                </button>
              </div>
            </div>
          </section>
        )}

        {/* STEP 4 & 5: Generation Result & Download Cards */}
        {generatedResult && (
          <section className="section">
            <div className="section-heading">
              <div>
                <h2>Document ready for download</h2>
                <p>Generated successfully with official SVNIT ACM styling.</p>
              </div>
              <span className="step-label">STEP 04</span>
            </div>

            <div className="success-card">
              <div className="success-badge">
                <span>✓</span> Generation Complete
              </div>
              <h3>{generatedResult.title}</h3>
              <p style={{ color: "#64748b", fontSize: 12, marginTop: 4 }}>
                Document ID: <code>{generatedResult.document_id}</code>
              </p>

              <div className="download-grid">
                {/* DOCX Card */}
                <a
                  className="download-card docx"
                  href={getFullDownloadUrl(generatedResult.files.docx.download_url)}
                  download={generatedResult.files.docx.filename}
                >
                  <div className="dl-info">
                    <strong>📘 Word Document (.docx)</strong>
                    <small>{generatedResult.files.docx.filename}</small>
                  </div>
                  <span className="dl-action">Download DOCX ↓</span>
                </a>

                {/* PDF Card */}
                <a
                  className="download-card pdf"
                  href={getFullDownloadUrl(generatedResult.files.pdf.download_url)}
                  download={generatedResult.files.pdf.filename}
                >
                  <div className="dl-info">
                    <strong>📕 PDF Document (.pdf)</strong>
                    <small>{generatedResult.files.pdf.filename}</small>
                  </div>
                  <span className="dl-action">Download PDF ↓</span>
                </a>
              </div>

              <div style={{ display: "flex", gap: 12, marginTop: 18 }}>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => {
                    setGeneratedResult(null);
                    setReviewState(null);
                  }}
                >
                  Create Another Document ＋
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setGeneratedResult(null)}
                >
                  Back to Review
                </button>
              </div>
            </div>
          </section>
        )}

        <footer className="page-footer">
          <span>Smart Document Generator · ACM SVNIT</span>
          <span>FastAPI Backend + React Frontend · Production-Ready</span>
        </footer>
      </main>
    </div>
  );
}