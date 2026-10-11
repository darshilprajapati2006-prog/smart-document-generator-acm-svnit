import { useState } from "react";
import { batchGenerate, getFullDownloadUrl } from "../services/documentApi";

const defaultDemoJobs = [
  {
    job_id: "batch-exec-1",
    document_type: "exec_meet",
    payload: {
      date: "15/10/2026",
      event_name: "ACM Web3 & Blockchain Workshop",
      venue: "Seminar Hall 402, SVNIT",
      event_date: "25/10/2026",
      time_from: "10:00 AM",
      time_to: "01:00 PM",
      brief_description: "Introduction to smart contracts and decentralized protocols.",
      objective: "Hands-on blockchain development.",
      participants: "90 Attendees",
      mode: "Offline",
      organizers: "ACM SVNIT Chapter"
    }
  },
  {
    job_id: "batch-bill-1",
    document_type: "bill_certificate",
    payload: {
      chapter_name: "ACM",
      code_no: "6/52",
      date: "12/10/2026",
      supplier_name: "Royal Printers & Stationers",
      items: [
        { name: "Event Badges & Lanyards", quantity: 90, unit_cost: 15.0 },
        { name: "Workshop Certificates", quantity: 90, unit_cost: 8.0 }
      ],
      taxes_or_other_charges: 100.0,
      invoice_no_and_date: "INV-2026/77 dated 11/10/2026"
    }
  },
  {
    job_id: "batch-summary-1",
    document_type: "bill_summary",
    payload: {
      date: "15/10/2026",
      title: "BILL SUMMARY",
      subtitle: "Web3 Workshop Logistics & Prize Disbursements",
      rows: [
        {
          name: "Project Lead",
          account_details: "Reimbursement for cloud server hosting",
          to_be_paid_to: "Lead Developer",
          prize_money: 0,
          other_amount: 1500.0
        },
        {
          name: "Hackathon Winner",
          account_details: "1st Place Smart Contract Track",
          to_be_paid_to: "Winner Student",
          prize_money: 3000.0,
          other_amount: 0
        }
      ]
    }
  }
];

export default function BatchGenerator() {
  const [jobs, setJobs] = useState(defaultDemoJobs);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  function handleLoadDemoBatch() {
    setJobs(defaultDemoJobs);
    setResult(null);
    setError("");
  }

  function handleAddEmptyJob() {
    if (jobs.length >= 10) {
      setError("Maximum 10 batch jobs allowed in single run.");
      return;
    }
    const newId = `job-${Date.now().toString().slice(-4)}`;
    setJobs([
      ...jobs,
      {
        job_id: newId,
        document_type: "exec_meet",
        payload: {
          date: "15/10/2026",
          event_name: "New Meeting Event",
          venue: "Seminar Hall 402",
          event_date: "25/10/2026",
          brief_description: "Event discussion.",
          objective: "Team alignment."
        }
      }
    ]);
  }

  function handleRemoveJob(idx) {
    if (jobs.length <= 1) {
      setError("At least one job is required in batch.");
      return;
    }
    setJobs(jobs.filter((_, i) => i !== idx));
  }

  async function handleExecuteBatch() {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await batchGenerate(jobs);
      setResult(res);
    } catch (err) {
      setError(err.message || "Batch generation failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="batch-container page-panel batch-page">
      <div className="page-panel-heading batch-heading">
        <div>
          <h2 className="panel-title">
            ⚡ Batch Document Generation
          </h2>
          <p className="panel-subtitle">
            Queue and generate multiple official documents concurrently with error isolation and ZIP download.
          </p>
        </div>
        <div className="page-panel-actions">
          <button
            type="button"
            className="secondary-btn"
            onClick={handleLoadDemoBatch}
            style={{ padding: "6px 12px", fontSize: "0.85rem" }}
          >
            📋 Load Demo Batch (3 Jobs)
          </button>
          <button
            type="button"
            className="secondary-btn"
            onClick={handleAddEmptyJob}
            style={{ padding: "6px 12px", fontSize: "0.85rem" }}
          >
            ➕ Add Job
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: "10px 14px", background: "#fef2f2", color: "#991b1b", borderRadius: "8px", border: "1px solid #fecaca", marginBottom: "1rem", fontSize: "0.9rem" }}>
          ⚠️ {error}
        </div>
      )}

      {/* Jobs List */}
      <div style={{ display: "grid", gap: "10px", marginBottom: "1.5rem" }}>
        {jobs.map((job, idx) => (
          <div key={job.job_id || idx} className="batch-job-row">
            <div className="batch-job-info">
              <span style={{ fontWeight: "700", color: "#1e293b", fontSize: "0.95rem" }}>
                Job {idx + 1}: {job.document_type === "exec_meet" ? "Executive Meet" : job.document_type === "bill_certificate" ? "Bill Certificate" : "Bill Summary"}
              </span>
              <span className="batch-job-detail">
                [{job.job_id}] — {job.payload.event_name || job.payload.supplier_name || job.payload.title || "Custom Payload"}
              </span>
            </div>
            <button
              type="button"
              onClick={() => handleRemoveJob(idx)}
              className="destructive-icon-button"
              title="Remove Job"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <div className="batch-generate-actions">
        <button
          type="button"
          className="primary-btn"
          onClick={handleExecuteBatch}
          disabled={loading}
          style={{ padding: "10px 20px", fontWeight: "600" }}
        >
          {loading ? "Processing Batch Jobs..." : `Generate Batch (${jobs.length} Documents)`}
        </button>
      </div>

      {/* Results View */}
      {result && (
        <div className="batch-result">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
            <div>
              <span style={{ fontWeight: "700", color: "#166534", fontSize: "1rem" }}>
                ✔ Batch Generation Complete
              </span>
              <span style={{ marginLeft: "12px", color: "#15803d", fontSize: "0.9rem" }}>
                ({result.successful_count} succeeded, {result.failed_count} failed)
              </span>
            </div>
            {result.zip_download_url && (
              <a
                href={getFullDownloadUrl(result.zip_download_url)}
                download={result.zip_filename}
                style={{ padding: "6px 14px", background: "#16a34a", color: "#ffffff", borderRadius: "6px", textDecoration: "none", fontWeight: "600", fontSize: "0.85rem" }}
              >
                📦 Download All as ZIP ({result.zip_filename})
              </a>
            )}
          </div>

          <div style={{ display: "grid", gap: "8px", marginTop: "12px" }}>
            {result.jobs.map((j) => (
              <div key={j.job_id} className="batch-result-row">
                <div>
                  <span style={{ fontWeight: "600" }}>{j.job_id}</span> ({j.document_type})
                  {j.status === "completed" ? (
                    <span style={{ marginLeft: "8px", color: "#16a34a", fontWeight: "600" }}>● Succeeded</span>
                  ) : (
                    <span style={{ marginLeft: "8px", color: "#dc2626", fontWeight: "600" }}>● Failed: {j.error}</span>
                  )}
                </div>
                {j.status === "completed" && j.files && (
                  <div style={{ display: "flex", gap: "10px" }}>
                    <span>{j.files.docx}</span>
                    <span>{j.files.pdf}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
