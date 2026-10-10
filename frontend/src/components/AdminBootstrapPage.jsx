import { useState } from "react";
import { bootstrapSystemAdmin } from "../services/documentApi";

const panelStyle = {
  width: "min(560px, calc(100vw - 32px))",
  padding: 28,
  border: "1px solid rgba(148,163,184,.28)",
  borderRadius: 16,
  background: "#1e293b",
  color: "#f8fafc",
  boxShadow: "0 24px 70px rgba(2,6,23,.4)",
};

export default function AdminBootstrapPage({ user, onSuccess, onContinue }) {
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  async function handleBootstrap() {
    setError("");
    setLoading(true);
    try {
      const response = await bootstrapSystemAdmin();
      setResult(response.user);
      onSuccess(response.user);
    } catch (requestError) {
      setError(requestError.message || "System Admin bootstrap failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16, background: "radial-gradient(circle at top, #1e1b4b, #0f172a 70%)", fontFamily: "Inter, system-ui, sans-serif" }}>
      <section style={panelStyle}>
        <div style={{ color: "#7dd3fc", fontWeight: 700, letterSpacing: ".08em", fontSize: 12 }}>ONE-TIME SECURITY SETUP</div>
        <h1 style={{ fontSize: 25, margin: "10px 0" }}>Initial System Admin</h1>

        {result ? (
          <>
            <p role="status" style={{ color: "#86efac", lineHeight: 1.6 }}>
              The authenticated <code>/api/auth/me</code> profile confirms <strong>{result.email}</strong> as <strong>System Admin</strong>.
            </p>
            <p style={{ color: "#cbd5e1", lineHeight: 1.6 }}>You can verify the role from the authenticated profile response before continuing.</p>
            <button type="button" onClick={onContinue} style={buttonStyle}>Continue to workspace</button>
          </>
        ) : (
          <>
            <p style={{ color: "#cbd5e1", lineHeight: 1.65 }}>
              Signed in as <strong>{user?.email}</strong>. The backend will promote only this preconfigured, verified Author profile. This operation is one-time and is protected by the server-side bootstrap configuration.
            </p>
            {user?.role !== "author" && (
              <p role="alert" style={{ color: "#fca5a5", lineHeight: 1.5 }}>Bootstrap can only be started from your current Author account.</p>
            )}
            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", margin: "20px 0", color: "#e2e8f0", lineHeight: 1.5, fontSize: 14 }}>
              <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} style={{ marginTop: 4 }} />
              I confirmed in Render that the server bootstrap settings are configured for this exact account and that the SQLite database is on persistent storage before consuming the one-time setup.
            </label>
            {error && <p role="alert" style={{ color: "#fca5a5", lineHeight: 1.5 }}>{error}</p>}
            <button
              type="button"
              onClick={handleBootstrap}
              disabled={!confirmed || loading || user?.role !== "author"}
              style={{ ...buttonStyle, opacity: !confirmed || loading || user?.role !== "author" ? 0.55 : 1, cursor: !confirmed || loading || user?.role !== "author" ? "not-allowed" : "pointer" }}
            >
              {loading ? "Verifying and promoting…" : "Verify account and bootstrap admin"}
            </button>
            <button type="button" onClick={onContinue} style={{ display: "block", margin: "16px auto 0", border: 0, background: "none", color: "#7dd3fc", cursor: "pointer" }}>
              Cancel and return to workspace
            </button>
          </>
        )}
      </section>
    </main>
  );
}

const buttonStyle = {
  width: "100%",
  padding: "12px 16px",
  border: 0,
  borderRadius: 8,
  color: "white",
  fontWeight: 700,
  background: "linear-gradient(135deg,#0284c7,#2563eb)",
  cursor: "pointer",
};
