import { useState, useEffect } from "react";
import "./App.css";
import { translations } from "./i18n/translations";
import BatchGenerator from "./components/BatchGenerator";
import VersionWorkflowPanel from "./components/VersionWorkflowPanel";
import TemplateEditorPanel from "./components/TemplateEditorPanel";
import AnalyticsDashboard from "./components/AnalyticsDashboard";
import ClausesModal from "./components/ClausesModal";
import LoginPage from "./components/LoginPage";
import AdminBootstrapPage from "./components/AdminBootstrapPage";
import UserManagementModal from "./components/UserManagementModal";
import RoleRequestModal from "./components/RoleRequestModal";
import {
  checkBackendHealth,
  generateExecutiveMeet,
  generateBillCertificate,
  generateBillSummary,
  extractFromNLP,
  classifyPrompt,
  logoutUser,
  fetchCurrentUserProfile,
  exportToGoogleDrive,
  distributeByEmail,
  signDocument,
  getFullDownloadUrl,
} from "./services/documentApi";

// Document Selection Cards with Reference/Mock Example Metadata
const documentCards = [
  {
    id: "exec_meet",
    title: "Executive Meet",
    description: "Event proposals, official schedules and permission requests for ACM activities.",
    icon: "📋",
    mockExample: {
      eventName: "ACM AI & ML Workshop",
      venue: "Seminar Hall 402, SVNIT Surat",
      participants: "120 Attendees",
      summary: "Official permission note for hall reservation & team coordination.",
    },
  },
  {
    id: "bill_certificate",
    title: "Bill Certificate",
    description: "Recurring expenditure certification, dynamic line items, supplier & payment details.",
    icon: "🧾",
    mockExample: {
      chapterName: "ACM (Code: 6/52)",
      supplier: "ABC Stationery & Prints",
      itemsPreview: "25 Notebooks + 10 Pen Sets",
      summary: "SVNIT Form BC-R expenditure certificate with subtotal & tax verification.",
    },
  },
  {
    id: "bill_summary",
    title: "Bill Summary",
    description: "Reimbursement summary, multiple recipients, prize distributions, and bank details.",
    icon: "💳",
    mockExample: {
      eventTitle: "SIH Internal Hackathon",
      recipientsPreview: "Rahul (₹1,500), Priya (₹800), Amit (₹1,200)",
      summary: "Multi-recipient reimbursement breakdown with 3-officer signature blocks.",
    },
  },
];

// Optional Mock/Demo Data (Used strictly as reference; never auto-populated into actual initial form state)
const mockDemoData = {
  exec_meet: {
    ref_no: "ACM/26-27/ROOM/009",
    date: "09/10/2026",
    submitted_to: "HoD(CSE Dept.)",
    subject: "Requesting Permission to Conduct ACM Executives Meet in Seminar Hall 402, CSE Department.",
    event_name: "ACM Executives Meet",
    event_date: "15/10/2026",
    time_from: "06:00 PM",
    time_to: "07:30 PM",
    venue: "Seminar Hall 402, CSE Department",
    participants: "150+",
    mode: "Offline",
    online_meeting_platform: "",
    online_meeting_link: "",
    has_agenda: false,
    agenda_items: "",
    organizers: "ACM Core 2026-27",
    brief_description:
      "ACM NIT Surat is organizing an Executive Meet to discuss chapter activities and project planning. Permission requested for Seminar Hall 402.",
    objective:
      "To provide guidance to the ACM executive team on organizing events and team collaboration.",
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
  },
  bill_certificate: {
    chapter_name: "ACM",
    code_no: "6/52",
    approval_note_no: "ACM/2026-27/SIH/001",
    date: "08/09/2026",
    purchase_order_no: "NiL",
    head_of_account: "6/52",
    advance_drawn: "NiL",
    certifier_name: "Dr. Sankita J. Patel",
    items: [
      { name: "Executive Meet Stage Backdrop & Banner", quantity: 1, unit_cost: 1200 },
      { name: "Certificates and Refreshments", quantity: 25, unit_cost: 60 },
    ],
    taxes_or_other_charges: 0,
    has_taxes: false,
    tax_details: "",
    supplier_name: "ABC Stationery & Prints",
    supplier_gst: "24AAACS1234D1Z5",
    any_other_taxes: "-",
    invoice_no_and_date: "INV-2026/089 dtd 08/09/2026",
    party_name: "ABC Stationery & Prints",
    account_number: "987654321012",
    account_holder_name: "ABC Stationery & Prints",
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
  },
  bill_summary: {
    date: "09/10/2026",
    title: "BILL SUMMARY",
    subtitle: "Reimbursement for Cost incurred in SIH Internal Hackathon",
    rows: [
      {
        name: "Rahul",
        account_details: "Reimbursement for travel",
        to_be_paid_to: "Rahul",
        prize_money: 1500,
        other_amount: 0,
        account_no: "",
        ifsc_code: "",
      },
      {
        name: "Priya",
        account_details: "Reimbursement for printing",
        to_be_paid_to: "Priya",
        prize_money: 800,
        other_amount: 0,
        account_no: "",
        ifsc_code: "",
      },
      {
        name: "Amit",
        account_details: "Reimbursement for event supplies",
        to_be_paid_to: "Amit",
        prize_money: 1200,
        other_amount: 0,
        account_no: "",
        ifsc_code: "",
      },
    ],
    student_head_name: "Ansh Gupta",
    student_head_title: "Student Head",
    student_secretary_name: "Arshad Khatib",
    student_secretary_title: "Student Secretary",
    faculty_chairman_name: "Dr. Sankita Patel",
    faculty_chairman_title: "Faculty Chairman",
    club_name: "ACM NIT-Surat",
  },
};

// CLEAN INITIAL FORM STATES
const emptyExecState = {
  ref_no: "",
  date: "",
  submitted_to: "",
  subject: "",
  event_name: "",
  event_date: "",
  time_from: "",
  time_to: "",
  venue: "",
  participants: "",
  mode: "Offline",
  online_meeting_platform: "",
  online_meeting_link: "",
  has_agenda: false,
  agenda_items: "",
  organizers: "",
  brief_description: "",
  objective: "",
  lead_name: "",
  lead_designation: "",
  lead_admission_no: "",
  lead_branch: "",
  lead_mobile: "",
  tech_assist_name: "",
  tech_assist_designation: "",
  tech_assist_branch: "",
  tech_assist_mobile: "",
  faculty_incharge_name: "",
  faculty_incharge_designation: "",
  faculty_incharge_branch: "",
  faculty_chairman_name: "",
  faculty_chairman_designation: "",
  faculty_chairman_branch: "",
};

const emptyBillCertState = {
  chapter_name: "",
  code_no: "",
  approval_note_no: "",
  date: "",
  purchase_order_no: "",
  head_of_account: "",
  advance_drawn: "",
  certifier_name: "",
  title: "",
  items: [{ name: "", quantity: "", unit_cost: "" }],
  taxes_or_other_charges: "",
  has_taxes: false,
  tax_details: "",
  supplier_name: "",
  supplier_gst: "",
  any_other_taxes: "",
  invoice_no_and_date: "",
  party_name: "",
  account_number: "",
  account_holder_name: "",
  bank_name: "",
  branch_name: "",
  ifsc_code: "",
  lab_office: "",
  register_type: "Recurring Register",
  serial_number: "",
  page_number: "",
  stock_date: "",
  clerk_name: "",
  indenter_name: "",
  indenter_designation: "",
  indenter_department: "",
};

const emptyBillSummaryState = {
  date: "",
  title: "BILL SUMMARY",
  subtitle: "",
  rows: [
    {
      name: "",
      account_details: "",
      to_be_paid_to: "",
      prize_money: "",
      other_amount: "",
      account_no: "",
      ifsc_code: "",
    },
  ],
  student_head_name: "",
  student_head_title: "Student Head",
  student_secretary_name: "",
  student_secretary_title: "Student Secretary",
  faculty_chairman_name: "",
  faculty_chairman_title: "Faculty Chairman",
  club_name: "ACM NIT-Surat",
};

