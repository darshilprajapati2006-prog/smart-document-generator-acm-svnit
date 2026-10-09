import { useState, useEffect } from "react";
import { fetchAnalyticsDashboard } from "../services/documentApi";

export default function AnalyticsDashboard() {
  const [filterType, setFilterType] = useState("");
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let ignore = false;
    fetchAnalyticsDashboard(filterType).then((res) => {
      if (!ignore) {
        setMetrics(res);
      }
    }).catch(() => {});
    return () => {
      ignore = true;
    };
  }, [filterType]);

  async function handleRefresh() {
    setLoading(true);
    try {
      const res = await fetchAnalyticsDashboard(filterType);
      setMetrics(res);
    } catch {
      // fallback
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: "1.5rem", background: "#ffffff", borderRadius: "12px", border: "1px solid #e2e8f0", marginTop: "1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.2rem" }}>
        <div>
          <h2 style={{ fontSize: "1.3rem", fontWeight: "700", color: "#0f172a", margin: 0 }}>
            📊 Privacy-Conscious Usage Analytics (Feature 13)
          </h2>
          <p style={{ margin: "4px 0 0 0", color: "#64748b", fontSize: "0.9rem" }}>
            Real-time operational telemetry tracking performance, generation success rates, and workflow distributions.
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {loading && <span style={{ fontSize: "0.85rem", color: "#64748b" }}>Updating...</span>}
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.85rem" }}
          >
            <option value="">All Document Types</option>
            <option value="exec_meet">Executive Meet</option>
            <option value="bill_certificate">Bill Certificate</option>
            <option value="bill_summary">Bill Summary</option>
          </select>
          <button type="button" className="secondary-btn" onClick={handleRefresh} style={{ padding: "6px 12px", fontSize: "0.85rem" }}>
            🔄 Refresh
          </button>
        </div>
      </div>

      <div style={{ padding: "8px 12px", background: "#f8fafc", color: "#64748b", borderRadius: "6px", border: "1px solid #e2e8f0", fontSize: "0.82rem", marginBottom: "1rem" }}>
        🔒 <b>Privacy Guarantee:</b> Analytics captures strictly operational metadata (duration, success/failure status, template type). No personal student names, banking numbers, or prompt text are logged.
      </div>

      {metrics && (
        <div>
          {/* Top Metric Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "14px", marginBottom: "1.5rem" }}>
            <div style={{ padding: "16px", borderRadius: "8px", background: "#eff6ff", border: "1px solid #bfdbfe" }}>
              <div style={{ fontSize: "0.82rem", color: "#1e40af", fontWeight: "600" }}>TOTAL GENERATED</div>
              <div style={{ fontSize: "1.8rem", fontWeight: "800", color: "#1d4ed8", marginTop: "4px" }}>
                {metrics.total_documents_generated}
              </div>
            </div>

            <div style={{ padding: "16px", borderRadius: "8px", background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
              <div style={{ fontSize: "0.82rem", color: "#166534", fontWeight: "600" }}>SUCCESS RATE</div>
              <div style={{ fontSize: "1.8rem", fontWeight: "800", color: "#15803d", marginTop: "4px" }}>
                {metrics.success_rate_percentage}%
              </div>
            </div>

            <div style={{ padding: "16px", borderRadius: "8px", background: "#fef3c7", border: "1px solid #fde68a" }}>
              <div style={{ fontSize: "0.82rem", color: "#92400e", fontWeight: "600" }}>AVG DURATION</div>
              <div style={{ fontSize: "1.8rem", fontWeight: "800", color: "#b45309", marginTop: "4px" }}>
                {metrics.avg_generation_duration_ms} ms
              </div>
            </div>

            <div style={{ padding: "16px", borderRadius: "8px", background: "#faf5ff", border: "1px solid #e9d5ff" }}>
              <div style={{ fontSize: "0.82rem", color: "#6b21a8", fontWeight: "600" }}>PERSISTED DOCS</div>
              <div style={{ fontSize: "1.8rem", fontWeight: "800", color: "#7e22ce", marginTop: "4px" }}>
                {metrics.total_persisted_documents}
              </div>
            </div>
          </div>

          {/* Breakdown Tables */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
            <div style={{ padding: "14px", border: "1px solid #e2e8f0", borderRadius: "8px", background: "#f8fafc" }}>
              <h4 style={{ margin: "0 0 10px 0", fontSize: "0.95rem", color: "#1e293b" }}>
                📋 Breakdown by Document Type
              </h4>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.88rem" }}>
                  <span>Executive Meet:</span>
                  <span style={{ fontWeight: "700" }}>{metrics.documents_by_type?.exec_meet || 0}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.88rem" }}>
                  <span>Bill Certificate:</span>
                  <span style={{ fontWeight: "700" }}>{metrics.documents_by_type?.bill_certificate || 0}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.88rem" }}>
                  <span>Bill Summary:</span>
                  <span style={{ fontWeight: "700" }}>{metrics.documents_by_type?.bill_summary || 0}</span>
                </div>
              </div>
            </div>

            <div style={{ padding: "14px", border: "1px solid #e2e8f0", borderRadius: "8px", background: "#f8fafc" }}>
              <h4 style={{ margin: "0 0 10px 0", fontSize: "0.95rem", color: "#1e293b" }}>
                🔄 Workflow Status Distribution
              </h4>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {Object.entries(metrics.workflow_status_distribution || {}).map(([st, cnt]) => (
                  <div key={st} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.88rem" }}>
                    <span style={{ textTransform: "capitalize" }}>{st.replace(/_/g, " ")}:</span>
                    <span style={{ fontWeight: "700" }}>{cnt}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
