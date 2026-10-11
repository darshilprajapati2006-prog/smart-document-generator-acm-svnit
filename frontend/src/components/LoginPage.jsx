import React, { useEffect, useState } from "react";
import { firebaseAuth } from "../services/firebase";
import { reload, sendEmailVerification, signOut } from "firebase/auth";
import {
  loginUser,
  completeVerifiedAccountSetup,
  registerUser,
  forgotPassword,
  validateInvitation,
  apiUrl,
} from "../services/documentApi";
import { AUTH_SESSION_PATH, postAuthSession } from "../services/authEndpoints.js";
import { isApprovedInstitutionalEmail } from "../utils/institutionalEmail";

export default function LoginPage({ onLoginSuccess }) {
  const invitationToken = new URLSearchParams(window.location.hash.slice(1)).get("invite") || "";
  const publicRoles = ["author", "viewer", "reviewer", "approver", "template_admin", "admin"];
  const [invitation, setInvitation] = useState(null);
  const [view, setView] = useState(invitationToken ? "signup" : "signin");
  // Views: sign in, signup, verified-account setup, verification notice, and password recovery.

  // Sign In State
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Sign Up State
  const [fullName, setFullName] = useState("");
  const [registerRole, setRegisterRole] = useState("author");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);

  const [activeEmail, setActiveEmail] = useState("");

  // UI Feedback
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    if (!invitationToken) return;
    validateInvitation(invitationToken).then((data) => {
      setInvitation(data);
      setRegisterRole(data.role);
      setRegisterEmail(data.email);
    }).catch((err) => setErrorMessage(err.message));
  }, [invitationToken]);

  function resetFeedback() {
    setErrorMessage("");
    setSuccessMessage("");
  }

  function switchView(newView) {
    resetFeedback();
    setView(newView);
  }

  // -------------------------------------------------------------
  // 1. Sign In Handlers
  // -------------------------------------------------------------
  async function handleLoginSubmit(e) {
    e.preventDefault();
    resetFeedback();

    if (!loginEmail.trim() || !loginPassword.trim()) {
      setErrorMessage("Please enter both email address and password.");
      return;
    }

    setLoading(true);
    try {
      const data = await loginUser(loginEmail.trim(), loginPassword);
      if (data && data.access_token && data.user) {
        // Successful Firebase authentication is complete; the backend returned DB-authorized role data.
        localStorage.setItem("acm_doc_user", JSON.stringify(data.user));
        if (onLoginSuccess) onLoginSuccess(data.user);
      } else {
        setErrorMessage("Unexpected authentication response. Please try again.");
      }
    } catch (err) {
      setErrorMessage(err.message || "Invalid email or password. Please try again.");
      if (err.code === "auth/email-not-verified") {
        setActiveEmail(loginEmail.trim());
        setView("verify_email");
      } else if (err.code === "smartdocs/profile-not-found") {
        setActiveEmail(loginEmail.trim());
        setFullName(firebaseAuth.currentUser?.displayName || "");
        setErrorMessage("");
        setView("profile_setup");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleCompleteExistingAccount(e) {
    e.preventDefault();
    resetFeedback();
    if (!fullName.trim()) {
      setErrorMessage("Enter your full name to continue.");
      return;
    }
    setLoading(true);
    try {
      const data = await completeVerifiedAccountSetup(fullName);
      localStorage.setItem("acm_doc_user", JSON.stringify(data.user));
      if (onLoginSuccess) onLoginSuccess(data.user);
    } catch (err) {
      const msg = typeof err?.message === "string" ? err.message : JSON.stringify(err?.message || err);
      setErrorMessage(msg || "Could not complete your SmartDocs profile.");
    } finally {
      setLoading(false);
    }
  }

  // -------------------------------------------------------------
  // 3. Sign Up Handlers
  // -------------------------------------------------------------
  async function handleRegisterSubmit(e) {
    e.preventDefault();
    resetFeedback();

    if (!fullName.trim() || !registerEmail.trim() || !registerPassword || !confirmPassword) {
      setErrorMessage("All registration fields are required.");
      return;
    }

    if (registerPassword !== confirmPassword) {
      setErrorMessage("Password and Confirm Password do not match.");
      return;
    }

    if (!isApprovedInstitutionalEmail(registerEmail)) {
      setErrorMessage("Use your SVNIT institutional email address.");
      return;
    }

    if (registerPassword.length < 8) {
      setErrorMessage("Password must be at least 8 characters long.");
      return;
    }

    if (!/\d/.test(registerPassword) || !/[a-zA-Z]/.test(registerPassword)) {
      setErrorMessage("Password must contain both letters and at least one numeric digit.");
      return;
    }

    setLoading(true);
    try {
      const data = await registerUser({
        role: registerRole,
        full_name: fullName.trim(),
        email: registerEmail.trim(),
        password: registerPassword,
        confirm_password: confirmPassword,
        invitation_token: invitationToken || undefined,
      });

      if (data && data.success) {
        setActiveEmail(registerEmail.trim());
        if (data.role_request_submitted) {
          setSuccessMessage(
            `Account registered! An access request for '${registerRole.replace("_", " ").toUpperCase()}' has been sent to the System Administrator for approval in User Management. Please open the verification link sent to your inbox.`
          );
        } else {
          setSuccessMessage("Verification link sent. Check your inbox.");
        }
        setView("verify_email");
      } else {
        setErrorMessage("We couldn't start registration. Please try again.");
      }
    } catch (err) {
      if (err.code === "auth/email-already-in-use") {
        setLoginEmail(registerEmail.trim());
        setErrorMessage("This Firebase account already exists. Sign in with it to finish SmartDocs setup.");
        setView("signin");
        return;
      }
      setErrorMessage(err.message || "Registration failed. Please check your details.");
      if (firebaseAuth.currentUser && !firebaseAuth.currentUser.emailVerified) {
        setActiveEmail(registerEmail.trim());
        setView("verify_email");
      }
    } finally {
      setLoading(false);
    }
  }

  // -------------------------------------------------------------
  // Email verification link handlers
  // -------------------------------------------------------------
  async function handleVerifyEmailOtp() {
    resetFeedback();
    setLoading(true);
    try {
      if (!firebaseAuth.currentUser) throw new Error("Sign in to check your verification status.");
      await reload(firebaseAuth.currentUser);
      if (!firebaseAuth.currentUser.emailVerified) throw new Error("Open the verification link in your inbox, then try again.");
      const token = await firebaseAuth.currentUser.getIdToken(true);
      const response = await postAuthSession(fetch, apiUrl(AUTH_SESSION_PATH), {
        Authorization: `Bearer ${token}`,
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.detail || "We could not activate your SmartDocs account.");
      }
      const profile = await response.json();
      setSuccessMessage("Email verified. You can now sign in.");
      setLoginEmail(activeEmail);
      setLoginPassword("");
      setView("signin");
      await signOut(firebaseAuth);
      if (profile?.user) localStorage.setItem("acm_doc_user", JSON.stringify(profile.user));
    } catch (err) {
      setErrorMessage(err.message || "Email verification could not be confirmed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResendVerificationLink() {
    resetFeedback();
    setLoading(true);
    try {
      if (!firebaseAuth.currentUser) throw new Error("Create your account again to request a new verification link.");
      await sendEmailVerification(firebaseAuth.currentUser, { url: window.location.origin });
      setSuccessMessage("A new verification link has been sent.");
    } catch (err) {
      setErrorMessage(err.message || "We couldn't send a verification link. Try again later.");
    } finally {
      setLoading(false);
    }
  }

  // -------------------------------------------------------------
  // 5. Forgot Password & Reset Handlers
  // -------------------------------------------------------------
  async function handleForgotPasswordSubmit(e) {
    e.preventDefault();
    resetFeedback();

    if (!activeEmail.trim()) {
      setErrorMessage("Please enter your registered institutional email.");
      return;
    }

    setLoading(true);
    try {
      const data = await forgotPassword({ email: activeEmail.trim() });
      setSuccessMessage(data.message || "If an account exists, a password reset link has been sent.");
      setView("signin");
    } catch {
      setSuccessMessage("If an account exists, a password reset link has been sent.");
    } finally {
      setLoading(false);
    }
  }


  return (
    <div
      className="auth-page"
    >
      <div
        className="auth-card"
      >
        {/* Header Branding */}
        <div
          className="auth-header"
        >
          <div className="auth-brandmarks"><img src="/branding/acm_logo.png" alt="ACM Student Chapter" /><span aria-hidden="true">×</span><img src="/branding/svnit_logo.png" alt="SVNIT Surat" /></div>
          <h2
            className="auth-title"
          >
            SmartDocs SVNIT
          </h2>
          <p
            className="auth-subtitle"
          >
            ACM Student Chapter · Sardar Vallabhbhai NIT Surat
          </p>
        </div>

        {/* Global Feedback Banners */}
        <div className="auth-feedback">
          {errorMessage && (
            <div
              role="alert"
              style={{
                marginBottom: "16px",
                padding: "12px 14px",
                borderRadius: "8px",
                background: "rgba(239, 68, 68, 0.15)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                color: "#fca5a5",
                fontSize: "0.84rem",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <span>⚠️</span>
              <span style={{ flex: 1 }}>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div
              role="status"
              style={{
                marginBottom: "16px",
                padding: "12px 14px",
                borderRadius: "8px",
                background: "rgba(34, 197, 94, 0.15)",
                border: "1px solid rgba(34, 197, 94, 0.3)",
                color: "#86efac",
                fontSize: "0.84rem",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <span>✅</span>
              <span style={{ flex: 1 }}>{successMessage}</span>
            </div>
          )}
        </div>

        {/* ========================================================= */}
        {/* VIEW 1: SIGN IN (Default)                                 */}
        {/* ========================================================= */}
        {view === "signin" && (
          <form className="auth-form" onSubmit={handleLoginSubmit}>
            <div style={{ marginBottom: "18px" }}>
              <label
                htmlFor="login-email"
                style={{
                  display: "block",
                  marginBottom: "6px",
                  color: "#cbd5e1",
                  fontSize: "0.82rem",
                  fontWeight: 600,
                }}
              >
                Institutional Email Address
              </label>
              <input
                id="login-email"
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="rollnumber@dept.svnit.ac.in"
                required
                autoComplete="email"
                style={{
                  width: "100%",
                  padding: "11px 14px",
                  borderRadius: "8px",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  background: "rgba(15, 23, 42, 0.6)",
                  color: "#ffffff",
                  fontSize: "0.9rem",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div style={{ marginBottom: "12px" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: "6px",
                }}
              >
                <label
                  htmlFor="login-password"
                  style={{
                    color: "#cbd5e1",
                    fontSize: "0.82rem",
                    fontWeight: 600,
                  }}
                >
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setActiveEmail(loginEmail);
                    switchView("forgot");
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#38bdf8",
                    fontSize: "0.78rem",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  Forgot password?
                </button>
              </div>
              <div style={{ position: "relative" }}>
                <input
                  id="login-password"
                  type={showLoginPassword ? "text" : "password"}
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Enter password"
                  required
                  autoComplete="current-password"
                  style={{
                    width: "100%",
                    padding: "11px 44px 11px 14px",
                    borderRadius: "8px",
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                    background: "rgba(15, 23, 42, 0.6)",
                    color: "#ffffff",
                    fontSize: "0.9rem",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowLoginPassword(!showLoginPassword)}
                  aria-label={
                    showLoginPassword ? "Hide password" : "Show password"
                  }
                  style={{
                    position: "absolute",
                    right: "10px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "transparent",
                    border: "none",
                    color: "#94a3b8",
                    cursor: "pointer",
                    fontSize: "1rem",
                    padding: "4px",
                  }}
                >
                  {showLoginPassword ? "👁️" : "🙈"}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                marginTop: "14px",
                padding: "12px",
                borderRadius: "8px",
                border: "none",
                background: loading
                  ? "#475569"
                  : "linear-gradient(135deg, #0284c7 0%, #2563eb 100%)",
                color: "#ffffff",
                fontSize: "0.92rem",
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
                boxShadow: "0 4px 12px rgba(2, 132, 199, 0.35)",
              }}
            >
              {loading ? "Verifying Credentials..." : "Sign In to Workspace"}
            </button>

            <div
              style={{
                marginTop: "22px",
                textAlign: "center",
                fontSize: "0.84rem",
                color: "#94a3b8",
              }}
            >
              Don't have an account?{" "}
              <button
                type="button"
                onClick={() => switchView("signup")}
                style={{
                  background: "none",
                  border: "none",
                  color: "#38bdf8",
                  fontWeight: 600,
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                Sign Up
              </button>
            </div>
          </form>
        )}

        {view === "profile_setup" && (
          <form onSubmit={handleCompleteExistingAccount} className="auth-form">
            <h3 style={{ color: "#fff", margin: "0 0 10px" }}>Finish SmartDocs setup</h3>
            <p style={{ color: "#cbd5e1", lineHeight: 1.6, margin: "0 0 18px" }}>
              Your email is verified with Firebase, but this email does not have a SmartDocs profile yet. Confirm your name to create the standard Author profile for <strong>{activeEmail}</strong> and continue.
            </p>
            <label htmlFor="profile-full-name" style={{ display: "block", marginBottom: 6, color: "#cbd5e1", fontSize: "0.82rem", fontWeight: 600 }}>
              Full Name
            </label>
            <input
              id="profile-full-name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              autoComplete="name"
              required
              minLength={2}
              style={{ width: "100%", padding: "11px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(15,23,42,0.6)", color: "#fff", fontSize: "0.9rem", boxSizing: "border-box" }}
            />
            {errorMessage && <p role="alert" style={{ color: "#fca5a5", lineHeight: 1.5 }}>{errorMessage}</p>}
            <button type="submit" disabled={loading} style={{ width: "100%", marginTop: 18, padding: 12, border: 0, borderRadius: 8, color: "#fff", background: "linear-gradient(135deg,#0284c7,#2563eb)", cursor: loading ? "not-allowed" : "pointer" }}>
              {loading ? "Setting up account…" : "Complete setup and open SmartDocs"}
            </button>
            <button type="button" onClick={() => { signOut(firebaseAuth); switchView("signin"); }} disabled={loading} style={{ display: "block", margin: "14px auto 0", background: "none", border: 0, color: "#38bdf8", cursor: "pointer" }}>
              Back to sign in
            </button>
          </form>
        )}

        {/* ========================================================= */}
        {/* VIEW 2: SIGN UP                                           */}
        {/* ========================================================= */}
        {view === "signup" && (
          <form className="auth-form" onSubmit={handleRegisterSubmit}>
            <div style={{ marginBottom: "16px" }}>
              <label
                htmlFor="reg-role"
                style={{
                  display: "block",
                  marginBottom: "6px",
                  color: "#cbd5e1",
                  fontSize: "0.82rem",
                  fontWeight: 600,
                }}
              >
                Role
              </label>
              <select
                id="reg-role"
                value={registerRole}
                onChange={(e) => setRegisterRole(e.target.value)}
                required
                disabled={Boolean(invitationToken)}
                style={{
                  width: "100%",
                  padding: "11px 14px",
                  borderRadius: "8px",
                  border: "1px solid rgba(255,255,255,.15)",
                  background: "#0f172a",
                  color: "#fff",
                  fontSize: ".9rem",
                }}
              >
                <option value="author">Author (Create & generate documents)</option>
                <option value="viewer">Viewer (Read-only access)</option>
                <option value="reviewer">Reviewer (Review submitted documents)</option>
                <option value="approver">Approver (Institutional approval authority)</option>
                <option value="template_admin">Template Admin (Manage document templates)</option>
                <option value="admin">System Admin (Full system administration)</option>
              </select>
              <small style={{ display: "block", marginTop: 6, color: "#94a3b8", fontSize: "0.8rem", lineHeight: 1.4 }}>
                {invitationToken ? (
                  invitation
                    ? `Admin Invitation: ${invitation.role.replace("_", " ")} · ${invitation.email}`
                    : "Validating administrator invitation…"
                ) : registerRole === "author" || registerRole === "viewer" ? (
                  "✓ Instant access with institutional SVNIT email verification."
                ) : registerRole === "admin" ? (
                  "🛡️ System Admin (Pre-authorized admin accounts active immediately; other accounts route access requests for verification)."
                ) : (
                  "⏳ Sign up with your college ID; an access request for this role will be routed to the System Admin for approval in User Management."
                )}
              </small>

            </div>
            <div style={{ marginBottom: "16px" }}>
              <label
                htmlFor="reg-name"
                style={{
                  display: "block",
                  marginBottom: "6px",
                  color: "#cbd5e1",
                  fontSize: "0.82rem",
                  fontWeight: 600,
                }}
              >
                Full Name
              </label>
              <input
                id="reg-name"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g., Darshil Prajapati"
                required
                style={{
                  width: "100%",
                  padding: "11px 14px",
                  borderRadius: "8px",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  background: "rgba(15, 23, 42, 0.6)",
                  color: "#ffffff",
                  fontSize: "0.9rem",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label
                htmlFor="reg-email"
                style={{
                  display: "block",
                  marginBottom: "6px",
                  color: "#cbd5e1",
                  fontSize: "0.82rem",
                  fontWeight: 600,
                }}
              >
                Institutional Email Address
              </label>
              <input
                id="reg-email"
                type="email"
                value={registerEmail}
                onChange={(e) => setRegisterEmail(e.target.value)}
                readOnly={Boolean(invitationToken)}
                placeholder="e.g., rollnumber@dept.svnit.ac.in"
                required
                style={{
                  width: "100%",
                  padding: "11px 14px",
                  borderRadius: "8px",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  background: "rgba(15, 23, 42, 0.6)",
                  color: "#ffffff",
                  fontSize: "0.9rem",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label
                htmlFor="reg-password"
                style={{
                  display: "block",
                  marginBottom: "6px",
                  color: "#cbd5e1",
                  fontSize: "0.82rem",
                  fontWeight: 600,
                }}
              >
                Password (min 8 chars, letter + digit)
              </label>
              <div style={{ position: "relative" }}>
                <input
                  id="reg-password"
                  type={showRegisterPassword ? "text" : "password"}
                  value={registerPassword}
                  onChange={(e) => setRegisterPassword(e.target.value)}
                  placeholder="Create strong password"
                  required
                  style={{
                    width: "100%",
                    padding: "11px 44px 11px 14px",
                    borderRadius: "8px",
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                    background: "rgba(15, 23, 42, 0.6)",
                    color: "#ffffff",
                    fontSize: "0.9rem",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowRegisterPassword(!showRegisterPassword)}
                  style={{
                    position: "absolute",
                    right: "10px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "transparent",
                    border: "none",
                    color: "#94a3b8",
                    cursor: "pointer",
                    padding: "4px",
                  }}
                >
                  {showRegisterPassword ? "👁️" : "🙈"}
                </button>
              </div>
            </div>

            <div style={{ marginBottom: "18px" }}>
              <label
                htmlFor="reg-confirm"
                style={{
                  display: "block",
                  marginBottom: "6px",
                  color: "#cbd5e1",
                  fontSize: "0.82rem",
                  fontWeight: 600,
                }}
              >
                Confirm Password
              </label>
              <input
                id="reg-confirm"
                type={showRegisterPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter password"
                required
                style={{
                  width: "100%",
                  padding: "11px 14px",
                  borderRadius: "8px",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  background: "rgba(15, 23, 42, 0.6)",
                  color: "#ffffff",
                  fontSize: "0.9rem",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: "8px",
                border: "none",
                background: loading
                  ? "#475569"
                  : "linear-gradient(135deg, #0284c7 0%, #2563eb 100%)",
                color: "#ffffff",
                fontSize: "0.92rem",
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
                boxShadow: "0 4px 12px rgba(2, 132, 199, 0.35)",
              }}
            >
              {loading
                ? "Creating Account..."
                : "Register Institutional Account"}
            </button>

            <div
              style={{
                marginTop: "20px",
                textAlign: "center",
                fontSize: "0.84rem",
                color: "#94a3b8",
              }}
            >
              Already registered?{" "}
              <button
                type="button"
                onClick={() => switchView("signin")}
                style={{
                  background: "none",
                  border: "none",
                  color: "#38bdf8",
                  fontWeight: 600,
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                Sign In
              </button>
            </div>
          </form>
        )}

        {/* ========================================================= */}
        {/* VIEW 3: EMAIL VERIFICATION LINK                           */}
        {/* ========================================================= */}
        {view === "verify_email" && (
          <div className="auth-message-view">
            <div style={{ fontSize: "2rem", marginBottom: "8px" }}>📧</div>
            <h3 style={{ color: "#fff", margin: "0 0 10px" }}>
              Check your inbox
            </h3>
            <p style={{ color: "#cbd5e1", lineHeight: 1.6 }}>
              We sent a verification link to <strong>{activeEmail}</strong>.
              Open that link, then return here to sign in.
            </p>
            {errorMessage && (
              <p role="alert" style={{ color: "#fca5a5" }}>
                {errorMessage}
              </p>
            )}
            <button
              type="button"
              onClick={handleVerifyEmailOtp}
              disabled={loading}
              style={{
                width: "100%",
                padding: 12,
                border: 0,
                borderRadius: 8,
                color: "white",
                background: "linear-gradient(135deg,#0284c7,#2563eb)",
                cursor: "pointer",
              }}
            >
              {loading ? "Checking…" : "I've verified my email"}
            </button>
            <button
              type="button"
              onClick={handleResendVerificationLink}
              disabled={loading}
              style={{
                marginTop: 16,
                background: "none",
                border: 0,
                color: "#38bdf8",
                cursor: "pointer",
              }}
            >
              Resend verification link
            </button>
            <div>
              <button
                type="button"
                onClick={() => switchView("signin")}
                style={{
                  marginTop: 14,
                  background: "none",
                  border: 0,
                  color: "#94a3b8",
                  cursor: "pointer",
                }}
              >
                Back to Sign In
              </button>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* VIEW 5: FORGOT PASSWORD                                   */}
        {/* ========================================================= */}
        {view === "forgot" && (
          <form className="auth-form" onSubmit={handleForgotPasswordSubmit}>
            <div style={{ textAlign: "center", marginBottom: "18px" }}>
              <div style={{ fontSize: "2rem", marginBottom: "8px" }}>🔑</div>
              <h3
                style={{
                  margin: "0 0 6px 0",
                  color: "#ffffff",
                  fontSize: "1.15rem",
                }}
              >
                Account Recovery
              </h3>
              <p style={{ margin: 0, color: "#94a3b8", fontSize: "0.82rem" }}>
                Enter your institutional email and we’ll send a secure password
                reset link.
              </p>
            </div>

            <div style={{ marginBottom: "20px" }}>
              <label
                htmlFor="forgot-email"
                style={{
                  display: "block",
                  marginBottom: "6px",
                  color: "#cbd5e1",
                  fontSize: "0.82rem",
                  fontWeight: 600,
                }}
              >
                Institutional Email Address
              </label>
              <input
                id="forgot-email"
                type="email"
                value={activeEmail}
                onChange={(e) => setActiveEmail(e.target.value)}
                placeholder="e.g., rollnumber@dept.svnit.ac.in"
                required
                style={{
                  width: "100%",
                  padding: "11px 14px",
                  borderRadius: "8px",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  background: "rgba(15, 23, 42, 0.6)",
                  color: "#ffffff",
                  fontSize: "0.9rem",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: "8px",
                border: "none",
                background: loading
                  ? "#475569"
                  : "linear-gradient(135deg, #0284c7 0%, #2563eb 100%)",
                color: "#ffffff",
                fontSize: "0.92rem",
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
                boxShadow: "0 4px 12px rgba(2, 132, 199, 0.35)",
              }}
            >
              {loading ? "Sending Link..." : "Send Password Reset Link"}
            </button>

            <div style={{ marginTop: "18px", textAlign: "center" }}>
              <button
                type="button"
                onClick={() => switchView("signin")}
                style={{
                  background: "none",
                  border: "none",
                  color: "#38bdf8",
                  fontSize: "0.82rem",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                Back to Sign In
              </button>
            </div>
          </form>
        )}

        {/* Footer Note */}
        <div className="auth-footer">
          <p
            style={{
              margin: 0,
              fontSize: "0.72rem",
              color: "#64748b",
            }}
          >
            🔒 Secure sign-in · ACM SVNIT
          </p>
        </div>
      </div>
    </div>
  );
}
