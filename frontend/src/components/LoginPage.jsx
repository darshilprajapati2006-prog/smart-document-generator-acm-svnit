import React, { useState } from "react";
import { loginUser } from "../services/documentApi";

// Pre-seeded accounts for the 6 roles
const ROLE_ACCOUNTS = [
  { role: "author", label: "Author", email: "author@svnit.acm.org", badge: "#0284c7" },
  { role: "reviewer", label: "Reviewer", email: "reviewer@svnit.acm.org", badge: "#d97706" },
  { role: "approver", label: "Approver", email: "approver@svnit.acm.org", badge: "#16a34a" },
  { role: "template_admin", label: "Template Admin", email: "tmpladmin@svnit.acm.org", badge: "#7c3aed" },
  { role: "admin", label: "System Admin", email: "admin@svnit.acm.org", badge: "#dc2626" },
  { role: "viewer", label: "Viewer", email: "viewer@svnit.acm.org", badge: "#64748b" },
];

export default function LoginPage({ onLoginSuccess }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorMessage("");

    if (!email.trim() || !password.trim()) {
      setErrorMessage("Please enter both email and password.");
      return;
    }

    setLoading(true);
    try {
      const data = await loginUser(email.trim(), password);
      if (data && data.success && data.user) {
        localStorage.setItem("acm_doc_user", JSON.stringify(data.user));
        if (onLoginSuccess) {
          onLoginSuccess(data.user);
        }
      } else {
        setErrorMessage("Login was not successful. Please verify your credentials.");
      }
    } catch (err) {
      setErrorMessage(err.message || "Invalid email or password. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleQuickFill(acc) {
    setEmail(acc.email);
    setPassword("Author@1234");
    if (acc.role === "admin") setPassword("Admin@1234");
    if (acc.role === "reviewer") setPassword("Reviewer@1234");
    if (acc.role === "approver") setPassword("Approver@1234");
    if (acc.role === "template_admin") setPassword("TmplAdmin@1234");
    if (acc.role === "viewer") setPassword("Viewer@1234");
    setErrorMessage("");
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
            padding: "32px 32px 24px",
            textAlign: "center",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "56px",
              height: "56px",
              borderRadius: "14px",
              background: "linear-gradient(135deg, #0284c7 0%, #2563eb 100%)",
              color: "#ffffff",
              fontSize: "24px",
              fontWeight: 800,
              marginBottom: "16px",
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

        {/* Login Form */}
        <form onSubmit={handleSubmit} style={{ padding: "28px 32px 24px" }}>
          {errorMessage && (
            <div
              role="alert"
              style={{
                marginBottom: "20px",
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
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Email Field */}
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
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g., author@svnit.acm.org"
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
                transition: "border-color 0.2s",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Password Field */}
          <div style={{ marginBottom: "22px" }}>
            <label
              htmlFor="login-password"
              style={{
                display: "block",
                marginBottom: "6px",
                color: "#cbd5e1",
                fontSize: "0.82rem",
                fontWeight: 600,
              }}
            >
              Account Password
            </label>
            <div style={{ position: "relative" }}>
              <input
                id="login-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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
                  transition: "border-color 0.2s",
                  boxSizing: "border-box",
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
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
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {showPassword ? "👁️" : "🙈"}
              </button>
            </div>
          </div>

          {/* Submit Button */}
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
              transition: "transform 0.1s, opacity 0.2s",
            }}
          >
            {loading ? "Authenticating..." : "Sign In to Workspace"}
          </button>
        </form>

        {/* Quick Role Fill Pills */}
        <div
          style={{
            padding: "20px 32px 28px",
            background: "rgba(15, 23, 42, 0.4)",
            borderTop: "1px solid rgba(255, 255, 255, 0.08)",
          }}
        >
          <div
            style={{
              fontSize: "0.76rem",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "#94a3b8",
              marginBottom: "10px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>Demo Role Accounts (6 Roles)</span>
            <span style={{ fontSize: "0.7rem", color: "#64748b" }}>Click to fill</span>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: "8px",
            }}
          >
            {ROLE_ACCOUNTS.map((acc) => (
              <button
                key={acc.role}
                type="button"
                onClick={() => handleQuickFill(acc)}
                title={`Login as ${acc.label} (${acc.email})`}
                style={{
                  padding: "8px 6px",
                  borderRadius: "6px",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  background: "rgba(30, 41, 59, 0.6)",
                  color: "#e2e8f0",
                  fontSize: "0.75rem",
                  fontWeight: 500,
                  cursor: "pointer",
                  textAlign: "center",
                  transition: "background 0.15s, border-color 0.15s",
                }}
              >
                <div style={{ color: acc.badge, fontWeight: 700, fontSize: "0.7rem" }}>●</div>
                {acc.label}
              </button>
            ))}
          </div>

          <p
            style={{
              margin: "16px 0 0 0",
              textAlign: "center",
              fontSize: "0.72rem",
              color: "#64748b",
            }}
          >
            🔒 PBKDF2-HMAC-SHA256 Encryption · Role-Based Access Control · ACM SVNIT
          </p>
        </div>
      </div>
    </div>
  );
}
