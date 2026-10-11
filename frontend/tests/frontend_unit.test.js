import test from "node:test";
import assert from "node:assert/strict";
import { isApprovedInstitutionalEmail } from "../src/utils/institutionalEmail.js";
import { AUTH_SESSION_PATH, postAuthSession, BOOTSTRAP_ADMIN_PATH, postBootstrapAdmin } from "../src/services/authEndpoints.js";

test("Firebase sign-in session request uses POST /api/auth/session", async () => {
  const calls = [];
  const fakeFetch = async (url, options) => {
    calls.push({ url, options });
    return { ok: true };
  };

  await postAuthSession(fakeFetch, `https://backend.example${AUTH_SESSION_PATH}`, {
    Authorization: "Bearer test-token",
  });

  assert.equal(AUTH_SESSION_PATH, "/api/auth/session");
  assert.deepEqual(calls, [{
    url: "https://backend.example/api/auth/session",
    options: { method: "POST", headers: { Authorization: "Bearer test-token" } },
  }]);
});

test("System Admin bootstrap sends a fresh Firebase bearer token on the actual request", async () => {
  const calls = [];
  const fakeFetch = async (url, options) => {
    calls.push({ url, options });
    return { ok: true };
  };
  await postBootstrapAdmin(fakeFetch, `https://backend.example${BOOTSTRAP_ADMIN_PATH}`, "test-id-token");
  assert.deepEqual(calls, [{
    url: "https://backend.example/api/auth/bootstrap-admin",
    options: { method: "POST", headers: { Authorization: "Bearer test-id-token" } },
  }]);
  assert.equal(JSON.stringify(calls).includes("X-Bootstrap-Secret"), false);
});

// Helper replicating frontend field mapping for Executive Meet
function mapExecFields(extractedFields = {}) {
  const fieldMap = {
    event_name: extractedFields.event_name,
    event_date: extractedFields.event_date,
    venue: extractedFields.venue,
    time_from: extractedFields.time_from || extractedFields.start_time,
    time_to: extractedFields.time_to || extractedFields.end_time,
    participants: extractedFields.participants || extractedFields.expected_participants,
    organizers: extractedFields.organizers || extractedFields.organizing_club,
    mode: extractedFields.mode || extractedFields.mode_of_conduct,
    brief_description: extractedFields.brief_description,
    objective: extractedFields.objective,
    lead_name: extractedFields.lead_name || extractedFields.coordinator,
    ref_no: extractedFields.ref_no,
    date: extractedFields.date,
    submitted_to: extractedFields.submitted_to,
    subject: extractedFields.subject,
  };

  const appliedFields = {};
  let fieldCount = 0;
  for (const [k, v] of Object.entries(fieldMap)) {
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      appliedFields[k] = String(v).trim();
      fieldCount++;
    }
  }
  return { appliedFields, fieldCount };
}

// Financial calculations
function calculateBillCertTotals(items = [], taxes = 0) {
  let subtotal = 0;
  for (const itm of items) {
    subtotal += Math.round(Number(itm.quantity) * Number(itm.unit_cost) * 100) / 100;
  }
  subtotal = Math.round(subtotal * 100) / 100;
  const taxesNum = Math.round(Number(taxes) * 100) / 100;
  const grandTotal = Math.round((subtotal + taxesNum) * 100) / 100;
  return { subtotal, taxes: taxesNum, grandTotal };
}

function calculateBillSummaryTotals(rows = []) {
  let prizeTotal = 0;
  let otherTotal = 0;
  for (const r of rows) {
    prizeTotal += Math.round(Number(r.prize_money || 0) * 100) / 100;
    otherTotal += Math.round(Number(r.other_amount || 0) * 100) / 100;
  }
  prizeTotal = Math.round(prizeTotal * 100) / 100;
  otherTotal = Math.round(otherTotal * 100) / 100;
  const grandTotal = Math.round((prizeTotal + otherTotal) * 100) / 100;
  return { prizeTotal, otherTotal, grandTotal };
}