export default function App() {
  const [selectedType, setSelectedType] = useState("exec_meet");

  // Isolated Form States
  const [execData, setExecData] = useState(emptyExecState);
  const [billCertData, setBillCertData] = useState(emptyBillCertState);
  const [billSummaryData, setBillSummaryData] = useState(emptyBillSummaryState);

  // Review & Generation Flow
  const [reviewState, setReviewState] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedResult, setGeneratedResult] = useState(null);
  const [error, setError] = useState("");
  const [apiOnline, setApiOnline] = useState(false);

  // Natural Language Assistant State
  const [showNlp, setShowNlp] = useState(false);
  const [nlpPrompt, setNlpPrompt] = useState("");
  const [nlpLoading, setNlpLoading] = useState(false);
  const [nlpFeedback, setNlpFeedback] = useState({ type: "", message: "" });

  // Good-to-Have Features State
  const [lang, setLang] = useState("en"); // "en" | "hi" | "gu"
  const [activeTab, setActiveTab] = useState("create"); // "create" | "batch" | "history" | "templates" | "analytics"
  const [currentUser, setCurrentUser] = useState(null);
  const [currentRole, setCurrentRole] = useState(() => {
    try {
      const saved = localStorage.getItem("acm_doc_user");
      return saved ? JSON.parse(saved).role : "author";
    } catch {
      return "author";
    }
  });
  const [authChecking, setAuthChecking] = useState(true);
  const [bootstrapMode, setBootstrapMode] = useState(() => new URLSearchParams(window.location.search).get("bootstrap-admin") === "1");
  const [showUserMgmt, setShowUserMgmt] = useState(false);
  const [showRoleRequest, setShowRoleRequest] = useState(false);
  const [recommendation, setRecommendation] = useState(null);
  const [showClausesModal, setShowClausesModal] = useState(false);
  const [selectedDocIdForHistory, setSelectedDocIdForHistory] = useState("");
  const [actionStatus, setActionStatus] = useState(null);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailSubject, setEmailSubject] = useState("");

  const t = (key) => translations[lang]?.[key] || translations["en"]?.[key] || key;

  const roleDisplayNames = {
    author: "Author",
    reviewer: "Reviewer",
    approver: "Approver",
    template_admin: "Template Admin",
    tmpladmin: "Template Admin",
    admin: "System Admin",
    viewer: "Viewer",
  };

  const roleColors = {
    author: { bg: "#e0f2fe", border: "#bae6fd", pill: "#0284c7" },
    reviewer: { bg: "#fef3c7", border: "#fde68a", pill: "#d97706" },
    approver: { bg: "#dcfce7", border: "#bbf7d0", pill: "#16a34a" },
    template_admin: { bg: "#f3e8ff", border: "#e9d5ff", pill: "#7c3aed" },
    tmpladmin: { bg: "#f3e8ff", border: "#e9d5ff", pill: "#7c3aed" },
    admin: { bg: "#fee2e2", border: "#fecaca", pill: "#dc2626" },
    viewer: { bg: "#f1f5f9", border: "#cbd5e1", pill: "#475569" },
  };

  // Validate session and check backend health on mount
  useEffect(() => {
    async function initAuthAndHealth() {
      const isHealthy = await checkBackendHealth();
      setApiOnline(isHealthy);

      try {
        const profile = await fetchCurrentUserProfile();
        if (profile?.authenticated && profile.user) {
          setCurrentUser(profile.user);
          setCurrentRole(profile.user.role);
          localStorage.setItem("acm_doc_user", JSON.stringify(profile.user));
        } else {
          setCurrentUser(null);
          localStorage.removeItem("acm_doc_user");
        }
      } catch {
        setCurrentUser(null);
        localStorage.removeItem("acm_doc_user");
      }
      setAuthChecking(false);
    }

    initAuthAndHealth();

    const interval = setInterval(async () => {
      const isHealthy = await checkBackendHealth();
      setApiOnline(isHealthy);
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  function handleLoginSuccess(user) {
    setCurrentUser(user);
    setCurrentRole(user.role);
    localStorage.setItem("acm_doc_user", JSON.stringify(user));
  }

  function handleBootstrapSuccess(user) {
    setCurrentUser(user);
    setCurrentRole(user.role);
    localStorage.setItem("acm_doc_user", JSON.stringify(user));
  }

  function exitBootstrapMode() {
    const cleanUrl = `${window.location.pathname}${window.location.hash}`;
    window.history.replaceState(null, "", cleanUrl);
    setBootstrapMode(false);
    setActiveTab("create");
  }

  async function handleLogout() {
    await logoutUser();
    setCurrentUser(null);
    setCurrentRole("viewer");
    localStorage.removeItem("acm_doc_user");
  }

  // Document Type Switching
  function handleTypeChange(type) {
    setSelectedType(type);
    setReviewState(null);
    setGeneratedResult(null);
    setError("");
    setNlpFeedback({ type: "", message: "" });
  }

  // Explicit Form Reset
  function handleResetForm() {
    if (selectedType === "exec_meet") {
      setExecData(emptyExecState);
    } else if (selectedType === "bill_certificate") {
      setBillCertData(emptyBillCertState);
    } else if (selectedType === "bill_summary") {
      setBillSummaryData(emptyBillSummaryState);
    }
    setReviewState(null);
    setGeneratedResult(null);
    setError("");
    setNlpFeedback({ type: "info", message: "Form cleared to empty state." });
  }

  // Explicitly Load Reference Mock Example into current form
  function handleLoadMockExample() {
    if (selectedType === "exec_meet") {
      setExecData({ ...mockDemoData.exec_meet });
    } else if (selectedType === "bill_certificate") {
      setBillCertData({ ...mockDemoData.bill_certificate });
    } else if (selectedType === "bill_summary") {
      setBillSummaryData({ ...mockDemoData.bill_summary });
    }
    setReviewState(null);
    setGeneratedResult(null);
    setError("");
    setNlpFeedback({
      type: "info",
      message: "Loaded official reference example into form. You can modify any values.",
    });
  }

  // FEATURE 1: INTENT CLASSIFICATION ONLY
  async function handleClassifyOnly() {
    const trimmed = nlpPrompt.trim();
    if (!trimmed) {
      setNlpFeedback({ type: "error", message: "Please enter a prompt to classify." });
      return;
    }
    setNlpLoading(true);
    try {
      const cls = await classifyPrompt(trimmed);
      setRecommendation(cls);
      if (cls.is_ambiguous) {
        setNlpFeedback({
          type: "warning",
          message: "Prompt is ambiguous between multiple document types. Please select one explicitly.",
        });
      } else {
        setNlpFeedback({
          type: "info",
          message: `Classification: ${cls.recommended_type} (${(cls.confidence * 100).toFixed(0)}% confidence). Rationale: ${cls.rationale}`,
        });
      }
    } catch (err) {
      setNlpFeedback({ type: "error", message: `Classification error: ${err.message}` });
    } finally {
      setNlpLoading(false);
    }
  }

  // NATURAL LANGUAGE EXTRACTION & AUTO-FILL HANDLER
  async function handleNlpExtract() {
    const trimmed = nlpPrompt.trim();
    if (!trimmed) {
      setNlpFeedback({
        type: "error",
        message: "Please enter a prompt describing your event or expenditure details.",
      });
      return;
    }

    setNlpLoading(true);
    setError("");
    setNlpFeedback({ type: "", message: "" });

    try {
      // 1. Get Classification
      try {
        const cls = await classifyPrompt(trimmed);
        setRecommendation(cls);
      } catch {
        // Continue if classification fails
      }

      // 2. Perform Extraction
      const res = await extractFromNLP(trimmed, selectedType);

      if (res.recommended_type && res.recommended_type !== selectedType) {
        // Note recommendation without abrupt override
      }

      const activeTargetType = res.recommended_type || selectedType;
      let fieldCount = 0;

      if (activeTargetType === "exec_meet") {
        const fields = res.extracted_fields || {};
        const fieldMap = {
          event_name: fields.event_name,
          event_date: fields.event_date,
          venue: fields.venue,
          time_from: fields.time_from || fields.start_time,
          time_to: fields.time_to || fields.end_time,
          participants: fields.participants || fields.expected_participants,
          organizers: fields.organizers || fields.organizing_club,
          mode: fields.mode || fields.mode_of_conduct,
          brief_description: fields.brief_description,
          objective: fields.objective,
          lead_name: fields.lead_name || fields.coordinator,
          ref_no: fields.ref_no,
          date: fields.date,
          submitted_to: fields.submitted_to,
          subject: fields.subject,
        };

        const appliedFields = {};
        for (const [k, v] of Object.entries(fieldMap)) {
          if (v !== undefined && v !== null && String(v).trim() !== "") {
            appliedFields[k] = String(v).trim();
            fieldCount++;
          }
        }

        setExecData((prev) => ({
          ...prev,
          ...appliedFields,
        }));
      } else if (activeTargetType === "bill_certificate") {
        const fields = res.extracted_fields || {};
        const applied = {};
        if (fields.supplier_name) {
          applied.supplier_name = fields.supplier_name;
          fieldCount++;
        }
        if (fields.date) {
          applied.date = fields.date;
          fieldCount++;
        }
        if (fields.title) {
          applied.title = fields.title;
          fieldCount++;
        }
        if (fields.chapter_name) {
          applied.chapter_name = fields.chapter_name;
          fieldCount++;
        }
        if (res.items && res.items.length > 0) {
          applied.items = res.items;
          fieldCount += res.items.length;
        }
        setBillCertData((prev) => ({ ...prev, ...applied }));
      } else if (activeTargetType === "bill_summary") {
        const fields = res.extracted_fields || {};
        const applied = {};
        if (fields.date) {
          applied.date = fields.date;
          fieldCount++;
        }
        if (fields.subtitle) {
          applied.subtitle = fields.subtitle;
          fieldCount++;
        }
        if (fields.title) {
          applied.title = fields.title;
          fieldCount++;
        }
        if (res.recipients && res.recipients.length > 0) {
          applied.rows = res.recipients.map((r) => ({
            name: r.name,
            account_details: r.account_details || "",
            to_be_paid_to: r.to_be_paid_to || r.name,
            prize_money: r.prize_money || 0,
            other_amount: r.other_amount || 0,
            account_no: r.account_no || "",
            ifsc_code: r.ifsc_code || "",
          }));
          fieldCount += res.recipients.length;
        }
        setBillSummaryData((prev) => ({ ...prev, ...applied }));
      }

      if (fieldCount > 0) {
        const missing = res.missing_required_fields || [];
        const missingNote =
          missing.length > 0
            ? ` (${missing.length} required field(s) remain missing: ${missing.join(", ")}).`
            : " (All required fields identified).";
        setNlpFeedback({
          type: "success",
          message: `Extracted available details (${fieldCount} fields identified).${missingNote} Please review and complete the form before generating.`,
        });
      } else {
        setNlpFeedback({
          type: "warning",
          message:
            "No usable fields could be extracted from your prompt. Please provide more specific details or fill the form directly.",
        });
      }
    } catch (err) {
      setNlpFeedback({
        type: "error",
        message: `Extraction failed: ${err.message}. Please complete the form manually.`,
      });
    } finally {
      setNlpLoading(false);
    }
  }

  // FEATURE 6: INSERT APPROVED CLAUSE
  function handleInsertClause(interpolatedText, targetField) {
    if (selectedType === "exec_meet") {
      if (targetField === "objective") {
        setExecData((prev) => ({
          ...prev,
          objective: prev.objective
            ? `${prev.objective}\n\n${interpolatedText}`
            : interpolatedText,
        }));
      } else {
        setExecData((prev) => ({
          ...prev,
          brief_description: prev.brief_description
            ? `${prev.brief_description}\n\n${interpolatedText}`
            : interpolatedText,
        }));
      }
    } else if (selectedType === "bill_certificate") {
      if (targetField === "expenditure_purpose") {
        setBillCertData((prev) => ({
          ...prev,
          expenditure_purpose: prev.expenditure_purpose
            ? `${prev.expenditure_purpose} — ${interpolatedText}`
            : interpolatedText,
        }));
      } else {
        setBillCertData((prev) => ({
          ...prev,
          tax_details: prev.tax_details
            ? `${prev.tax_details}\n\n${interpolatedText}`
            : interpolatedText,
          has_taxes: true,
        }));
      }
    } else if (selectedType === "bill_summary") {
      if (targetField === "title") {
        setBillSummaryData((prev) => ({
          ...prev,
          title: prev.title
            ? `${prev.title} (${interpolatedText})`
            : interpolatedText,
        }));
      } else {
        setBillSummaryData((prev) => ({
          ...prev,
          subtitle: prev.subtitle
            ? `${prev.subtitle} — ${interpolatedText}`
            : interpolatedText,
        }));
      }
    }
    setShowClausesModal(false);
    setNlpFeedback({ type: "success", message: "Approved clause inserted into document form." });
  }

  // Dynamic Row Operations for Bill Certificate
  function addBillItem() {
    setBillCertData((prev) => ({
      ...prev,
      items: [...prev.items, { name: "", quantity: "", unit_cost: "" }],
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

  // Dynamic Row Operations for Bill Summary
  function addRecipientRow() {
    setBillSummaryData((prev) => ({
      ...prev,
      rows: [
        ...prev.rows,
        {
          name: "",
          account_details: "",
          to_be_paid_to: "",
          prize_money: "",
          other_amount: "",
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

  // Live client-side calculation preview
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

  // DYNAMIC HEADER LOGIC
  let dynamicFormHeading = "";
  let formSubtitle = "";

  if (selectedType === "exec_meet") {
    dynamicFormHeading = execData.event_name.trim() || "Executive Meet";
    formSubtitle = "Event proposals, official schedules and permission requests for ACM activities.";
  } else if (selectedType === "bill_certificate") {
    if (billCertData.title?.trim()) {
      dynamicFormHeading = billCertData.title.trim();
    } else if (billCertData.supplier_name?.trim()) {
      dynamicFormHeading = `Bill Certificate — ${billCertData.supplier_name.trim()}`;
    } else {
      dynamicFormHeading = "Bill Certificate";
    }
    formSubtitle = "Recurring expenditure certification following official SVNIT Form BC-R format.";
  } else if (selectedType === "bill_summary") {
    if (billSummaryData.subtitle?.trim()) {
      dynamicFormHeading = billSummaryData.subtitle.trim();
    } else if (billSummaryData.title?.trim()) {
      dynamicFormHeading = billSummaryData.title.trim();
    } else {
      dynamicFormHeading = "Bill Summary";
    }
    formSubtitle = "Official reimbursement and prize distribution summary table.";
  }

  // REVIEW HANDLER
  function handleReviewClick(e) {
    e.preventDefault();
    setError("");
    setGeneratedResult(null);

    if (selectedType === "exec_meet") {
      if (!execData.event_name.trim() || !execData.event_date.trim() || !execData.venue.trim()) {
        setError("Please enter the Event Name, Event Date, and Venue before proceeding.");
        return;
      }
      setReviewState({
        type: "Executive Meet",
        displayHeading: execData.event_name,
        data: { ...execData },
        displayFields: [
          { label: "Reference Number", value: execData.ref_no || "[To be assigned]" },
          { label: "Document Date", value: execData.date || "[Current Date]" },
          { label: "Submitted To", value: execData.submitted_to || "HoD (CSE Dept.)" },
          { label: "Event Name", value: execData.event_name },
          {
            label: "Event Schedule",
            value: `${execData.event_date}${execData.time_from ? ` (${execData.time_from} - ${execData.time_to || "End"})` : ""}`,
          },
          { label: "Venue", value: execData.venue },
          { label: "Expected Participants", value: execData.participants || "Unspecified" },
          { label: "Mode of Conduct", value: execData.mode || "Offline" },
          { label: "Organizing Club", value: execData.organizers || "ACM SVNIT Chapter" },
          { label: "Objective", value: execData.objective || "Unspecified" },
          {
            label: "Student Chairperson",
            value: execData.lead_name ? `${execData.lead_name} (${execData.lead_designation || "Chairperson"})` : "[Signature placeholder]",
          },
          {
            label: "Faculty In-Charge",
            value: execData.faculty_incharge_name || "[Signature placeholder]",
          },
          {
            label: "Faculty Chairman",
            value: execData.faculty_chairman_name || "[Signature placeholder]",
          },
        ],
      });
    } else if (selectedType === "bill_certificate") {
      if (!billCertData.supplier_name.trim()) {
        setError("Please enter the Supplier Name.");
        return;
      }
      for (const itm of billCertData.items) {
        if (!itm.name.trim() || Number(itm.quantity) <= 0 || Number(itm.unit_cost) < 0) {
          setError("All items must have a valid description, quantity (> 0), and unit cost.");
          return;
        }
      }
      setReviewState({
        type: "Bill Certificate",
        displayHeading: billCertData.supplier_name,
        data: { ...billCertData },
        displayFields: [
          { label: "Chapter Name & Code", value: `${billCertData.chapter_name || "ACM"} (${billCertData.code_no || "6/52"})` },
          { label: "Approval Note No.", value: billCertData.approval_note_no || "NiL" },
          { label: "Document Date", value: billCertData.date || "[Current Date]" },
          { label: "Supplier Name", value: billCertData.supplier_name },
          { label: "Invoice No. & Date", value: billCertData.invoice_no_and_date || "N/A" },
          { label: "Beneficiary Party", value: billCertData.party_name || billCertData.supplier_name },
          {
            label: "Bank Account",
            value: billCertData.account_number ? `${billCertData.account_number} (${billCertData.bank_name || "-"})` : "[Unspecified]",
          },
        ],
        calculation: {
          subtotal: certSubtotal,
          taxes: Number(billCertData.taxes_or_other_charges) || 0,
          total: certGrandTotal,
        },
      });
    } else if (selectedType === "bill_summary") {
      if (!billSummaryData.rows.length || !billSummaryData.rows[0].name.trim()) {
        setError("Please enter at least one recipient with a name.");
        return;
      }
      setReviewState({
        type: "Bill Summary",
        displayHeading: billSummaryData.subtitle || billSummaryData.title,
        data: { ...billSummaryData },
        displayFields: [
          { label: "Document Date", value: billSummaryData.date || "[Current Date]" },
          { label: "Document Title", value: billSummaryData.title },
          { label: "Activity Subtitle", value: billSummaryData.subtitle || "N/A" },
          { label: "Total Recipients", value: `${billSummaryData.rows.length} recipient(s)` },
        ],
        calculation: {
          prizeTotal: summaryPrizeTotal,
          otherTotal: summaryOtherTotal,
          total: summaryGrandTotal,
        },
      });
    }
  }

  // GENERATE DOCUMENT HANDLER
  async function handleGenerateDocument() {
    if (currentRole === "viewer") {
      setError("Viewer role has read-only access. Only Author or Admin can generate official documents.");
      return;
    }
    setIsGenerating(true);
    setError("");
    setGeneratedResult(null);
    setActionStatus(null);

    try {
      let result;
      if (selectedType === "exec_meet") {
        const missing = [];
        if (!execData.event_name.trim()) missing.push("Event Name");
        if (!execData.event_date.trim()) missing.push("Event Date");
        if (!execData.venue.trim()) missing.push("Venue");
        if (!execData.time_from.trim()) missing.push("Start Time");
        if (!execData.time_to.trim()) missing.push("End Time");
        if (!execData.brief_description.trim()) missing.push("Brief Description");
        if (missing.length > 0) {
          setError(`Cannot generate document. Missing required fields: ${missing.join(", ")}. Please complete them in the form.`);
          setIsGenerating(false);
          return;
        }

        const todayFormatted = new Date().toISOString().split("T")[0].split("-").reverse().join("/");
        result = await generateExecutiveMeet({
          ...execData,
          date: execData.date.trim() || todayFormatted,
          ref_no: execData.ref_no.trim() || "ACM/26-27/ROOM/001",
          submitted_to: execData.submitted_to.trim() || "HoD(CSE Dept.)",
          subject: execData.subject.trim() || `Requesting Permission to Conduct ${execData.event_name} in ${execData.venue}`,
          brief_description: execData.brief_description.trim(),
          objective: execData.objective.trim() || `To successfully conduct ${execData.event_name} for students.`,
        });
      } else if (selectedType === "bill_certificate") {
        const missing = [];
        if (!billCertData.supplier_name.trim()) missing.push("Supplier Name");
        if (!billCertData.items || billCertData.items.length === 0 || !billCertData.items[0].name.trim()) missing.push("Purchased Items");
        if (missing.length > 0) {
          setError(`Cannot generate document. Missing required fields: ${missing.join(", ")}. Please complete them in the form.`);
          setIsGenerating(false);
          return;
        }

        const todayFormatted = new Date().toISOString().split("T")[0].split("-").reverse().join("/");
        result = await generateBillCertificate({
          ...billCertData,
          date: billCertData.date.trim() || todayFormatted,
          chapter_name: billCertData.chapter_name.trim() || "ACM",
          code_no: billCertData.code_no.trim() || "6/52",
          approval_note_no: billCertData.approval_note_no.trim() || "ACM/2026-27/BILL/001",
          certifier_name: billCertData.certifier_name.trim() || "Faculty Chairman",
          items: billCertData.items.map((itm) => ({
            name: itm.name.trim(),
            quantity: Number(itm.quantity) || 1,
            unit_cost: Number(itm.unit_cost) || 0,
          })),
          taxes_or_other_charges: Number(billCertData.taxes_or_other_charges) || 0,
        });
      } else if (selectedType === "bill_summary") {
        const missing = [];
        if (!billSummaryData.rows || billSummaryData.rows.length === 0 || !billSummaryData.rows[0].name.trim()) missing.push("Recipient Rows");
        if (missing.length > 0) {
          setError(`Cannot generate document. Missing required fields: ${missing.join(", ")}. Please complete them in the form.`);
          setIsGenerating(false);
          return;
        }

        const todayFormatted = new Date().toISOString().split("T")[0].split("-").reverse().join("/");
        result = await generateBillSummary({
          ...billSummaryData,
          date: billSummaryData.date.trim() || todayFormatted,
          title: billSummaryData.title.trim() || "BILL SUMMARY",
          subtitle: billSummaryData.subtitle.trim() || "Reimbursement Summary",
          rows: billSummaryData.rows.map((r) => ({
            name: r.name.trim(),
            account_details: r.account_details || "",
            to_be_paid_to: r.to_be_paid_to || r.name.trim(),
            prize_money: Number(r.prize_money) || 0,
            other_amount: Number(r.other_amount) || 0,
            account_no: r.account_no || "",
            ifsc_code: r.ifsc_code || "",
          })),
        });
      }

      setGeneratedResult(result);
      if (result.document_id) {
        setSelectedDocIdForHistory(result.document_id);
      }
    } catch (err) {
      setError(`Document generation failed: ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  }

  // EXTERNAL INTEGRATIONS: Google Drive
  async function handleExportDrive() {
    if (!generatedResult?.document_id) return;
    setActionStatus({ type: "info", message: "Exporting to Google Drive..." });
    try {
      const res = await exportToGoogleDrive(generatedResult.document_id);
      if (res.status === "unconfigured") {
        setActionStatus({
          type: "warning",
          message: `Drive Export: ${res.message} (Implementation active; Google Service Account credentials unconfigured)`,
        });
      } else {
        setActionStatus({
          type: "success",
          message: `Successfully exported to Drive! File ID: ${res.file_id || "DRV-" + generatedResult.document_id}`,
        });
      }
    } catch (err) {
      setActionStatus({ type: "error", message: `Drive export failed: ${err.message}` });
    }
  }

  // EXTERNAL INTEGRATIONS: Email Distribution
  async function handleSendEmail(e) {
    e.preventDefault();
    if (!generatedResult?.document_id || !emailTo.trim()) return;
    setActionStatus({ type: "info", message: "Sending document via email..." });
    try {
      const res = await distributeByEmail({
        document_id: generatedResult.document_id,
        recipients: [emailTo.trim()],
        subject: emailSubject || `ACM SVNIT Document: ${generatedResult.title}`,
        body: "Attached is the officially generated document from ACM SVNIT Smart Document Generator.",
        include_pdf: true,
        include_docx: true,
      });
      if (res.status === "unconfigured") {
        setActionStatus({
          type: "warning",
          message: `Email Distribution: ${res.message} (Implementation active; SMTP credentials unconfigured)`,
        });
      } else {
        setActionStatus({
          type: "success",
          message: `Email accepted for delivery! Audit Log ID: ${res.log_id}`,
        });
      }
      setEmailModalOpen(false);
    } catch (err) {
      setActionStatus({ type: "error", message: `Email failed: ${err.message}` });
    }
  }

  // EXTERNAL INTEGRATIONS: Cryptographic Digital Signature
  async function handleSignDoc() {
    if (!generatedResult?.document_id) return;
    setActionStatus({ type: "info", message: "Generating digital cryptographic signature..." });
    try {
      const res = await signDocument({
        document_id: generatedResult.document_id,
        signer_name: "Dr. Sankita J. Patel",
        signer_role: "Faculty Chairman, ACM",
      });
      setActionStatus({
        type: "success",
        message: `Cryptographically Signed! Algorithm: ${res.algorithm}, Digest: ${res.signature?.substring(0, 16)}... Status: ${res.status}`,
      });
    } catch (err) {
      setActionStatus({ type: "error", message: `Signing failed: ${err.message}` });
    }
  }

  const selectedDocConfig = documentCards.find((d) => d.id === selectedType) || documentCards[0];

  if (authChecking) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0f172a", color: "#ffffff", fontFamily: "'Inter', sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "2.4rem", marginBottom: "12px" }}>⚡</div>
          <div style={{ fontSize: "1.2rem", fontWeight: 700 }}>SmartDocs ACM SVNIT</div>
          <div style={{ fontSize: "0.85rem", color: "#94a3b8", marginTop: "6px" }}>Authenticating secure session...</div>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  if (bootstrapMode) {
    return (
      <AdminBootstrapPage
        user={currentUser}
        onSuccess={handleBootstrapSuccess}
        onContinue={exitBootstrapMode}
      />
    );
  }

  return (
    <div className="app-shell">
      {/* SIDEBAR NAVIGATION */}
      <aside className="sidebar">
        <a className="brand" href="#home">
          <span className="brand-icon">S</span>
          <span>
            <strong>SmartDocs</strong>
            <small>ACM · SVNIT SURAT</small>
          </span>
        </a>

        <div className="sidebar-label">WORKSPACE</div>

        <button
          type="button"
          className={`nav-item nav-item-btn ${activeTab === "create" ? "active" : ""}`}
          onClick={() => setActiveTab("create")}
        >
          <span>▤</span> {t("create_doc")}
        </button>

        <button
          type="button"
          className={`nav-item nav-item-btn ${activeTab === "batch" ? "active" : ""}`}
          onClick={() => setActiveTab("batch")}
        >
          <span>📦</span> {t("batch_generator")}
        </button>

        <button
          type="button"
          className={`nav-item nav-item-btn ${activeTab === "history" ? "active" : ""}`}
          onClick={() => setActiveTab("history")}
        >
          <span>⏳</span> {t("version_history")}
        </button>

        <button
          type="button"
          className={`nav-item nav-item-btn ${activeTab === "templates" ? "active" : ""}`}
          onClick={() => setActiveTab("templates")}
        >
          <span>🎨</span> {t("template_editor")}
        </button>

        <button
          type="button"
          className={`nav-item nav-item-btn ${activeTab === "analytics" ? "active" : ""}`}
          onClick={() => setActiveTab("analytics")}
        >
          <span>📊</span> {t("analytics")}
        </button>

        {currentRole === "admin" && (
          <button
            type="button"
            className="nav-item nav-item-btn"
            style={{ color: "#dc2626", fontWeight: 600 }}
            onClick={() => setShowUserMgmt(true)}
          >
            <span>👥</span> User Management
          </button>
        )}

        <div className="sidebar-note">
          <span
            className="status-dot"
            style={{ background: apiOnline ? "#10b981" : "#f59e0b" }}
          />
          <div>
            <strong>Document Studio</strong>
            <p>
              {apiOnline
                ? "FastAPI server active. Official DOCX & PDF generators ready."
                : "Connecting to FastAPI backend at 127.0.0.1:8000..."}
            </p>
          </div>
        </div>

        <div className="sidebar-footer">
          <div className="avatar">ACM</div>
          <div>
            <strong>ACM Student Chapter</strong>
            <small>SVNIT Surat · Production Ready</small>
          </div>
        </div>
      </aside>

      {/* MAIN VIEWPORT */}
      <main className="main-content" id="home">
        {/* TOPBAR WITH AUTHENTICATED USER & CONTROLS */}
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span> {activeTab.toUpperCase()} <span>/</span> {selectedDocConfig.title}
          </div>

          <div className="topbar-controls">
            {/* Authenticated User & Read-Only Role Indicator */}
            <div
              className="control-badge"
              style={{
                background: roleColors[currentRole]?.bg || "#f1f5f9",
                borderColor: roleColors[currentRole]?.border || "#cbd5e1",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "5px 12px",
              }}
              title={`Signed in as ${currentUser.full_name || currentUser.email}`}
            >
              <span style={{ fontSize: "0.85rem" }}>👤</span>
              <span style={{ fontWeight: 600, fontSize: "0.82rem", color: "#0f172a" }}>
                {currentUser.full_name || currentUser.email}
              </span>
              <span
                style={{
                  fontSize: "0.7rem",
                  fontWeight: 700,
                  padding: "2px 8px",
                  borderRadius: "10px",
                  background: roleColors[currentRole]?.pill || "#0284c7",
                  color: "#ffffff",
                  textTransform: "uppercase",
                }}
              >
                {roleDisplayNames[currentRole] || currentRole}
              </span>
              {currentUser.is_verified === 0 && (
                <span
                  style={{
                    fontSize: "0.68rem",
                    fontWeight: 700,
                    padding: "2px 6px",
                    borderRadius: "6px",
                    background: "#fef3c7",
                    color: "#b45309",
                    border: "1px solid #fde68a",
                  }}
                  title="Email verification required"
                >
                  ⚠️ Unverified
                </span>
              )}
            </div>

            {/* Admin User Management Modal Trigger */}
            {currentRole === "admin" && (
              <button
                type="button"
                onClick={() => setShowUserMgmt(true)}
                style={{
                  padding: "6px 12px",
                  borderRadius: "8px",
                  border: "1px solid #fecaca",
                  background: "#fff1f2",
                  color: "#e11d48",
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                👥 Users
              </button>
            )}

            {currentRole !== "admin" && (
              <button type="button" onClick={() => setShowRoleRequest(true)} className="control-badge">
                Request Role
              </button>
            )}

            {/* Language Switcher */}
            <div className="control-badge" title="Switch Interface Language (English, Hindi, Gujarati)">
              <span>🌐</span>
              <select value={lang} onChange={(e) => setLang(e.target.value)}>
                <option value="en">English (EN)</option>
                <option value="hi">हिन्दी (HI)</option>
                <option value="gu">ગુજરાતી (GU)</option>
              </select>
            </div>

            {/* API Status */}
            <div className="api-status">
              <span
                className="status-dot"
                style={{ background: apiOnline ? "#10b981" : "#f59e0b" }}
              />
              {apiOnline ? "FastAPI Connected" : "Connecting..."}
            </div>

            {/* Logout Button */}
            <button
              type="button"
              onClick={handleLogout}
              style={{
                padding: "6px 12px",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
                background: "#ffffff",
                color: "#475569",
                fontSize: "0.8rem",
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
              title="Sign out of current account"
            >
              🚪 Logout
            </button>
          </div>
        </header>

        {/* Read-Only Viewer Notice */}
        {currentRole === "viewer" && (
          <div
            role="status"
            style={{
              margin: "16px 28px 0",
              padding: "12px 18px",
              background: "#f8fafc",
              border: "1px solid #cbd5e1",
              borderRadius: "10px",
              display: "flex",
              alignItems: "center",
              gap: "10px",
              color: "#334155",
              fontSize: "0.85rem",
            }}
          >
            <span style={{ fontSize: "1.2rem" }}>👁️</span>
            <div>
              <strong>Read-Only Viewer Account:</strong> You are signed in as a Viewer. You can explore standard templates, history logs, and clauses, but cannot generate or submit documents. Contact a System Admin to request author privileges.
            </div>
          </div>
        )}

        {/* TAB 1: DOCUMENT STUDIO (MAIN GENERATOR) */}
        {activeTab === "create" && (
          <>
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
                  Generate official Executive Meets, Bill Certificates, and Bill Summaries
                  from your natural language prompts or structured forms.
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

            {/* STEP 1: DOCUMENT SELECTION CARDS */}
            <section className="section">
              <div className="section-heading">
                <div>
                  <h2>Choose a document</h2>
                  <p>Select the document type. Example reference data is displayed for demonstration.</p>
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
                    <div className="demo-preview-chip">
                      <strong>Demo Reference:</strong> {doc.mockExample.summary}
                    </div>
                    <span className="card-link" style={{ marginTop: 10 }}>
                      Use this template →
                    </span>
                  </button>
                ))}
              </div>
            </section>

            {/* FEATURE 1: AUTOMATIC DOCUMENT-TYPE DETECTION BANNER */}
            {recommendation && (
              <div className="recommendation-card">
                <div className="recommendation-info">
                  <div className="recommendation-title">
                    {recommendation.is_ambiguous
                      ? "⚠️ Ambiguous Document Classification"
                      : `💡 Recommended: ${
                          documentCards.find((d) => d.id === recommendation.recommended_type)?.title ||
                          recommendation.recommended_type
                        }`}
                  </div>
                  <div className="recommendation-meta">
                    {recommendation.is_ambiguous
                      ? "The system could not unambiguously determine document type. Please select your desired template explicitly."
                      : `Confidence: ${(recommendation.confidence * 100).toFixed(0)}% — ${recommendation.rationale}`}
                  </div>
                </div>
                <div className="recommendation-actions">
                  {!recommendation.is_ambiguous &&
                    recommendation.recommended_type !== selectedType && (
                      <button
                        type="button"
                        className="apply-rec-btn"
                        onClick={() => {
                          handleTypeChange(recommendation.recommended_type);
                          setRecommendation(null);
                        }}
                      >
                        Switch to {documentCards.find((d) => d.id === recommendation.recommended_type)?.title} →
                      </button>
                    )}
                  <button
                    type="button"
                    className="dismiss-rec-btn"
                    onClick={() => setRecommendation(null)}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            {/* NATURAL LANGUAGE QUICK-FILL WORKFLOW */}
            <div className="nlp-banner">
              <div className="nlp-header">
                <div>
                  <strong>✨ Natural Language Quick-Fill Assistant</strong>
                  <div style={{ fontSize: 11, color: "#cbd5e1", marginTop: 2 }}>
                    Enter event or expenditure prompt to extract structured information.
                  </div>
                </div>
                <button
                  type="button"
                  className="table-btn"
                  style={{ background: "#4338ca", color: "#e0e7ff" }}
                  onClick={() => setShowNlp(!showNlp)}
                >
                  {showNlp ? "Hide Assistant ▲" : "Open NLP Assistant ▼"}
                </button>
              </div>

              {showNlp && (
                <div style={{ marginTop: 8 }}>
                  <div className="nlp-input-row">
                    <textarea
                      value={nlpPrompt}
                      onChange={(e) => setNlpPrompt(e.target.value)}
                      placeholder={
                        selectedType === "exec_meet"
                          ? "e.g., Organize an ACM AI and Machine Learning workshop on 20 November 2026 from 10 AM to 1 PM at Seminar Hall 402, SVNIT Surat, for 120 students. The workshop will be organized by the ACM Core Team."
                          : selectedType === "bill_certificate"
                          ? "e.g., Purchase 25 notebooks at Rs 80 each and 10 pen sets at Rs 120 each from ABC Stationery."
                          : "e.g., Prepare a reimbursement summary for three students: Rahul Rs 1500 for travel, Priya Rs 800 for printing, and Amit Rs 1200 for event supplies."
                      }
                      rows={3}
                    />
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <button
                        type="button"
                        className="nlp-btn"
                        onClick={handleNlpExtract}
                        disabled={nlpLoading}
                      >
                        {nlpLoading ? "Analyzing..." : "Auto-Fill Form 🪄"}
                      </button>
                      <button
                        type="button"
                        className="table-btn"
                        style={{ background: "#3b82f6", color: "white" }}
                        onClick={handleClassifyOnly}
                        disabled={nlpLoading}
                        title="Analyze intent and recommend template without modifying form fields"
                      >
                        Classify Intent 🧭
                      </button>
                    </div>
                  </div>

                  {nlpFeedback.message && (
                    <div
                      style={{
                        fontSize: 12,
                        marginTop: 8,
                        padding: "6px 12px",
                        borderRadius: 6,
                        background:
                          nlpFeedback.type === "success"
                            ? "#064e3b"
                            : nlpFeedback.type === "error"
                            ? "#7f1d1d"
                            : "#312e81",
                        color:
                          nlpFeedback.type === "success"
                            ? "#a7f3d0"
                            : nlpFeedback.type === "error"
                            ? "#fecaca"
                            : "#e0e7ff",
                      }}
                    >
                      {nlpFeedback.type === "success" && "✓ "}
                      {nlpFeedback.type === "warning" && "⚠ "}
                      {nlpFeedback.type === "error" && "✕ "}
                      {nlpFeedback.message}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* STEP 2: DYNAMIC DOCUMENT INFORMATION FORM */}
            <section className="section form-section">
              <div className="section-heading">
                <div>
                  <h2>Document information</h2>
                  <p>Form starts empty with helpful placeholders. Fill manually or via Natural Language Quick-Fill.</p>
                </div>
                <span className="step-label">STEP 02</span>
              </div>

              <form onSubmit={handleReviewClick}>
                <div className="form-card">
                  {/* Dynamic Header */}
                  <div className="form-card-heading">
                    <span className="document-icon">{selectedDocConfig.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                        <h3 style={{ margin: 0 }}>{dynamicFormHeading}</h3>
                        <span className="doc-type-pill">{selectedDocConfig.title}</span>
                      </div>
                      <p style={{ margin: "4px 0 0" }}>{formSubtitle}</p>
                    </div>
                    <div className="form-header-right">
                      {/* FEATURE 6: REUSABLE CLAUSES BUTTON */}
                      <button
                        type="button"
                        className="clause-insert-btn"
                        onClick={() => setShowClausesModal(true)}
                        title="Insert pre-approved standard institutional clauses and paragraphs"
                      >
                        📑 Insert Clause
                      </button>
                      <button
                        type="button"
                        className="reset-btn"
                        onClick={handleResetForm}
                        title="Clear all fields in this form"
                      >
                        Clear Form ↺
                      </button>
                      <button
                        type="button"
                        className="demo-load-btn"
                        onClick={handleLoadMockExample}
                        title="Load demonstration example reference data"
                      >
                        Load Demo Data ⚡
                      </button>
                    </div>
                  </div>

                  {/* FORM TYPE 1: EXECUTIVE MEET */}
                  {selectedType === "exec_meet" && (
                    <>
                      <div className="form-section-title">EVENT SPECIFICATIONS</div>
                      <div className="form-grid">
                        <label className="field full-width">
                          <span>Event Name *</span>
                          <input
                            type="text"
                            placeholder="e.g., ACM AI and Machine Learning Workshop"
                            value={execData.event_name}
                            onChange={(e) => setExecData({ ...execData, event_name: e.target.value })}
                            required
                          />
                        </label>
                        <label className="field">
                          <span>Event Date *</span>
                          <input
                            type="text"
                            placeholder="e.g., 20/11/2026"
                            value={execData.event_date}
                            onChange={(e) => setExecData({ ...execData, event_date: e.target.value })}
                            required
                          />
                        </label>
                        <label className="field">
                          <span>Venue *</span>
                          <input
                            type="text"
                            placeholder="e.g., Seminar Hall 402, SVNIT Surat"
                            value={execData.venue}
                            onChange={(e) => setExecData({ ...execData, venue: e.target.value })}
                            required
                          />
                        </label>
                        <label className="field">
                          <span>Start Time</span>
                          <input
                            type="text"
                            placeholder="e.g., 10:00 AM"
                            value={execData.time_from}
                            onChange={(e) => setExecData({ ...execData, time_from: e.target.value })}
                          />
                        </label>
                        <label className="field">
                          <span>End Time</span>
                          <input
                            type="text"
                            placeholder="e.g., 01:00 PM"
                            value={execData.time_to}
                            onChange={(e) => setExecData({ ...execData, time_to: e.target.value })}
                          />
                        </label>
                        <label className="field">
                          <span>Expected Participants</span>
                          <input
                            type="text"
                            placeholder="e.g., 120"
                            value={execData.participants}
                            onChange={(e) => setExecData({ ...execData, participants: e.target.value })}
                          />
                        </label>
                        <label className="field">
                          <span>Organizing Club / Committee</span>
                          <input
                            type="text"
                            placeholder="e.g., ACM Core Team"
                            value={execData.organizers}
                            onChange={(e) => setExecData({ ...execData, organizers: e.target.value })}
                          />
                        </label>
                        <label className="field">
                          <span>Mode of Conduct</span>
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
                      </div>

                      {/* FEATURE 2: CONDITIONAL ONLINE/HYBRID MEETING SECTION */}
                      {(execData.mode === "Online" || execData.mode === "Hybrid") && (
                        <div className="dynamic-section-box">
                          <div style={{ fontWeight: 600, fontSize: 13, color: "#3730a3", marginBottom: 8 }}>
                            🌐 {execData.mode} Meeting Details (Dynamic Section)
                          </div>
                          <div className="form-grid">
                            <label className="field">
                              <span>Online Platform</span>
                              <input
                                type="text"
                                placeholder="e.g., Google Meet / Microsoft Teams / Zoom"
                                value={execData.online_meeting_platform}
                                onChange={(e) =>
                                  setExecData({ ...execData, online_meeting_platform: e.target.value })
                                }
                              />
                            </label>
                            <label className="field">
                              <span>Meeting Join Link / Code</span>
                              <input
                                type="text"
                                placeholder="e.g., https://meet.google.com/abc-defg-hij"
                                value={execData.online_meeting_link}
                                onChange={(e) =>
                                  setExecData({ ...execData, online_meeting_link: e.target.value })
                                }
                              />
                            </label>
                          </div>
                        </div>
                      )}

                      {/* FEATURE 2: CONDITIONAL AGENDA SECTION */}
                      <div className="dynamic-section-box">
                        <label className="section-toggle-label">
                          <input
                            type="checkbox"
                            checked={execData.has_agenda}
                            onChange={(e) =>
                              setExecData({ ...execData, has_agenda: e.target.checked })
                            }
                          />
                          <span>Include Detailed Agenda & Schedule Items (Conditional Section)</span>
                        </label>
                        {execData.has_agenda && (
                          <div style={{ marginTop: 10 }}>
                            <textarea
                              rows={3}
                              placeholder="e.g., 10:00 - 11:30 AM: Fundamentals of Machine Learning&#10;11:30 - 01:00 PM: Hands-on Python Lab"
                              value={execData.agenda_items}
                              onChange={(e) =>
                                setExecData({ ...execData, agenda_items: e.target.value })
                              }
                            />
                          </div>
                        )}
                      </div>

                      <div className="form-grid" style={{ marginTop: 12 }}>
                        <label className="field full-width">
                          <span>Brief Description</span>
                          <textarea
                            rows={3}
                            placeholder="e.g., ACM NIT Surat is organizing a technical workshop on artificial intelligence..."
                            value={execData.brief_description}
                            onChange={(e) =>
                              setExecData({ ...execData, brief_description: e.target.value })
                            }
                          />
                        </label>
                        <label className="field full-width">
                          <span>Event Objective</span>
                          <textarea
                            rows={2}
                            placeholder="e.g., To introduce students to machine learning foundations and practical workflows..."
                            value={execData.objective}
                            onChange={(e) => setExecData({ ...execData, objective: e.target.value })}
                          />
                        </label>
                      </div>

                      <div className="form-section-title">ADMINISTRATIVE & SIGNATORY DETAILS</div>
                      <div className="form-grid">
                        <label className="field">
                          <span>Reference Number</span>
                          <input
                            type="text"
                            placeholder="e.g., ACM/26-27/ROOM/009"
                            value={execData.ref_no}
                            onChange={(e) => setExecData({ ...execData, ref_no: e.target.value })}
                          />
                        </label>
                        <label className="field">
                          <span>Document Date</span>
                          <input
                            type="text"
                            placeholder="e.g., DD/MM/YYYY"
                            value={execData.date}
                            onChange={(e) => setExecData({ ...execData, date: e.target.value })}
                          />
                        </label>
                        <label className="field">
                          <span>Submitted To</span>
                          <input
                            type="text"
                            placeholder="e.g., HoD (CSE Dept.)"
                            value={execData.submitted_to}
                            onChange={(e) => setExecData({ ...execData, submitted_to: e.target.value })}
                          />
                        </label>
                        <label className="field">
                          <span>Subject Line</span>
                          <input
                            type="text"
                            placeholder="e.g., Requesting Permission to Conduct ACM AI Workshop in Seminar Hall 402"
                            value={execData.subject}
                            onChange={(e) => setExecData({ ...execData, subject: e.target.value })}
                          />
                        </label>
                        <label className="field">
                          <span>Student Lead Name</span>
                          <input
                            type="text"
                            placeholder="e.g., Ansh Gupta"
                            value={execData.lead_name}
                            onChange={(e) => setExecData({ ...execData, lead_name: e.target.value })}
                          />
                        </label>
                        <label className="field">
                          <span>Student Lead Designation</span>
                          <input
                            type="text"
                            placeholder="e.g., Chairperson, ACM"
                            value={execData.lead_designation}
                            onChange={(e) =>
                              setExecData({ ...execData, lead_designation: e.target.value })
                            }
                          />
                        </label>
                        <label className="field">
                          <span>Faculty In-Charge Name</span>
                          <input
                            type="text"
                            placeholder="e.g., Shri. Rakesh P. Gohil"
                            value={execData.faculty_incharge_name}
                            onChange={(e) =>
                              setExecData({ ...execData, faculty_incharge_name: e.target.value })
                            }
                          />
                        </label>
                        <label className="field">
                          <span>Faculty Chairman Name</span>
                          <input
                            type="text"
                            placeholder="e.g., Dr. Sankita J. Patel"
                            value={execData.faculty_chairman_name}
                            onChange={(e) =>
                              setExecData({ ...execData, faculty_chairman_name: e.target.value })
                            }
                          />
                        </label>
                      </div>
                    </>
                  )}

                  {/* FORM TYPE 2: BILL CERTIFICATE */}
                  {selectedType === "bill_certificate" && (
                    <>
                      <div className="form-section-title">CERTIFICATE HEADER & ACCOUNT DETAILS</div>
                      <div className="form-grid">
                        <label className="field">
                          <span>Chapter Name</span>
                          <input
                            type="text"
                            placeholder="e.g., ACM"
                            value={billCertData.chapter_name}
                            onChange={(e) => setBillCertData({ ...billCertData, chapter_name: e.target.value })}
                          />
                        </label>
                        <label className="field">
                          <span>Code Number</span>
                          <input
                            type="text"
                            placeholder="e.g., 6/52"
                            value={billCertData.code_no}
                            onChange={(e) => setBillCertData({ ...billCertData, code_no: e.target.value })}
                          />
                        </label>
                        <label className="field">
                          <span>Approval Note Number</span>
                          <input
                            type="text"
                            placeholder="e.g., ACM/2026-27/SIH/001"
                            value={billCertData.approval_note_no}
                            onChange={(e) => setBillCertData({ ...billCertData, approval_note_no: e.target.value })}
                          />
                        </label>
                        <label className="field">
                          <span>Document Date</span>
                          <input
                            type="text"
                            placeholder="e.g., DD/MM/YYYY"
                            value={billCertData.date}
                            onChange={(e) => setBillCertData({ ...billCertData, date: e.target.value })}
                          />
                        </label>
                        <label className="field">
                          <span>Head of Account</span>
                          <input
                            type="text"
                            placeholder="e.g., 6/52"
                            value={billCertData.head_of_account}
                            onChange={(e) => setBillCertData({ ...billCertData, head_of_account: e.target.value })}
                          />
                        </label>
                        <label className="field">
                          <span>Certifier Name</span>
                          <input
                            type="text"
                            placeholder="e.g., Dr. Sankita J. Patel"
                            value={billCertData.certifier_name}
                            onChange={(e) => setBillCertData({ ...billCertData, certifier_name: e.target.value })}
                          />
                        </label>
                      </div>

                      <div className="form-section-title">PURCHASED ITEMS & FINANCIALS</div>
                      <table className="items-table">
                        <thead>
                          <tr>
                            <th>Item Description *</th>
                            <th style={{ width: 100 }}>Quantity *</th>
                            <th style={{ width: 130 }}>Unit Cost (₹) *</th>
                            <th style={{ width: 120 }}>Total (₹)</th>
                            <th style={{ width: 70 }}>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {billCertData.items.map((item, idx) => (
                            <tr key={idx}>
                              <td>
                                <input
                                  type="text"
                                  placeholder="e.g., Banner Printing"
                                  value={item.name}
                                  onChange={(e) => updateBillItem(idx, "name", e.target.value)}
                                  required
                                />
                              </td>
                              <td>
                                <input
                                  type="number"
                                  placeholder="1"
                                  value={item.quantity}
                                  onChange={(e) => updateBillItem(idx, "quantity", e.target.value)}
                                  min="1"
                                  required
                                />
                              </td>
                              <td>
                                <input
                                  type="number"
                                  placeholder="0"
                                  value={item.unit_cost}
                                  onChange={(e) => updateBillItem(idx, "unit_cost", e.target.value)}
                                  min="0"
                                  step="0.01"
                                  required
                                />
                              </td>
                              <td style={{ fontWeight: 600 }}>
                                ₹{((Number(item.quantity) || 0) * (Number(item.unit_cost) || 0)).toFixed(2)}
                              </td>
                              <td>
                                <button
                                  type="button"
                                  className="table-btn delete-btn"
                                  onClick={() => removeBillItem(idx)}
                                  disabled={billCertData.items.length <= 1}
                                >
                                  ✕
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <button type="button" className="table-btn add-btn" onClick={addBillItem}>
                          ＋ Add Item
                        </button>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>
                          Subtotal: ₹{certSubtotal.toFixed(2)}
                        </div>
                      </div>

                      {/* FEATURE 2: CONDITIONAL TAXES/CHARGES SECTION */}
                      <div className="dynamic-section-box">
                        <label className="section-toggle-label">
                          <input
                            type="checkbox"
                            checked={billCertData.has_taxes}
                            onChange={(e) =>
                              setBillCertData({ ...billCertData, has_taxes: e.target.checked })
                            }
                          />
                          <span>Include Applicable GST / Surcharges (Conditional Section)</span>
                        </label>
                        {billCertData.has_taxes && (
                          <div className="form-grid" style={{ marginTop: 10 }}>
                            <label className="field">
                              <span>Taxes / Surcharges Amount (₹)</span>
                              <input
                                type="number"
                                placeholder="e.g., 180"
                                value={billCertData.taxes_or_other_charges}
                                onChange={(e) =>
                                  setBillCertData({ ...billCertData, taxes_or_other_charges: e.target.value })
                                }
                              />
                            </label>
                            <label className="field">
                              <span>Tax Breakdown / Notes</span>
                              <input
                                type="text"
                                placeholder="e.g., 18% GST (CGST 9% + SGST 9%)"
                                value={billCertData.tax_details}
                                onChange={(e) =>
                                  setBillCertData({ ...billCertData, tax_details: e.target.value })
                                }
                              />
                            </label>
                          </div>
                        )}
                      </div>

                      <div className="form-section-title">SUPPLIER & BANK DETAILS</div>
                      <div className="form-grid">
                        <label className="field">
                          <span>Supplier Name *</span>
                          <input
                            type="text"
                            placeholder="e.g., ABC Stationery & Prints"
                            value={billCertData.supplier_name}
                            onChange={(e) => setBillCertData({ ...billCertData, supplier_name: e.target.value })}
                            required
                          />
                        </label>
                        <label className="field">
                          <span>Supplier GST Number</span>
                          <input
                            type="text"
                            placeholder="e.g., 24AAACS1234D1Z5"
                            value={billCertData.supplier_gst}
                            onChange={(e) => setBillCertData({ ...billCertData, supplier_gst: e.target.value })}
                          />
                        </label>
                        <label className="field">
                          <span>Invoice No. & Date</span>
                          <input
                            type="text"
                            placeholder="e.g., INV-2026/089 dtd 08/09/2026"
                            value={billCertData.invoice_no_and_date}
                            onChange={(e) => setBillCertData({ ...billCertData, invoice_no_and_date: e.target.value })}
                          />
                        </label>
                        <label className="field">
                          <span>Bank Account Number</span>
                          <input
                            type="text"
                            placeholder="e.g., 987654321012"
                            value={billCertData.account_number}
                            onChange={(e) => setBillCertData({ ...billCertData, account_number: e.target.value })}
                          />
                        </label>
                        <label className="field">
                          <span>Bank Name</span>
                          <input
                            type="text"
                            placeholder="e.g., State Bank of India"
                            value={billCertData.bank_name}
                            onChange={(e) => setBillCertData({ ...billCertData, bank_name: e.target.value })}
                          />
                        </label>
                        <label className="field">
                          <span>IFSC Code</span>
                          <input
                            type="text"
                            placeholder="e.g., SBIN0003320"
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
                      <div className="form-section-title">SUMMARY HEADER DETAILS</div>
                      <div className="form-grid">
                        <label className="field">
                          <span>Document Date</span>
                          <input
                            type="text"
                            placeholder="e.g., DD/MM/YYYY"
                            value={billSummaryData.date}
                            onChange={(e) => setBillSummaryData({ ...billSummaryData, date: e.target.value })}
                          />
                        </label>
                        <label className="field">
                          <span>Document Title</span>
                          <input
                            type="text"
                            placeholder="e.g., BILL SUMMARY"
                            value={billSummaryData.title}
                            onChange={(e) => setBillSummaryData({ ...billSummaryData, title: e.target.value })}
                          />
                        </label>
                        <label className="field full-width">
                          <span>Activity Subtitle</span>
                          <input
                            type="text"
                            placeholder="e.g., Reimbursement for Cost incurred in SIH Internal Hackathon"
                            value={billSummaryData.subtitle}
                            onChange={(e) => setBillSummaryData({ ...billSummaryData, subtitle: e.target.value })}
                          />
                        </label>
                      </div>

                      <div className="form-section-title">RECIPIENT BREAKDOWN ROWS</div>
                      <table className="items-table">
                        <thead>
                          <tr>
                            <th>Recipient Name *</th>
                            <th>Expense Details</th>
                            <th style={{ width: 120 }}>Prize (₹)</th>
                            <th style={{ width: 120 }}>Other (₹)</th>
                            <th style={{ width: 70 }}>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {billSummaryData.rows.map((row, idx) => (
                            <tr key={idx}>
                              <td>
                                <input
                                  type="text"
                                  placeholder="e.g., Rahul Sharma"
                                  value={row.name}
                                  onChange={(e) => updateRecipientRow(idx, "name", e.target.value)}
                                  required
                                />
                              </td>
                              <td>
                                <input
                                  type="text"
                                  placeholder="e.g., Travel reimbursement"
                                  value={row.account_details}
                                  onChange={(e) => updateRecipientRow(idx, "account_details", e.target.value)}
                                />
                              </td>
                              <td>
                                <input
                                  type="number"
                                  placeholder="0"
                                  value={row.prize_money}
                                  onChange={(e) => updateRecipientRow(idx, "prize_money", e.target.value)}
                                  min="0"
                                />
                              </td>
                              <td>
                                <input
                                  type="number"
                                  placeholder="0"
                                  value={row.other_amount}
                                  onChange={(e) => updateRecipientRow(idx, "other_amount", e.target.value)}
                                  min="0"
                                />
                              </td>
                              <td>
                                <button
                                  type="button"
                                  className="table-btn delete-btn"
                                  onClick={() => removeRecipientRow(idx)}
                                  disabled={billSummaryData.rows.length <= 1}
                                >
                                  ✕
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <button type="button" className="table-btn add-btn" onClick={addRecipientRow}>
                          ＋ Add Recipient
                        </button>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>
                          Grand Total: ₹{summaryGrandTotal.toFixed(2)}
                        </div>
                      </div>

                      <div className="form-section-title">SIGNATORY ROLES</div>
                      <div className="form-grid">
                        <label className="field">
                          <span>Student Head Name</span>
                          <input
                            type="text"
                            placeholder="e.g., Ansh Gupta"
                            value={billSummaryData.student_head_name}
                            onChange={(e) =>
                              setBillSummaryData({ ...billSummaryData, student_head_name: e.target.value })
                            }
                          />
                        </label>
                        <label className="field">
                          <span>Student Secretary Name</span>
                          <input
                            type="text"
                            placeholder="e.g., Arshad Khatib"
                            value={billSummaryData.student_secretary_name}
                            onChange={(e) =>
                              setBillSummaryData({
                                ...billSummaryData,
                                student_secretary_name: e.target.value,
                              })
                            }
                          />
                        </label>
                        <label className="field">
                          <span>Faculty Chairman Name</span>
                          <input
                            type="text"
                            placeholder="e.g., Dr. Sankita Patel"
                            value={billSummaryData.faculty_chairman_name}
                            onChange={(e) =>
                              setBillSummaryData({
                                ...billSummaryData,
                                faculty_chairman_name: e.target.value,
                              })
                            }
                          />
                        </label>
                        <label className="field">
                          <span>Club Designation</span>
                          <input
                            type="text"
                            placeholder="e.g., ACM NIT-Surat"
                            value={billSummaryData.club_name}
                            onChange={(e) =>
                              setBillSummaryData({ ...billSummaryData, club_name: e.target.value })
                            }
                          />
                        </label>
                      </div>
                    </>
                  )}

                  {error && <div className="error-message">{error}</div>}

                  <div className="form-actions">
                    <p>
                      Review entered information before generating documents. Missing fields
                      will remain placeholders or fall back to official standards upon review.
                    </p>
                    <button className="primary-button" type="submit">
                      Review information <span>→</span>
                    </button>
                  </div>
                </div>
              </form>
            </section>

            {/* STEP 3: REVIEW INFORMATION SCREEN */}
            {reviewState && !generatedResult && (
              <section className="section preview-section">
                <div className="section-heading">
                  <div>
                    <h2>Review your information</h2>
                    <p>Check details before generating official Word and PDF documents.</p>
                  </div>
                  <span className="step-label">STEP 03</span>
                </div>

                <div className="preview-card">
                  <div className="preview-title">
                    <span className="document-icon">✓</span>
                    <div>
                      <h3>{reviewState.displayHeading || reviewState.type}</h3>
                      <p>{reviewState.type} · Ready for official generation</p>
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
                        <dt>Total Amount</dt>
                        <dd>
                          ₹{reviewState.calculation.total.toFixed(2)}
                          {reviewState.calculation.taxes
                            ? ` (includes ₹${reviewState.calculation.taxes.toFixed(2)} taxes/charges)`
                            : ""}
                        </dd>
                      </div>
                    )}
                  </dl>

                  {error && (
                    <div className="error-message" style={{ marginTop: 14 }}>
                      {error}
                    </div>
                  )}

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
                      disabled={isGenerating || currentRole === "viewer"}
                      title={currentRole === "viewer" ? "Viewers cannot generate documents. Requires Author or Admin role." : "Generate official documents"}
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

            {/* STEP 4 & 5: GENERATION SUCCESS & INTEGRATIONS */}
            {generatedResult && (
              <section className="section">
                <div className="section-heading">
                  <div>
                    <h2>Document ready for download</h2>
                    <p>Generated with official SVNIT ACM institutional styling.</p>
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

                  {actionStatus && (
                    <div
                      style={{
                        margin: "12px 0",
                        padding: "8px 14px",
                        borderRadius: 6,
                        fontSize: 13,
                        background:
                          actionStatus.type === "success"
                            ? "#ecfdf5"
                            : actionStatus.type === "error"
                            ? "#fef2f2"
                            : "#eff6ff",
                        color:
                          actionStatus.type === "success"
                            ? "#065f46"
                            : actionStatus.type === "error"
                            ? "#991b1b"
                            : "#1e40af",
                        border: `1px solid ${
                          actionStatus.type === "success"
                            ? "#a7f3d0"
                            : actionStatus.type === "error"
                            ? "#fecaca"
                            : "#bfdbfe"
                        }`,
                      }}
                    >
                      {actionStatus.type === "success" && "✓ "}
                      {actionStatus.type === "error" && "✕ "}
                      {actionStatus.type === "warning" && "⚠ "}
                      {actionStatus.message}
                    </div>
                  )}

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

                  {/* GOOD TO HAVE EXTERNAL WORKFLOW ACTIONS */}
                  <div style={{ marginTop: 20 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#475569", letterSpacing: 1 }}>
                      POST-GENERATION ACTIONS & WORKFLOWS
                    </div>
                    <div className="action-card-grid">
                      <div className="action-card" onClick={handleExportDrive}>
                        <h4>☁️ Export to Google Drive</h4>
                        <p>Sync to configured ACM institutional drive folder</p>
                      </div>
                      <div className="action-card" onClick={() => setEmailModalOpen(true)}>
                        <h4>✉️ Distribute by Email</h4>
                        <p>Send attachment securely to authorized stakeholders</p>
                      </div>
                      <div className="action-card" onClick={handleSignDoc}>
                        <h4>✍️ Cryptographically Sign</h4>
                        <p>Apply HMAC-SHA256 institutional digital seal</p>
                      </div>
                      <div
                        className="action-card"
                        onClick={() => {
                          setSelectedDocIdForHistory(generatedResult.document_id);
                          setActiveTab("history");
                        }}
                      >
                        <h4>⏳ Versions & Approval</h4>
                        <p>View audit trail, revisions, and approval workflow</p>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 12, marginTop: 22 }}>
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => {
                        setGeneratedResult(null);
                        setReviewState(null);
                        setActionStatus(null);
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
          </>
        )}

        {/* TAB 2: BATCH GENERATOR */}
        {activeTab === "batch" && (
          <BatchGenerator
            lang={lang}
            onDocumentCreated={(docId) => {
              setSelectedDocIdForHistory(docId);
              setActiveTab("history");
            }}
          />
        )}

        {/* TAB 3: VERSION HISTORY & WORKFLOW */}
        {activeTab === "history" && (
          <VersionWorkflowPanel
            documentId={selectedDocIdForHistory}
            role={currentRole}
            lang={lang}
          />
        )}

        {/* TAB 4: TEMPLATE EDITOR */}
        {activeTab === "templates" && (
          <TemplateEditorPanel role={currentRole} lang={lang} />
        )}

        {/* TAB 5: USAGE ANALYTICS */}
        {activeTab === "analytics" && (
          <AnalyticsDashboard role={currentRole} lang={lang} />
        )}

        <footer className="page-footer">
          <span>Smart Document Generator · ACM SVNIT</span>
          <span>FastAPI Backend + React Frontend · Production-Ready</span>
        </footer>
      </main>

      {/* CLAUSES MODAL */}
      <ClausesModal
        isOpen={showClausesModal}
        onClose={() => setShowClausesModal(false)}
        onInsertClause={handleInsertClause}
        onSelectClause={handleInsertClause}
        docType={selectedType}
        documentType={selectedType}
        formValues={
          selectedType === "exec_meet"
            ? execData
            : selectedType === "bill_certificate"
            ? billCertData
            : billSummaryData
        }
      />

      {/* USER MANAGEMENT MODAL (ADMIN ONLY) */}
      {currentRole === "admin" && (
        <UserManagementModal
          isOpen={showUserMgmt}
          onClose={() => setShowUserMgmt(false)}
          currentUserId={currentUser?.id}
        />
      )}
      {showRoleRequest && <RoleRequestModal onClose={() => setShowRoleRequest(false)} />}

      {/* EMAIL DISTRIBUTION MODAL */}
      {emailModalOpen && (
        <div className="clauses-modal-overlay">
          <div className="clauses-modal" style={{ maxWidth: 440 }}>
            <div className="clauses-modal-header">
              <h3>✉️ Distribute by Email</h3>
              <button
                type="button"
                className="close-modal-btn"
                onClick={() => setEmailModalOpen(false)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSendEmail} style={{ padding: 18 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>
                    Recipient Email Address *
                  </label>
                  <input
                    type="email"
                    placeholder="e.g., studenthead@svnit.ac.in"
                    value={emailTo}
                    onChange={(e) => setEmailTo(e.target.value)}
                    required
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #cbd5e1" }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>
                    Subject Line
                  </label>
                  <input
                    type="text"
                    placeholder="ACM SVNIT Document Delivery"
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #cbd5e1" }}
                  />
                </div>
                <div style={{ fontSize: 11, color: "#64748b" }}>
                  Both official DOCX and PDF formats will be attached. Delivery is logged for institutional audit.
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setEmailModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="primary-button">
                  Send Document
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
