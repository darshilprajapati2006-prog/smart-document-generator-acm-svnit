import React, { useState, useEffect } from "react";
import {
  loginUser,
  verifyLoginOtp,
  resendLoginOtp,
  registerUser,
  verifyEmailOtp,
  resendEmailOtp,
  forgotPassword,
  resetPassword,
  setAuthToken,
} from "../services/documentApi";

export default function LoginPage({ onLoginSuccess }) {
  // Views: "signin" | "signup" | "verify_email" | "verify_login" | "forgot" | "reset"
  const [view, setView] = useState("signin");

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

  // OTP Verification State
  const [otpCode, setOtpCode] = useState("");
  const [activeChallengeId, setActiveChallengeId] = useState("");
  const [activeEmail, setActiveEmail] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);

  // Password Reset State
  const [resetOtp, setResetOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [showResetPassword, setShowResetPassword] = useState(false);

  // UI Feedback
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // Cooldown countdown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  function resetFeedback() {
    setErrorMessage("");
    setSuccessMessage("");
  }

  function switchView(newView) {
    resetFeedback();
    setOtpCode("");
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
      if (data && data.requires_otp) {
        // Step 1 passed, move to Step 2 (Login 2FA OTP)
        setActiveChallengeId(data.challenge_id);
        setActiveEmail(loginEmail.trim());
        setResendCooldown(data.cooldown_seconds || 60);
        setSuccessMessage(data.message || "Login verification code sent to your registered email.");
        setView("verify_login");
      } else if (data && data.access_token && data.user) {
        // Direct password login (Requirement 17: no login OTP required)
        setAuthToken(data.access_token);
        localStorage.setItem("acm_doc_user", JSON.stringify(data.user));
        if (onLoginSuccess) onLoginSuccess(data.user);
      } else {
        setErrorMessage("Unexpected authentication response. Please try again.");
      }
    } catch (err) {
      setErrorMessage(err.message || "Invalid email or password. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // -------------------------------------------------------------
  // 2. Login 2FA OTP Verification Handlers
  // -------------------------------------------------------------
  async function handleVerifyLoginOtp(e) {
    e.preventDefault();
    resetFeedback();

    if (!otpCode.trim() || otpCode.trim().length !== 6) {
      setErrorMessage("Please enter the complete 6-digit verification code.");
      return;
    }

    setLoading(true);
    try {
      const data = await verifyLoginOtp({
        challenge_id: activeChallengeId,
        otp: otpCode.trim(),
      });
      if (data && data.user) {
        if (data.access_token) setAuthToken(data.access_token);
        localStorage.setItem("acm_doc_user", JSON.stringify(data.user));
        if (onLoginSuccess) onLoginSuccess(data.user);
      } else {
        setErrorMessage("Verification failed. Please check your code.");
      }
    } catch (err) {
      setErrorMessage(err.message || "Invalid or expired verification code.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResendLoginOtp() {
    if (resendCooldown > 0) return;
    resetFeedback();
    setLoading(true);
    try {
      const data = await resendLoginOtp({ challenge_id: activeChallengeId });
      if (data.challenge_id) setActiveChallengeId(data.challenge_id);
      setResendCooldown(data.cooldown_seconds || 60);
      setSuccessMessage(data.message || "A new verification code has been dispatched.");
    } catch (err) {
      setErrorMessage(err.message || "Failed to resend code.");
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
      });

      if (data && data.requires_otp) {
        // Production: OTP verification required
        setActiveEmail(registerEmail.trim());
        setResendCooldown(data.cooldown_seconds || 60);
        setSuccessMessage(data.message || "Verification code sent to your email.");
        setView("verify_email");
      } else {
        setErrorMessage("We couldn't start registration. Please try again.");
      }
    } catch (err) {
      setErrorMessage(err.message || "Registration failed. Please check your details.");
    } finally {
      setLoading(false);
    }
  }

  // -------------------------------------------------------------
  // 4. Sign Up Email OTP Verification Handlers
  // -------------------------------------------------------------
  async function handleVerifyEmailOtp(e) {
    e.preventDefault();
    resetFeedback();

    if (!otpCode.trim() || otpCode.trim().length !== 6) {
      setErrorMessage("Please enter the complete 6-digit verification code.");
      return;
    }

    setLoading(true);
    try {
      const data = await verifyEmailOtp({
        email: activeEmail,
        otp: otpCode.trim(),
      });
      setSuccessMessage(data.message || "Email verified! You can now sign in.");
      setLoginEmail(activeEmail);
      setLoginPassword("");
      setView("signin");
    } catch (err) {
      setErrorMessage(err.message || "Verification failed. Please check your code.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResendEmailOtp() {
    if (resendCooldown > 0) return;
    resetFeedback();
    setLoading(true);
    try {
      const data = await resendEmailOtp({ email: activeEmail });
      setResendCooldown(data.cooldown_seconds || 60);
      setSuccessMessage(data.message || "A new verification code has been dispatched.");
    } catch (err) {
      setErrorMessage(err.message || "Failed to resend code.");
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
      setResendCooldown(data.cooldown_seconds || 60);
      setSuccessMessage(data.message || "If registered, a recovery code has been sent.");
      setView("reset");
    } catch (err) {
      setErrorMessage(err.message || "Failed to process recovery request.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPasswordSubmit(e) {
    e.preventDefault();
    resetFeedback();

    if (!resetOtp.trim() || resetOtp.trim().length !== 6) {
      setErrorMessage("Please enter the 6-digit verification code.");
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setErrorMessage("New Password and Confirm Password do not match.");
      return;
    }

    if (newPassword.length < 8) {
      setErrorMessage("Password must be at least 8 characters long.");
      return;
    }

    if (!/\d/.test(newPassword) || !/[a-zA-Z]/.test(newPassword)) {
      setErrorMessage("Password must contain both letters and at least one numeric digit.");
      return;
    }

    setLoading(true);
    try {
      const data = await resetPassword({
        email: activeEmail.trim(),
        otp: resetOtp.trim(),
        new_password: newPassword,
        confirm_password: confirmNewPassword,
      });
      setSuccessMessage(data.message || "Password updated successfully. Please sign in.");
      setLoginEmail(activeEmail.trim());
      setLoginPassword("");
      setView("signin");
    } catch (err) {
      setErrorMessage(err.message || "Password reset failed. Invalid or expired code.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)",
        padding: "20px",
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "460px",
          background: "rgba(30, 41, 59, 0.85)",
          backdropFilter: "blur(16px)",
          borderRadius: "16px",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
          overflow: "hidden",
        }}
      >
        {/* Header Branding */}
        <div
          style={{
            padding: "30px 32px 22px",
            textAlign: "center",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "52px",
              height: "52px",
              borderRadius: "14px",
              background: "linear-gradient(135deg, #0284c7 0%, #2563eb 100%)",
              color: "#ffffff",
              fontSize: "22px",
              fontWeight: 800,
              marginBottom: "14px",
              boxShadow: "0 8px 16px rgba(2, 132, 199, 0.35)",
            }}
          >
            S
          </div>
          <h2
            style={{
              margin: "0 0 6px 0",
              color: "#ffffff",
              fontSize: "1.45rem",
              fontWeight: 700,
              letterSpacing: "-0.02em",
            }}
          >
            SmartDocs SVNIT
          </h2>
          <p
            style={{
              margin: 0,
              color: "#94a3b8",
              fontSize: "0.85rem",
            }}
          >
            ACM Student Chapter · Sardar Vallabhbhai NIT Surat
          </p>
        </div>

        {/* Global Feedback Banners */}
        <div style={{ padding: "20px 32px 0" }}>
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
          <form onSubmit={handleLoginSubmit} style={{ padding: "12px 32px 28px" }}>
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
                placeholder="name@svnit.acm.org"
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
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
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
                  aria-label={showLoginPassword ? "Hide password" : "Show password"}
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

        {/* ========================================================= */}
        {/* VIEW 2: SIGN UP                                           */}
        {/* ========================================================= */}
        {view === "signup" && (
          <form onSubmit={handleRegisterSubmit} style={{ padding: "12px 32px 28px" }}>
            <div style={{ marginBottom: "16px" }}>
              <label htmlFor="reg-role" style={{ display: "block", marginBottom: "6px", color: "#cbd5e1", fontSize: "0.82rem", fontWeight: 600 }}>Role</label>
              <select id="reg-role" value={registerRole} onChange={(e) => setRegisterRole(e.target.value)} required style={{ width: "100%", padding: "11px 14px", borderRadius: "8px", border: "1px solid rgba(255,255,255,.15)", background: "#0f172a", color: "#fff", fontSize: ".9rem" }}>
                <option value="author">Author</option>
                <option value="reviewer" disabled>Reviewer — administrator approval required</option>
                <option value="approver" disabled>Approver — administrator approval required</option>
                <option value="template_admin" disabled>Template Admin — administrator approval required</option>
                <option value="admin" disabled>System Admin — administrator approval required</option>
                <option value="viewer" disabled>Viewer — administrator approval required</option>
              </select>
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
                placeholder="name@svnit.acm.org"
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
              {loading ? "Creating Account..." : "Register Institutional Account"}
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
        {/* VIEW 3: VERIFY EMAIL OTP (After Sign Up)                  */}
        {/* ========================================================= */}
        {view === "verify_email" && (
          <form onSubmit={handleVerifyEmailOtp} style={{ padding: "12px 32px 28px" }}>
            <div style={{ textAlign: "center", marginBottom: "20px" }}>
              <div style={{ fontSize: "2rem", marginBottom: "8px" }}>📧</div>
              <h3 style={{ margin: "0 0 6px 0", color: "#ffffff", fontSize: "1.15rem" }}>
                Verify Institutional Email
              </h3>
              <p style={{ margin: 0, color: "#94a3b8", fontSize: "0.82rem" }}>
                Enter the 6-digit verification code dispatched to:
                <br />
                <strong style={{ color: "#38bdf8" }}>{activeEmail}</strong>
              </p>
            </div>

            <div style={{ marginBottom: "20px" }}>
              <input
                id="otp-email-input"
                type="text"
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                placeholder="· · · · · ·"
                required
                autoFocus
                style={{
                  width: "100%",
                  textAlign: "center",
                  letterSpacing: "12px",
                  fontSize: "1.6rem",
                  fontWeight: 700,
                  padding: "12px 14px",
                  borderRadius: "8px",
                  border: "2px solid #0284c7",
                  background: "rgba(15, 23, 42, 0.7)",
                  color: "#38bdf8",
                  outline: "none",
                  boxSizing: "border-box",
                  fontFamily: "monospace",
                }}
              />
            </div>

            <button
              type="submit"
              disabled={loading || otpCode.length !== 6}
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: "8px",
                border: "none",
                background: loading || otpCode.length !== 6
                  ? "#475569"
                  : "linear-gradient(135deg, #0284c7 0%, #2563eb 100%)",
                color: "#ffffff",
                fontSize: "0.92rem",
                fontWeight: 600,
                cursor: loading || otpCode.length !== 6 ? "not-allowed" : "pointer",
                boxShadow: "0 4px 12px rgba(2, 132, 199, 0.35)",
              }}
            >
              {loading ? "Verifying..." : "Verify & Activate Account"}
            </button>

            <div
              style={{
                marginTop: "18px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontSize: "0.82rem",
              }}
            >
              <button
                type="button"
                onClick={handleResendEmailOtp}
                disabled={resendCooldown > 0 || loading}
                style={{
                  background: "none",
                  border: "none",
                  color: resendCooldown > 0 ? "#64748b" : "#38bdf8",
                  cursor: resendCooldown > 0 ? "not-allowed" : "pointer",
                  padding: 0,
                }}
              >
                {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : "Resend code"}
              </button>

              <button
                type="button"
                onClick={() => switchView("signin")}
                style={{
                  background: "none",
                  border: "none",
                  color: "#94a3b8",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                Back to Sign In
              </button>
            </div>
          </form>
        )}

        {/* ========================================================= */}
        {/* VIEW 4: LOGIN 2FA OTP VERIFICATION                        */}
        {/* ========================================================= */}
        {view === "verify_login" && (
          <form onSubmit={handleVerifyLoginOtp} style={{ padding: "12px 32px 28px" }}>
            <div style={{ textAlign: "center", marginBottom: "20px" }}>
              <div style={{ fontSize: "2rem", marginBottom: "8px" }}>🔐</div>
              <h3 style={{ margin: "0 0 6px 0", color: "#ffffff", fontSize: "1.15rem" }}>
                Two-Factor Login Verification
              </h3>
              <p style={{ margin: 0, color: "#94a3b8", fontSize: "0.82rem" }}>
                Enter the one-time authentication code sent to:
                <br />
                <strong style={{ color: "#38bdf8" }}>{activeEmail}</strong>
              </p>
            </div>

            <div style={{ marginBottom: "20px" }}>
              <input
                id="otp-login-input"
                type="text"
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                placeholder="· · · · · ·"
                required
                autoFocus
                style={{
                  width: "100%",
                  textAlign: "center",
                  letterSpacing: "12px",
                  fontSize: "1.6rem",
                  fontWeight: 700,
                  padding: "12px 14px",
                  borderRadius: "8px",
                  border: "2px solid #2563eb",
                  background: "rgba(15, 23, 42, 0.7)",
                  color: "#60a5fa",
                  outline: "none",
                  boxSizing: "border-box",
                  fontFamily: "monospace",
                }}
              />
            </div>

            <button
              type="submit"
              disabled={loading || otpCode.length !== 6}
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: "8px",
                border: "none",
                background: loading || otpCode.length !== 6
                  ? "#475569"
                  : "linear-gradient(135deg, #0284c7 0%, #2563eb 100%)",
                color: "#ffffff",
                fontSize: "0.92rem",
                fontWeight: 600,
                cursor: loading || otpCode.length !== 6 ? "not-allowed" : "pointer",
                boxShadow: "0 4px 12px rgba(2, 132, 199, 0.35)",
              }}
            >
              {loading ? "Authenticating Session..." : "Confirm & Enter Workspace"}
            </button>

            <div
              style={{
                marginTop: "18px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontSize: "0.82rem",
              }}
            >
              <button
                type="button"
                onClick={handleResendLoginOtp}
                disabled={resendCooldown > 0 || loading}
                style={{
                  background: "none",
                  border: "none",
                  color: resendCooldown > 0 ? "#64748b" : "#38bdf8",
                  cursor: resendCooldown > 0 ? "not-allowed" : "pointer",
                  padding: 0,
                }}
              >
                {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : "Resend code"}
              </button>

              <button
                type="button"
                onClick={() => switchView("signin")}
                style={{
                  background: "none",
                  border: "none",
                  color: "#94a3b8",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                Back to Sign In
              </button>
            </div>
          </form>
        )}

        {/* ========================================================= */}
        {/* VIEW 5: FORGOT PASSWORD                                   */}
        {/* ========================================================= */}
        {view === "forgot" && (
          <form onSubmit={handleForgotPasswordSubmit} style={{ padding: "12px 32px 28px" }}>
            <div style={{ textAlign: "center", marginBottom: "18px" }}>
              <div style={{ fontSize: "2rem", marginBottom: "8px" }}>🔑</div>
              <h3 style={{ margin: "0 0 6px 0", color: "#ffffff", fontSize: "1.15rem" }}>
                Account Recovery
              </h3>
              <p style={{ margin: 0, color: "#94a3b8", fontSize: "0.82rem" }}>
                Enter your registered institutional email to receive a password reset code.
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
                placeholder="name@svnit.acm.org"
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
              {loading ? "Sending Code..." : "Send Password Recovery Code"}
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

        {/* ========================================================= */}
        {/* VIEW 6: RESET PASSWORD                                    */}
        {/* ========================================================= */}
        {view === "reset" && (
          <form onSubmit={handleResetPasswordSubmit} style={{ padding: "12px 32px 28px" }}>
            <div style={{ textAlign: "center", marginBottom: "16px" }}>
              <div style={{ fontSize: "2rem", marginBottom: "8px" }}>🛡️</div>
              <h3 style={{ margin: "0 0 6px 0", color: "#ffffff", fontSize: "1.15rem" }}>
                Set New Password
              </h3>
              <p style={{ margin: 0, color: "#94a3b8", fontSize: "0.82rem" }}>
                Enter the recovery code sent to <strong style={{ color: "#38bdf8" }}>{activeEmail}</strong>
              </p>
            </div>

            <div style={{ marginBottom: "14px" }}>
              <label
                htmlFor="reset-otp"
                style={{
                  display: "block",
                  marginBottom: "6px",
                  color: "#cbd5e1",
                  fontSize: "0.82rem",
                  fontWeight: 600,
                }}
              >
                6-Digit Recovery Code
              </label>
              <input
                id="reset-otp"
                type="text"
                maxLength={6}
                value={resetOtp}
                onChange={(e) => setResetOtp(e.target.value.replace(/\D/g, ""))}
                placeholder="· · · · · ·"
                required
                style={{
                  width: "100%",
                  textAlign: "center",
                  letterSpacing: "8px",
                  fontSize: "1.3rem",
                  fontWeight: 700,
                  padding: "10px 14px",
                  borderRadius: "8px",
                  border: "1px solid rgba(255, 255, 255, 0.2)",
                  background: "rgba(15, 23, 42, 0.7)",
                  color: "#38bdf8",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div style={{ marginBottom: "14px" }}>
              <label
                htmlFor="new-pwd"
                style={{
                  display: "block",
                  marginBottom: "6px",
                  color: "#cbd5e1",
                  fontSize: "0.82rem",
                  fontWeight: 600,
                }}
              >
                New Password (min 8 chars, letter + digit)
              </label>
              <div style={{ position: "relative" }}>
                <input
                  id="new-pwd"
                  type={showResetPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  required
                  style={{
                    width: "100%",
                    padding: "10px 44px 10px 14px",
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
                  onClick={() => setShowResetPassword(!showResetPassword)}
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
                  {showResetPassword ? "👁️" : "🙈"}
                </button>
              </div>
            </div>

            <div style={{ marginBottom: "18px" }}>
              <label
                htmlFor="confirm-new-pwd"
                style={{
                  display: "block",
                  marginBottom: "6px",
                  color: "#cbd5e1",
                  fontSize: "0.82rem",
                  fontWeight: 600,
                }}
              >
                Confirm New Password
              </label>
              <input
                id="confirm-new-pwd"
                type={showResetPassword ? "text" : "password"}
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                placeholder="Confirm new password"
                required
                style={{
                  width: "100%",
                  padding: "10px 14px",
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
              {loading ? "Resetting Password..." : "Update Password & Sign In"}
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
        <div
          style={{
            padding: "16px 32px 20px",
            background: "rgba(15, 23, 42, 0.4)",
            borderTop: "1px solid rgba(255, 255, 255, 0.08)",
            textAlign: "center",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: "0.72rem",
              color: "#64748b",
            }}
          >
            🔒 PBKDF2-HMAC-SHA256 Encryption · Two-Factor OTP Verification · ACM SVNIT
          </p>
        </div>
      </div>
    </div>
  );
}