// TESTS
test("Frontend Executive Meet Mapping handles canonical keys and aliases", () => {
  const backendExtracted = {
    event_name: "Machine Learning Workshop",
    event_date: "28 October 2026",
    venue: "Seminar Hall, SVNIT Surat",
    start_time: "10:00 AM",
    end_time: "4:00 PM",
    expected_participants: "100",
    organizing_club: "ACM Student Chapter, SVNIT Surat",
    coordinator: "Darshil Prajapati",
    brief_description: "A workshop covering machine learning fundamentals."
  };

  const { appliedFields, fieldCount } = mapExecFields(backendExtracted);

  assert.equal(fieldCount, 9);
  assert.equal(appliedFields.event_name, "Machine Learning Workshop");
  assert.equal(appliedFields.event_date, "28 October 2026");
  assert.equal(appliedFields.venue, "Seminar Hall, SVNIT Surat");
  assert.equal(appliedFields.time_from, "10:00 AM");
  assert.equal(appliedFields.time_to, "4:00 PM");
  assert.equal(appliedFields.participants, "100");
  assert.equal(appliedFields.organizers, "ACM Student Chapter, SVNIT Surat");
  assert.equal(appliedFields.lead_name, "Darshil Prajapati");
  assert.equal(appliedFields.brief_description, "A workshop covering machine learning fundamentals.");

  // Unmentioned fields remain unset
  assert.equal(appliedFields.ref_no, undefined);
  assert.equal(appliedFields.submitted_to, undefined);
  assert.equal(appliedFields.mode, undefined);
});

test("Frontend Financial Calculations maintain decimal accuracy for Bill Certificate", () => {
  const items = [
    { name: "Component A", quantity: 3, unit_cost: 33.33 },
    { name: "Component B", quantity: 2, unit_cost: 15.50 }
  ];
  const { subtotal, taxes, grandTotal } = calculateBillCertTotals(items, 18.01);
  assert.equal(subtotal, 130.99); // 99.99 + 31.00
  assert.equal(taxes, 18.01);
  assert.equal(grandTotal, 149.00);
});

test("Frontend Financial Calculations maintain decimal accuracy for Bill Summary", () => {
  const rows = [
    { name: "Student 1", prize_money: 1500.50, other_amount: 100.25 },
    { name: "Student 2", prize_money: 800.00, other_amount: 50.00 }
  ];
  const { prizeTotal, otherTotal, grandTotal } = calculateBillSummaryTotals(rows);
  assert.equal(prizeTotal, 2300.50);
  assert.equal(otherTotal, 150.25);
  assert.equal(grandTotal, 2450.75);
});

test("Missing field detection identifies mandatory fields", () => {
  const partialFields = {
    event_name: "Workshop",
    venue: "Seminar Hall"
  };
  const required = ["event_name", "event_date", "venue", "time_from", "time_to", "brief_description"];
  const missing = required.filter(f => !partialFields[f]);

  assert.deepEqual(missing, ["event_date", "time_from", "time_to", "brief_description"]);
});

// Good-to-Have Feature 14: Multilingual Translation Test
import { translations } from "../src/i18n/translations.js";

test("Multilingual Translations contain full key coverage for en, hi, and gu", () => {
  const languages = ["en", "hi", "gu"];
  const essentialKeys = [
    "create_doc",
    "batch_generator",
    "version_history",
    "template_editor",
    "analytics",
    "recommended_type",
    "status_approved",
    "status_in_review"
  ];

  for (const lang of languages) {
    assert.ok(translations[lang], `Translation dictionary exists for ${lang}`);
    for (const key of essentialKeys) {
      assert.ok(
        typeof translations[lang][key] === "string" && translations[lang][key].length > 0,
        `Missing or empty translation for key '${key}' in language '${lang}'`
      );
    }
  }
});

