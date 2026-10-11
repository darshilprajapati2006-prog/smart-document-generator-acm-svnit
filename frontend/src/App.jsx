import { useState, useEffect, useRef } from "react";
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
import RoleRequestPage from "./components/RoleRequestPage";
import AppFooter from "./components/AppFooter";
import {
  checkBackendHealth,
  generateExecutiveMeet,
  generateBillCertificate,
  generateBillSummary,
  generatePrizeMoneyReceipt,
  extractFromNLP,
  classifyPrompt,
  logoutUser,
  fetchCurrentUserProfile,
  exportToGoogleDrive,
  distributeByEmail,
  signDocument,
  getFullDownloadUrl,
} from "./services/documentApi";

// Document-generation priorities. Submitted opens the existing workflow history.
const documentCards = [
  {
    id: "exec_meet",
    priority: 1,
    title: "Permission Document",
    description: "Prepare an ACM SVNIT event permission request using the official event schedule and signatory layout.",
    icon: "📋",
  },
  {
    id: "prize_money_receipt",
    priority: 2,
    title: "Prize Money Receipt",
    description: "Create an individual prize receipt with validated amount, student, and bank-account details.",
    icon: "🏆",
  },
  {
    id: "submitted",
    priority: 3,
    title: "Submitted",
    description: "View submitted documents, their current status, approval history, and available actions.",
    icon: "⏳",
    workflowOnly: true,
  },
  {
    id: "bill_summary",
    priority: 4,
    title: "Bill Summary",
    description: "Prepare a multi-recipient reimbursement or payment summary with existing total calculations.",
    icon: "💳",
  },
  {
    id: "bill_certificate",
    priority: 5,
    title: "Bill Certi",
    description: "Complete the existing SVNIT recurring-expenditure certificate with itemized totals and signatures.",
    icon: "🧾",
  },
];
const ADMIN_EMAILS = ["admin@svnit.acm.org", "i25ai007@aid.svnit.ac.in", "ddprajapati916@gmail.com"];
const permissionRequiredFields = [
  ["ref_no", "Reference Number"], ["date", "Document Date"], ["submitted_to", "Submitted To"],
  ["subject", "Subject"], ["event_name", "Event Name"], ["event_date", "Event Date"],
  ["venue", "Venue"], ["time_from", "Start Time"], ["time_to", "End Time"],
  ["brief_description", "Brief Description"], ["objective", "Objective"],
  ["participants", "Number of Participants"], ["organizers", "Event Organizers"],
  ["lead_name", "Student Lead Name"], ["lead_designation", "Student Lead Designation"],
  ["lead_admission_no", "Student Admission Number"], ["lead_branch", "Student Branch"],
  ["tech_assist_name", "Technical Assistant Name"], ["tech_assist_designation", "Technical Assistant Designation"],
  ["tech_assist_branch", "Technical Assistant Branch"], ["faculty_incharge_name", "Faculty In-Charge Name"],
  ["faculty_incharge_designation", "Faculty In-Charge Designation"], ["faculty_incharge_branch", "Faculty In-Charge Department"],
  ["faculty_chairman_name", "Faculty Chairman Name"], ["faculty_chairman_designation", "Faculty Chairman Designation"],
  ["faculty_chairman_branch", "Faculty Chairman Department"],
];

function formatReceiptDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

function withTimeout(promise, timeoutMs, message) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timeoutId));
}

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

const emptyPrizeMoneyState = {
  serial_number: "",
  date: "",
  amount_rupees: "",
  competition_name: "",
  position: "",
  organizing_body: "",
  event_date: "",
  venue: "",
  affiliating_institute: "",
  name_as_per_bank: "",
  bank_name: "",
  branch: "",
  account_number: "",
  ifsc_code: "",
  pan_number: "",
  student_name: "",
  roll_number: "",
  course_semester: "",
  mobile_number: "",
  chairman_name: "",
};