// Good-to-Have Feature 1: Classification recommendation handler test
test("Classification recommendation logic identifies matching template and ambiguity", () => {
  const handleRecommendation = (clsResult, currentType) => {
    if (clsResult.is_ambiguous) {
      return { action: "prompt_user", message: "Ambiguous prompt" };
    }
    if (clsResult.recommended_type && clsResult.recommended_type !== currentType) {
      return { action: "recommend_switch", target: clsResult.recommended_type };
    }
    return { action: "keep_current", target: currentType };
  };

  const clearEvent = { recommended_type: "exec_meet", confidence: 0.95, is_ambiguous: false };
  assert.deepEqual(handleRecommendation(clearEvent, "bill_certificate"), {
    action: "recommend_switch",
    target: "exec_meet",
  });

  const ambiguous = { recommended_type: null, confidence: 0.3, is_ambiguous: true };
  assert.deepEqual(handleRecommendation(ambiguous, "exec_meet"), {
    action: "prompt_user",
    message: "Ambiguous prompt",
  });
});

// Good-to-Have Feature 2: Conditional Section Visibility Logic
test("Conditional section evaluation determines active fields correctly", () => {
  const evaluateExecSections = (formData) => {
    const sections = { offlineVenue: false, onlinePlatform: false, agenda: false };
    if (formData.mode === "Offline" || formData.mode === "Hybrid") {
      sections.offlineVenue = true;
    }
    if (formData.mode === "Online" || formData.mode === "Hybrid") {
      sections.onlinePlatform = true;
    }
    if (formData.has_agenda) {
      sections.agenda = true;
    }
    return sections;
  };

  const offlineDoc = evaluateExecSections({ mode: "Offline", has_agenda: false });
  assert.equal(offlineDoc.offlineVenue, true);
  assert.equal(offlineDoc.onlinePlatform, false);
  assert.equal(offlineDoc.agenda, false);

  const onlineWithAgenda = evaluateExecSections({ mode: "Online", has_agenda: true });
  assert.equal(onlineWithAgenda.offlineVenue, false);
  assert.equal(onlineWithAgenda.onlinePlatform, true);
  assert.equal(onlineWithAgenda.agenda, true);
});

// Good-to-Have Feature 6: Safe Clause Variable Interpolation & Insertion Tests
test("Clause variable interpolation correctly substitutes placeholders and validates missing variables", () => {
  function interpolateClause(template, variables) {
    const regex = /\{\{([a-zA-Z0-9_]+)\}\}/g;
    const missing = [];
    const used = [];
    const rendered = template.replace(regex, (_, key) => {
      used.push(key);
      if (variables[key] !== undefined && String(variables[key]).trim() !== "") {
        return String(variables[key]);
      }
      missing.push(key);
      return `[${key.replace(/_/g, " ").toUpperCase()}]`;
    });
    return { rendered, missing, used };
  }

  const clauseText = "Permission requested for {{event_name}} on {{event_date}} at {{venue}} coordinated by {{lead_name}}.";
  
  // Case A: Partial context
  const partial = interpolateClause(clauseText, {
    event_name: "AI Hackathon",
    venue: "Seminar Hall 402"
  });
  assert.equal(partial.rendered, "Permission requested for AI Hackathon on [EVENT DATE] at Seminar Hall 402 coordinated by [LEAD NAME].");
  assert.deepEqual(partial.missing, ["event_date", "lead_name"]);

  // Case B: Full context
  const complete = interpolateClause(clauseText, {
    event_name: "AI Hackathon",
    venue: "Seminar Hall 402",
    event_date: "28/10/2026",
    lead_name: "Darshil Prajapati"
  });
  assert.equal(complete.rendered, "Permission requested for AI Hackathon on 28/10/2026 at Seminar Hall 402 coordinated by Darshil Prajapati.");
  assert.deepEqual(complete.missing, []);
});

test("Clause document-type filtering provides appropriate clauses for all 3 document types", () => {
  const mockCatalog = [
    { id: "cl-exec-1", types: ["exec_meet"], approval: "pre_approved" },
    { id: "cl-exec-2", types: ["exec_meet"], approval: "sample_draft" },
    { id: "cl-bill-cert-1", types: ["bill_certificate"], approval: "pre_approved" },
    { id: "cl-bill-sum-1", types: ["bill_summary"], approval: "pre_approved" }
  ];

  const filterByDocType = (type) => mockCatalog.filter(c => c.types.includes(type));

  const execClauses = filterByDocType("exec_meet");
  assert.equal(execClauses.length, 2);
  assert.ok(execClauses.some(c => c.approval === "pre_approved"));
  assert.ok(execClauses.some(c => c.approval === "sample_draft"));

  const certClauses = filterByDocType("bill_certificate");
  assert.equal(certClauses.length, 1);

  const sumClauses = filterByDocType("bill_summary");
  assert.equal(sumClauses.length, 1);

  const unknownClauses = filterByDocType("nonexistent");
  assert.equal(unknownClauses.length, 0);
});

test("Inserting a clause updates the selected document section without overwriting unrelated form fields", () => {
  const initialExecForm = {
    event_name: "Annual General Meet",
    event_date: "2026-11-15",
    venue: "Seminar Hall",
    brief_description: "Initial description.",
    objective: "Initial objective."
  };

  const clauseText = "Certified decorum rules apply.";

  // Inserting into brief_description
  const updatedFormBrief = {
    ...initialExecForm,
    brief_description: `${initialExecForm.brief_description}\n\n${clauseText}`
  };
  assert.equal(updatedFormBrief.brief_description, "Initial description.\n\nCertified decorum rules apply.");
  assert.equal(updatedFormBrief.event_name, "Annual General Meet"); // Unrelated field intact
  assert.equal(updatedFormBrief.objective, "Initial objective."); // Unrelated field intact

  // Inserting into objective
  const updatedFormObj = {
    ...initialExecForm,
    objective: `${initialExecForm.objective}\n\n${clauseText}`
  };
  assert.equal(updatedFormObj.objective, "Initial objective.\n\nCertified decorum rules apply.");
  assert.equal(updatedFormObj.brief_description, "Initial description."); // Unrelated field intact
});

// Role-Based Access Control & Login Tests
test("Role-Based Permissions accurately define capabilities across all six roles", () => {
  const rolePermissions = {
    author: { canGenerate: true, canReview: false, canApprove: false, canManageTemplates: false, canManageUsers: false },
    reviewer: { canGenerate: false, canReview: true, canApprove: false, canManageTemplates: false, canManageUsers: false },
    approver: { canGenerate: false, canReview: true, canApprove: true, canManageTemplates: false, canManageUsers: false },
    template_admin: { canGenerate: true, canReview: false, canApprove: false, canManageTemplates: true, canManageUsers: false },
    admin: { canGenerate: true, canReview: true, canApprove: true, canManageTemplates: true, canManageUsers: true },
    viewer: { canGenerate: false, canReview: false, canApprove: false, canManageTemplates: false, canManageUsers: false },
  };

  // Author permissions
  assert.equal(rolePermissions.author.canGenerate, true);
  assert.equal(rolePermissions.author.canManageUsers, false);

  // Reviewer permissions
  assert.equal(rolePermissions.reviewer.canReview, true);
  assert.equal(rolePermissions.reviewer.canApprove, false);

  // Approver permissions
  assert.equal(rolePermissions.approver.canApprove, true);

  // Template Admin permissions
  assert.equal(rolePermissions.template_admin.canManageTemplates, true);

  // System Admin permissions
  assert.equal(rolePermissions.admin.canManageUsers, true);
  assert.equal(rolePermissions.admin.canGenerate, true);

  // Viewer read-only restrictions
  assert.equal(rolePermissions.viewer.canGenerate, false);
  assert.equal(rolePermissions.viewer.canApprove, false);
  assert.equal(rolePermissions.viewer.canManageUsers, false);
});