export default function App() {
  const [selectedType, setSelectedType] = useState("exec_meet");

  // Isolated Form States
  const [execData, setExecData] = useState(emptyExecState);
  const [billCertData, setBillCertData] = useState(emptyBillCertState);
  const [billSummaryData, setBillSummaryData] = useState(emptyBillSummaryState);
  const [prizeMoneyData, setPrizeMoneyData] = useState(emptyPrizeMoneyState);

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
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = localStorage.getItem("acm_doc_user");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.email && ADMIN_EMAILS.includes(parsed.email.toLowerCase())) {
          return { ...parsed, role: "admin" };
        }
        return parsed;
      }
      return null;
    } catch {
      return null;
    }
  });

  const [currentRole, setCurrentRole] = useState(() => {
    try {
      const saved = localStorage.getItem("acm_doc_user");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.email && ADMIN_EMAILS.includes(parsed.email.toLowerCase())) {
          return "admin";
        }
        return parsed.role || "author";
      }
      return "author";
    } catch {
      return "author";
    }
  });
  const [authChecking, setAuthChecking] = useState(true);
  const [bootstrapMode, setBootstrapMode] = useState(() => new URLSearchParams(window.location.search).get("bootstrap-admin") === "1");
  const [showUserMgmt, setShowUserMgmt] = useState(false);
  const [roleRequestReturnTab, setRoleRequestReturnTab] = useState("create");
  const [recommendation, setRecommendation] = useState(null);
  const [showClausesModal, setShowClausesModal] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const menuButtonRef = useRef(null);
  const mobileNavRef = useRef(null);
  const [selectedDocIdForHistory, setSelectedDocIdForHistory] = useState("");
  const [actionStatus, setActionStatus] = useState(null);
  const [apiHealthStatus, setApiHealthStatus] = useState("checking");
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

  // Validate session and check backend health on mount
  useEffect(() => {
    let active = true;
    async function initAuthAndHealth() {
      let healthResolved = false;
      try {
        const isHealthy = await withTimeout(checkBackendHealth(), 12000, "Backend health check timed out");
        if (!active) return;
        healthResolved = true;
        setApiOnline(isHealthy);
        setApiHealthStatus(isHealthy ? "connected" : "offline");

        const profile = await withTimeout(fetchCurrentUserProfile(), 25000, "Session restoration timed out");
        if (!active) return;
        if (profile?.authenticated && profile.user) {
          const userObj = { ...profile.user };
          if (userObj.email && ADMIN_EMAILS.includes(userObj.email.toLowerCase())) {
            userObj.role = "admin";
          }
          setCurrentUser(userObj);
          setCurrentRole(userObj.role);
          localStorage.setItem("acm_doc_user", JSON.stringify(userObj));
        } else {
          setCurrentUser(null);
          localStorage.removeItem("acm_doc_user");
        }
      } catch {
        if (!active) return;
        if (!healthResolved) {
          setApiOnline(false);
          setApiHealthStatus("offline");
        }
        setCurrentUser(null);
        localStorage.removeItem("acm_doc_user");
      } finally {
        if (active) setAuthChecking(false);
      }
    }

    initAuthAndHealth();

    const interval = setInterval(async () => {
      const isHealthy = await checkBackendHealth();
      if (!active) return;
      setApiOnline(isHealthy);
      setApiHealthStatus(isHealthy ? "connected" : "offline");
    }, 15000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  function handleLoginSuccess(user) {
    const userObj = { ...user };
    if (userObj?.email && ADMIN_EMAILS.includes(userObj.email.toLowerCase())) {
      userObj.role = "admin";
    }
    setCurrentUser(userObj);
    setCurrentRole(userObj.role);
    localStorage.setItem("acm_doc_user", JSON.stringify(userObj));
  }

  function handleBootstrapSuccess(user) {
    const userObj = { ...user };
    if (userObj?.email && ADMIN_EMAILS.includes(userObj.email.toLowerCase())) {
      userObj.role = "admin";
    }
    setCurrentUser(userObj);
    setCurrentRole(userObj.role);
    localStorage.setItem("acm_doc_user", JSON.stringify(userObj));
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
    if (type === "submitted") {
      setSelectedDocIdForHistory("");
      setActiveTab("history");
      return;
    }
    setSelectedType(type);
    setActiveTab("create");
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
    } else if (selectedType === "prize_money_receipt") {
      setPrizeMoneyData(emptyPrizeMoneyState);
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
    dynamicFormHeading = execData.event_name.trim() || "Permission Document";
    formSubtitle = "Official ACM SVNIT event permission request following the supplied reference layout.";
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
  } else if (selectedType === "prize_money_receipt") {
    dynamicFormHeading = prizeMoneyData.competition_name.trim() || "Prize Money Receipt";
    formSubtitle = "Official individual prize payment receipt with student and bank details.";
  }

  // REVIEW HANDLER
  function handleReviewClick(e) {
    e.preventDefault();
    setError("");
    setGeneratedResult(null);

    if (selectedType === "exec_meet") {
      const missing = permissionRequiredFields.filter(([key]) => !String(execData[key] ?? "").trim()).map(([, label]) => label);
      if (missing.length) {
        setError(`Please complete the required fields: ${missing.join(", ")}.`);
        return;
      }
      setReviewState({
        type: "Executive Meet",
        displayHeading: execData.event_name,
        data: { ...execData },
        displayFields: [
          { label: "Reference Number", value: execData.ref_no },
          { label: "Document Date", value: execData.date },
          { label: "Submitted To", value: execData.submitted_to },
          { label: "Event Name", value: execData.event_name },
          {
            label: "Event Schedule",
            value: `${execData.event_date}${execData.time_from ? ` (${execData.time_from} - ${execData.time_to || "End"})` : ""}`,
          },
          { label: "Venue", value: execData.venue },
          { label: "Expected Participants", value: execData.participants },
          { label: "Mode of Conduct", value: execData.mode },
          { label: "Organizing Club", value: execData.organizers },
          { label: "Objective", value: execData.objective },
          {
            label: "Student Chairperson",
            value: `${execData.lead_name} (${execData.lead_designation})`,
          },
          {
            label: "Faculty In-Charge",
            value: execData.faculty_incharge_name,
          },
          {
            label: "Faculty Chairman",
            value: execData.faculty_chairman_name,
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
    } else if (selectedType === "prize_money_receipt") {
      const requiredFields = [
        ["serial_number", "Serial Number"], ["date", "Date"], ["amount_rupees", "Prize Amount"],
        ["competition_name", "Competition / Event"], ["position", "Position Secured"],
        ["organizing_body", "Organizing Body"], ["event_date", "Event Date"], ["venue", "Venue"],
        ["affiliating_institute", "Affiliating Institute"], ["name_as_per_bank", "Name as per Bank Account"],
        ["bank_name", "Bank Name"], ["branch", "Branch"], ["account_number", "Account Number"],
        ["ifsc_code", "IFSC Code"], ["pan_number", "PAN Card Number"], ["student_name", "Student Name"],
        ["roll_number", "Roll Number"], ["course_semester", "Course and Semester"],
        ["mobile_number", "Mobile Number"], ["chairman_name", "Chairman Name"],
      ];
      const missing = requiredFields.filter(([key]) => !String(prizeMoneyData[key] ?? "").trim()).map(([, label]) => label);
      const amount = String(prizeMoneyData.amount_rupees).trim();
      if (missing.length) {
        setError(`Please complete the required fields: ${missing.join(", ")}.`);
        return;
      }
      if (!/^\d+(?:\.\d{1,2})?$/.test(amount) || !Number.isFinite(Number(amount)) || Number(amount) < 0) {
        setError("Enter a valid non-negative prize amount with up to two decimal places.");
        return;
      }
      setReviewState({
        type: "Prize Money Receipt",
        displayHeading: prizeMoneyData.competition_name,
        data: { ...prizeMoneyData },
        displayFields: [
          { label: "Serial Number", value: prizeMoneyData.serial_number },
          { label: "Date", value: formatReceiptDate(prizeMoneyData.date) },
          { label: "Prize Amount", value: `₹${Number(amount).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
          { label: "Competition / Event", value: prizeMoneyData.competition_name },
          { label: "Position Secured", value: prizeMoneyData.position },
          { label: "Organizing Body", value: prizeMoneyData.organizing_body },
          { label: "Event Date & Venue", value: `${formatReceiptDate(prizeMoneyData.event_date)} · ${prizeMoneyData.venue}` },
          { label: "Affiliating Institute", value: prizeMoneyData.affiliating_institute },
          { label: "Bank / Branch", value: `${prizeMoneyData.bank_name} · ${prizeMoneyData.branch}` },
          { label: "Account Number", value: `••••${prizeMoneyData.account_number.slice(-4)}` },
          { label: "IFSC Code", value: prizeMoneyData.ifsc_code.toUpperCase() },
          { label: "PAN Card Number", value: `••••${prizeMoneyData.pan_number.slice(-4).toUpperCase()}` },
          { label: "Student", value: `${prizeMoneyData.student_name} · ${prizeMoneyData.roll_number}` },
          { label: "Course and Semester", value: prizeMoneyData.course_semester },
          { label: "Mobile Number", value: prizeMoneyData.mobile_number },
          { label: "Chairman", value: prizeMoneyData.chairman_name },
        ],
      });
    }
  }

  // GENERATE DOCUMENT HANDLER
  async function handleGenerateDocument() {
    if (isGenerating) return;
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
        const missing = permissionRequiredFields.filter(([key]) => !String(execData[key] ?? "").trim()).map(([, label]) => label);
        if (missing.length > 0) {
          setError(`Cannot generate document. Missing required fields: ${missing.join(", ")}. Please complete them in the form.`);
          setIsGenerating(false);
          return;
        }

        result = await generateExecutiveMeet({
          ...execData,
          date: execData.date.trim(),
          ref_no: execData.ref_no.trim(),
          submitted_to: execData.submitted_to.trim(),
          subject: execData.subject.trim(),
          brief_description: execData.brief_description.trim(),
          objective: execData.objective.trim(),
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
      } else if (selectedType === "prize_money_receipt") {
        const amount = String(prizeMoneyData.amount_rupees).trim();
        if (!/^\d+(?:\.\d{1,2})?$/.test(amount) || !Number.isFinite(Number(amount)) || Number(amount) < 0) {
          setError("Enter a valid non-negative prize amount with up to two decimal places.");
          setIsGenerating(false);
          return;
        }
        result = await generatePrizeMoneyReceipt({
          ...prizeMoneyData,
          date: formatReceiptDate(prizeMoneyData.date),
          event_date: formatReceiptDate(prizeMoneyData.event_date),
          amount_rupees: amount,
          ifsc_code: prizeMoneyData.ifsc_code.trim().toUpperCase(),
          pan_number: prizeMoneyData.pan_number.trim().toUpperCase(),
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

  useEffect(() => {
    if (!mobileNavOpen) return undefined;
    const previousFocus = document.activeElement;
    mobileNavRef.current?.querySelector("a[href], button:not([disabled])")?.focus();
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setMobileNavOpen(false);
        menuButtonRef.current?.focus();
      }
      if (event.key !== "Tab") return;
      const items = mobileNavRef.current?.querySelectorAll("a[href], button:not([disabled])");
      if (!items?.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [mobileNavOpen]);

  function navigateToTab(tab) {
    setActiveTab(tab);
    setMobileNavOpen(false);
  }

  function openRoleRequestPage(event) {
    event?.currentTarget?.closest("details")?.removeAttribute("open");
    setRoleRequestReturnTab(activeTab === "role-request" ? "create" : activeTab);
    setActiveTab("role-request");
    setMobileNavOpen(false);
  }

  function closeRoleRequestPage() {
    setActiveTab(roleRequestReturnTab === "role-request" ? "create" : roleRequestReturnTab);
  }

  function navigateFromFooter(tab, documentType = null, targetId = null) {
    setActiveTab(tab);
    setMobileNavOpen(false);
    if (documentType) handleTypeChange(documentType);
    if (targetId) {
      window.requestAnimationFrame(() => {
        document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  if (authChecking) {
    return (
      <main className="auth-loading-screen" aria-labelledby="auth-loading-title">
        <div className="auth-loading-glow auth-loading-glow-blue" aria-hidden="true" />
        <div className="auth-loading-glow auth-loading-glow-gold" aria-hidden="true" />
        <section className="auth-loading-content" aria-live="polite" aria-busy="true">
          <div className="auth-loading-institutions" aria-label="ACM Student Chapter and SVNIT Surat">
            <div className="auth-loading-logo-tile">
              <img src="/branding/acm_logo.png" alt="ACM logo" />
            </div>
            <span className="auth-loading-cross" aria-hidden="true">×</span>
            <div className="auth-loading-logo-tile auth-loading-logo-svnit">
              <img src="/branding/svnit_logo.png" alt="SVNIT logo" />
            </div>
          </div>

          <div className="auth-loading-divider" aria-hidden="true"><span /></div>

          <div className="auth-loading-brand">
            <p className="auth-loading-eyebrow">OFFICIAL DOCUMENT WORKSPACE</p>
            <h1 id="auth-loading-title">SmartDocs</h1>
            <p className="auth-loading-institution-name">ACM · SVNIT SURAT</p>
          </div>

          <div className="auth-loading-indicator" role="status" aria-label="Checking your secure session">
            <span className="auth-loading-spinner" aria-hidden="true" />
            <span className="auth-loading-indicator-core" aria-hidden="true">SD</span>
          </div>

          <p className="auth-loading-status">Checking your secure session</p>
          <p className="auth-loading-support">Your workspace will open when sign-in is verified.</p>

          <div className="auth-loading-security">
            <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
              <path d="M10 2.2 16 4.5v4.8c0 3.7-2.5 6.7-6 8.5-3.5-1.8-6-4.8-6-8.5V4.5l6-2.3Z" />
              <path d="m7.4 9.8 1.7 1.7 3.6-3.7" />
            </svg>
            <span>SECURE WORKSPACE</span>
          </div>
          <p className="auth-loading-footer">ACM Student Chapter · SVNIT Surat</p>
        </section>
      </main>
    );
  }

  if (!currentUser) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  if (bootstrapMode) {
    return (
      <AdminBootstrapPage
        user={currentUser}
        apiOnline={apiOnline}
        onSuccess={handleBootstrapSuccess}
        onContinue={exitBootstrapMode}
      />
    );
  }

  return (
    <div className="app-shell">
      {/* SIDEBAR NAVIGATION */}
      <aside id="workspace-navigation" className={`sidebar ${mobileNavOpen ? "sidebar-open" : ""}`} ref={mobileNavRef} aria-label="Workspace navigation">
        <button type="button" className="mobile-drawer-close" aria-label="Close navigation menu" onClick={() => setMobileNavOpen(false)}>×</button>
        <a className="brand" href="#home">
          <span className="brand-icon"><img src="/branding/acm_logo.png" alt="" /></span>
          <span>
            <strong>SmartDocs</strong>
            <small>ACM · SVNIT SURAT</small>
          </span>
        </a>

        <div className="sidebar-label">WORKSPACE</div>

        <button
          type="button"
          className={`nav-item nav-item-btn ${activeTab === "create" ? "active" : ""}`}
          onClick={() => navigateToTab("create")}
        >
          <span>▤</span> {t("create_doc")}
        </button>

        <button
          type="button"
          className={`nav-item nav-item-btn ${activeTab === "batch" ? "active" : ""}`}
          onClick={() => navigateToTab("batch")}
        >
          <span>📦</span> {t("batch_generator")}
        </button>

        <button
          type="button"
          className={`nav-item nav-item-btn ${activeTab === "history" ? "active" : ""}`}
          onClick={() => navigateToTab("history")}
        >
          <span>⏳</span> {t("version_history")}
        </button>

        <button
          type="button"
          className={`nav-item nav-item-btn ${activeTab === "templates" ? "active" : ""}`}
          onClick={() => navigateToTab("templates")}
        >
          <span>🎨</span> {t("template_editor")}
        </button>

        <button
          type="button"
          className={`nav-item nav-item-btn ${activeTab === "analytics" ? "active" : ""}`}
          onClick={() => navigateToTab("analytics")}
        >
          <span>📊</span> {t("analytics")}
        </button>

        {currentRole === "admin" && (
          <button
            type="button"
            className="nav-item nav-item-btn admin-nav-item"
            onClick={() => { setShowUserMgmt(true); setMobileNavOpen(false); }}
          >
            <span className="nav-icon" aria-hidden="true">👥</span>
            User Management
            <span className="admin-nav-pill">Admin</span>
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
          <div className="developer-credit" aria-label="Designed and developed by Darshil Prajapati, I25AI007">
            <span className="developer-credit-label">Designed And Developed By :</span>
            <strong className="developer-credit-name">DARSHIL PRAJAPATI</strong>
            <span className="developer-credit-id">I25AI007</span>
          </div>
        </div>
      </aside>

      {/* MAIN VIEWPORT */}
      <main className="main-content" id="home">
        {/* TOPBAR WITH AUTHENTICATED USER & CONTROLS */}
        <header className="topbar">
          <button ref={menuButtonRef} type="button" className="mobile-menu-button" aria-label={mobileNavOpen ? "Close navigation menu" : "Open navigation menu"} aria-expanded={mobileNavOpen} aria-controls="workspace-navigation" onClick={() => setMobileNavOpen((open) => !open)}>
            <span /><span /><span />
          </button>
          <div className="institution-mark" aria-label="ACM SVNIT">
            <img src="/branding/svnit_logo.png" alt="SVNIT" />
            <span>ACM<br /><small>SVNIT SURAT</small></span>
          </div>
          <div className="topbar-context">
            <div className="breadcrumb" aria-label="Current workspace">
              <span className="breadcrumb-root">Workspace</span><span aria-hidden="true">/</span> {activeTab.replaceAll("-", " ").toUpperCase()} <span aria-hidden="true">/</span> {selectedDocConfig.title}
            </div>
          </div>

          <div className="topbar-controls" aria-label="Account controls">
            <div className="account-cluster" title={`Signed in as ${currentUser.full_name || currentUser.email}`}>
              <span className="account-avatar" aria-hidden="true">{(currentUser.full_name || currentUser.email || "U").slice(0, 1).toUpperCase()}</span>
              <span className="account-name">{currentUser.full_name || currentUser.email}</span>
              <span className={`role-badge role-${currentRole}`}>{roleDisplayNames[currentRole] || currentRole}</span>
            </div>
            {currentUser.is_verified === 0 && <span className="verification-badge" title="Email verification required">Unverified</span>}

            {currentRole === "admin" && <button type="button" onClick={() => setShowUserMgmt(true)} className="header-action admin-users-action">Users</button>}
            {currentRole !== "admin" && <button type="button" onClick={openRoleRequestPage} className="header-action request-role-action">Request role</button>}

            <label className="language-control" title="Switch interface language">
              <span aria-hidden="true">🌐</span>
              <select value={lang} onChange={(e) => setLang(e.target.value)} aria-label="Interface language">
                <option value="en">English</option>
                <option value="hi">हिन्दी</option>
                <option value="gu">ગુજરાતી</option>
              </select>
            </label>

            <div className="health-indicator" data-state={apiHealthStatus} role="status" aria-live="polite">
              <span className="health-dot" aria-hidden="true" />
              <span>{apiHealthStatus === "checking" ? "Checking API" : apiOnline ? "API connected" : "API offline"}</span>
            </div>

            <button type="button" onClick={handleLogout} className="header-action logout-action" title="Sign out of current account">Log out</button>

            <details className="mobile-account-menu">
              <summary className="account-cluster" aria-label="Open account actions">
                <span className="account-avatar" aria-hidden="true">{(currentUser.full_name || currentUser.email || "U").slice(0, 1).toUpperCase()}</span>
                <span className="account-name">{currentUser.full_name || currentUser.email}</span>
                <span className={`role-badge role-${currentRole}`}>{roleDisplayNames[currentRole] || currentRole}</span>
              </summary>
              <div className="mobile-account-popover">
                {currentUser.is_verified === 0 && <span className="verification-badge">Email unverified</span>}
                {currentRole === "admin" && <button type="button" onClick={() => setShowUserMgmt(true)} className="header-action">User management</button>}
                {currentRole !== "admin" && <button type="button" onClick={openRoleRequestPage} className="header-action">Request role</button>}
                <label className="language-control"><span aria-hidden="true">🌐</span><select value={lang} onChange={(e) => setLang(e.target.value)} aria-label="Interface language"><option value="en">English</option><option value="hi">हिन्दी</option><option value="gu">ગુજરાતી</option></select></label>
                <div className="health-indicator" data-state={apiHealthStatus} role="status"><span className="health-dot" aria-hidden="true" />{apiHealthStatus === "checking" ? "Checking API" : apiOnline ? "API connected" : "API offline"}</div>
                <button type="button" onClick={handleLogout} className="header-action logout-action">Log out</button>
              </div>
            </details>
          </div>
        </header>

        {/* Read-Only Viewer Notice */}
        {currentRole === "viewer" && (
          <div
            className="viewer-notice"
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
        {activeTab === "role-request" && (
          <RoleRequestPage onClose={closeRoleRequestPage} />
        )}

        {activeTab === "create" && (
          <>
            {/* Hero Section */}
            <section className="welcome" id="create">
              <div className="welcome-watermark" aria-hidden="true"><img src="/branding/svnit_logo.png" alt="" /></div>
              <div>
                <div className="eyebrow">DOCUMENT AUTOMATION WORKSPACE</div>
                <h1>
                  Make documents.
                  <br />
                  <span>Skip the repetitive work.</span>
                </h1>
                <p>Prepare official permission requests, prize receipts, bill summaries, and expenditure certificates with review and status tracking.</p>
                <div className="hero-meta"><span>SVNIT · SURAT</span><i /> <span>DOCUMENT OPERATIONS</span></div>
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
                  <p>Choose an official document or open submitted-document status and approval history.</p>
                </div>
                <span className="step-label">STEP 01</span>
              </div>

              <div className="document-grid">
                {documentCards.map((doc) => {
                  const isSelected = selectedType === doc.id;
                  return (
                    <button
                      type="button"
                      key={doc.id}
                      className={`document-card ${isSelected ? "selected" : ""} ${doc.priority === 1 ? "priority-primary" : ""}`}
                      onClick={() => handleTypeChange(doc.id)}
                      aria-pressed={isSelected}
                      aria-label={`Priority ${doc.priority}: ${doc.title}`}
                    >
                      <div className="card-top">
                        <span className="document-icon">{doc.icon}</span>
                        <span className="document-priority">0{doc.priority}</span>
                      </div>
                      <div className="document-card-body">
                        <h3>{doc.title}</h3>
                        <p>{doc.description}</p>
                      </div>
                      <div className="document-card-action">
                        <span className="card-link">
                          {doc.workflowOnly ? "Open document history →" : isSelected ? "Active Document ✓" : "Use this template →"}
                        </span>
                      </div>
                    </button>
                  );
                })}
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
            {selectedType !== "prize_money_receipt" && <div className="nlp-banner">
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
            </div>}

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
                        disabled={selectedType === "prize_money_receipt"}
                        title={selectedType === "prize_money_receipt" ? "No sample banking data is provided for this receipt." : "Load demonstration example reference data"}
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
                          <span>Student Lead Name *</span>
                          <input
                            type="text"
                            placeholder="Enter the student lead's full name"
                            value={execData.lead_name}
                            onChange={(e) => setExecData({ ...execData, lead_name: e.target.value })}
                          />
                        </label>
                        <label className="field">
                          <span>Student Lead Designation *</span>
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
                          <span>Student Admission Number *</span>
                          <input type="text" maxLength={60} value={execData.lead_admission_no} onChange={(e) => setExecData({ ...execData, lead_admission_no: e.target.value })} />
                        </label>
                        <label className="field">
                          <span>Student Branch *</span>
                          <input type="text" maxLength={120} value={execData.lead_branch} onChange={(e) => setExecData({ ...execData, lead_branch: e.target.value })} />
                        </label>
                        <label className="field">
                          <span>Technical Assistant Name *</span>
                          <input type="text" maxLength={160} value={execData.tech_assist_name} onChange={(e) => setExecData({ ...execData, tech_assist_name: e.target.value })} />
                        </label>
                        <label className="field">
                          <span>Technical Assistant Designation *</span>
                          <input type="text" maxLength={120} value={execData.tech_assist_designation} onChange={(e) => setExecData({ ...execData, tech_assist_designation: e.target.value })} />
                        </label>
                        <label className="field">
                          <span>Technical Assistant Branch *</span>
                          <input type="text" maxLength={120} value={execData.tech_assist_branch} onChange={(e) => setExecData({ ...execData, tech_assist_branch: e.target.value })} />
                        </label>
                        <label className="field">
                          <span>Faculty In-Charge Name *</span>
                          <input
                            type="text"
                            placeholder="Enter the faculty in-charge's name"
                            value={execData.faculty_incharge_name}
                            onChange={(e) =>
                              setExecData({ ...execData, faculty_incharge_name: e.target.value })
                            }
                          />
                        </label>
                        <label className="field">
                          <span>Faculty In-Charge Designation *</span>
                          <input type="text" maxLength={120} value={execData.faculty_incharge_designation} onChange={(e) => setExecData({ ...execData, faculty_incharge_designation: e.target.value })} />
                        </label>
                        <label className="field">
                          <span>Faculty In-Charge Department *</span>
                          <input type="text" maxLength={120} value={execData.faculty_incharge_branch} onChange={(e) => setExecData({ ...execData, faculty_incharge_branch: e.target.value })} />
                        </label>
                        <label className="field">
                          <span>Faculty Chairman Name *</span>
                          <input
                            type="text"
                            placeholder="Enter the faculty chairman's name"
                            value={execData.faculty_chairman_name}
                            onChange={(e) =>
                              setExecData({ ...execData, faculty_chairman_name: e.target.value })
                            }
                          />
                        </label>
                        <label className="field">
                          <span>Faculty Chairman Designation *</span>
                          <input type="text" maxLength={120} value={execData.faculty_chairman_designation} onChange={(e) => setExecData({ ...execData, faculty_chairman_designation: e.target.value })} />
                        </label>
                        <label className="field">
                          <span>Faculty Chairman Department *</span>
                          <input type="text" maxLength={120} value={execData.faculty_chairman_branch} onChange={(e) => setExecData({ ...execData, faculty_chairman_branch: e.target.value })} />
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

                  {selectedType === "prize_money_receipt" && (
                    <>
                      <div className="form-section-title">RECEIPT AND EVENT DETAILS</div>
                      <div className="form-grid">
                        <label className="field"><span>Serial Number *</span><input required maxLength={60} value={prizeMoneyData.serial_number} onChange={(e) => setPrizeMoneyData({ ...prizeMoneyData, serial_number: e.target.value })} /></label>
                        <label className="field"><span>Receipt Date *</span><input required type="date" value={prizeMoneyData.date} onChange={(e) => setPrizeMoneyData({ ...prizeMoneyData, date: e.target.value })} /></label>
                        <label className="field"><span>Prize Amount (₹) *</span><input required type="number" min="0" step="0.01" inputMode="decimal" value={prizeMoneyData.amount_rupees} onChange={(e) => setPrizeMoneyData({ ...prizeMoneyData, amount_rupees: e.target.value })} /></label>
                        <label className="field"><span>Competition / Event *</span><input required maxLength={240} value={prizeMoneyData.competition_name} onChange={(e) => setPrizeMoneyData({ ...prizeMoneyData, competition_name: e.target.value })} /></label>
                        <label className="field"><span>Position Secured *</span><input required maxLength={120} value={prizeMoneyData.position} onChange={(e) => setPrizeMoneyData({ ...prizeMoneyData, position: e.target.value })} /></label>
                        <label className="field"><span>Organizing Body *</span><input required maxLength={240} value={prizeMoneyData.organizing_body} onChange={(e) => setPrizeMoneyData({ ...prizeMoneyData, organizing_body: e.target.value })} /></label>
                        <label className="field"><span>Event Date *</span><input required type="date" value={prizeMoneyData.event_date} onChange={(e) => setPrizeMoneyData({ ...prizeMoneyData, event_date: e.target.value })} /></label>
                        <label className="field"><span>Event Venue *</span><input required maxLength={240} value={prizeMoneyData.venue} onChange={(e) => setPrizeMoneyData({ ...prizeMoneyData, venue: e.target.value })} /></label>
                      </div>

                      <div className="form-section-title">ACCOUNT DETAILS</div>
                      <div className="form-grid">
                        <label className="field full-width"><span>Affiliating Institute *</span><input required maxLength={240} value={prizeMoneyData.affiliating_institute} onChange={(e) => setPrizeMoneyData({ ...prizeMoneyData, affiliating_institute: e.target.value })} /></label>
                        <label className="field"><span>Name as per Bank Account *</span><input required maxLength={160} autoComplete="off" value={prizeMoneyData.name_as_per_bank} onChange={(e) => setPrizeMoneyData({ ...prizeMoneyData, name_as_per_bank: e.target.value })} /></label>
                        <label className="field"><span>Bank Name *</span><input required maxLength={160} autoComplete="off" value={prizeMoneyData.bank_name} onChange={(e) => setPrizeMoneyData({ ...prizeMoneyData, bank_name: e.target.value })} /></label>
                        <label className="field"><span>Branch *</span><input required maxLength={160} autoComplete="off" value={prizeMoneyData.branch} onChange={(e) => setPrizeMoneyData({ ...prizeMoneyData, branch: e.target.value })} /></label>
                        <label className="field"><span>Account Number *</span><input required maxLength={80} inputMode="numeric" autoComplete="off" value={prizeMoneyData.account_number} onChange={(e) => setPrizeMoneyData({ ...prizeMoneyData, account_number: e.target.value })} /></label>
                        <label className="field"><span>IFSC Code *</span><input required maxLength={20} autoComplete="off" value={prizeMoneyData.ifsc_code} onChange={(e) => setPrizeMoneyData({ ...prizeMoneyData, ifsc_code: e.target.value.toUpperCase() })} /></label>
                        <label className="field"><span>PAN Card Number *</span><input required maxLength={20} autoComplete="off" value={prizeMoneyData.pan_number} onChange={(e) => setPrizeMoneyData({ ...prizeMoneyData, pan_number: e.target.value.toUpperCase() })} /></label>
                      </div>

                      <div className="form-section-title">STUDENT AND CERTIFICATION DETAILS</div>
                      <div className="form-grid">
                        <label className="field"><span>Student Name *</span><input required maxLength={160} value={prizeMoneyData.student_name} onChange={(e) => setPrizeMoneyData({ ...prizeMoneyData, student_name: e.target.value })} /></label>
                        <label className="field"><span>Roll Number *</span><input required maxLength={60} autoComplete="off" value={prizeMoneyData.roll_number} onChange={(e) => setPrizeMoneyData({ ...prizeMoneyData, roll_number: e.target.value })} /></label>
                        <label className="field"><span>Course and Semester *</span><input required maxLength={120} value={prizeMoneyData.course_semester} onChange={(e) => setPrizeMoneyData({ ...prizeMoneyData, course_semester: e.target.value })} /></label>
                        <label className="field"><span>Mobile Number *</span><input required type="tel" maxLength={30} autoComplete="tel" value={prizeMoneyData.mobile_number} onChange={(e) => setPrizeMoneyData({ ...prizeMoneyData, mobile_number: e.target.value })} /></label>
                        <label className="field full-width"><span>Chairman Name *</span><input required maxLength={160} value={prizeMoneyData.chairman_name} onChange={(e) => setPrizeMoneyData({ ...prizeMoneyData, chairman_name: e.target.value })} /></label>
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
          <TemplateEditorPanel currentRole={currentRole} lang={lang} />
        )}

        {/* TAB 5: USAGE ANALYTICS */}
        {activeTab === "analytics" && (
          <AnalyticsDashboard role={currentRole} lang={lang} />
        )}

        <AppFooter
          onNavigate={navigateFromFooter}
          canManageUsers={currentRole === "admin"}
          onManageUsers={() => setShowUserMgmt(true)}
        />
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

      {/* EMAIL DISTRIBUTION MODAL */}
      {emailModalOpen && (
        <div className="clauses-modal-overlay">
          <div className="clauses-modal theme-modal-card" style={{ maxWidth: 440 }}>
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