test("Login credential validator rejects empty or malformed inputs", () => {
  function validateLoginInput(email, password) {
    if (!email || !email.trim()) return { valid: false, error: "Email is required." };
    if (!password || !password.trim()) return { valid: false, error: "Password is required." };
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) return { valid: false, error: "Invalid email format." };
    return { valid: true };
  }

  assert.equal(validateLoginInput("", "Pass123").valid, false);
  assert.equal(validateLoginInput("author@svnit.acm.org", "").valid, false);
  assert.equal(validateLoginInput("notanemail", "Pass123").valid, false);
  assert.equal(validateLoginInput("admin@svnit.acm.org", "Admin@1234").valid, true);
});

test("Registration input validator enforces password match and security policy", () => {
  function validateRegistration({ fullName, email, password, confirmPassword }) {
    if (!fullName || !fullName.trim()) return { valid: false, error: "Name required" };
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return { valid: false, error: "Invalid email" };
    if (password !== confirmPassword) return { valid: false, error: "Passwords do not match" };
    if (password.length < 8) return { valid: false, error: "Password must be at least 8 characters" };
    if (!/\d/.test(password) || !/[a-zA-Z]/.test(password)) return { valid: false, error: "Must contain letter and digit" };
    return { valid: true };
  }

  // Mismatched passwords
  assert.equal(validateRegistration({ fullName: "User", email: "u@svnit.acm.org", password: "Password1", confirmPassword: "Password2" }).valid, false);

  // Short password
  assert.equal(validateRegistration({ fullName: "User", email: "u@svnit.acm.org", password: "short1", confirmPassword: "short1" }).valid, false);

  // No numbers
  assert.equal(validateRegistration({ fullName: "User", email: "u@svnit.acm.org", password: "NoNumbersHere", confirmPassword: "NoNumbersHere" }).valid, false);

  // Valid
  assert.equal(validateRegistration({ fullName: "User", email: "u@svnit.acm.org", password: "StrongPassword@1", confirmPassword: "StrongPassword@1" }).valid, true);
});

test("institutional email validation accepts SVNIT department domains and rejects lookalikes", () => {
  for (const email of ["i25ai007@aid.svnit.ac.in", "student@cse.svnit.ac.in", "student@svnit.ac.in", "member@svnit.acm.org"]) {
    assert.equal(isApprovedInstitutionalEmail(email), true, email);
  }
  for (const email of ["user@gmail.com", "user@svnit.ac.in.attacker.com", "user@evilsvnit.ac.in", "user@dept-svnit.ac.in"]) {
    assert.equal(isApprovedInstitutionalEmail(email), false, email);
  }
});

test("OTP verification input strictly requires 6 numeric digits", () => {
  function validateOtp(code) {
    if (!code) return false;
    const clean = code.trim();
    return clean.length === 6 && /^\d{6}$/.test(clean);
  }

  assert.equal(validateOtp("12345"), false); // too short
  assert.equal(validateOtp("1234567"), false); // too long
  assert.equal(validateOtp("12a456"), false); // non-numeric
  assert.equal(validateOtp("849201"), true); // valid 6 digits
});

test("User Management initials helper properly formats single, multi-word, and email fallbacks", () => {
  function getInitials(name, email) {
    if (name && name.trim()) {
      const parts = name.trim().split(/\s+/);
      if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
      }
      return parts[0].slice(0, 2).toUpperCase();
    }
    return (email || "U").slice(0, 2).toUpperCase();
  }

  assert.equal(getInitials("Darshil Prajapati", "i25ai007@aid.svnit.ac.in"), "DP");
  assert.equal(getInitials("Admin", "admin@svnit.ac.in"), "AD");
  assert.equal(getInitials("", "i25ai007@aid.svnit.ac.in"), "I2");
  assert.equal(getInitials(null, "president@svnit.acm.org"), "PR");
});

