import React, { useState, useEffect } from "react";
import { fetchUsers, createInvitation, updateUserRole, updateUserStatus, deleteUser, revokeInvitation, fetchRoleRequests, reviewRoleRequest } from "../services/documentApi";

const ROLES = [
  { value: "author", label: "Author", color: "#0284c7" },
  { value: "reviewer", label: "Reviewer", color: "#d97706" },
  { value: "approver", label: "Approver", color: "#16a34a" },
  { value: "template_admin", label: "Template Admin", color: "#7c3aed" },
  { value: "admin", label: "System Admin", color: "#dc2626" },
  { value: "viewer", label: "Viewer", color: "#64748b" },
];

export default function UserManagementModal({ isOpen, onClose, currentUserId }) {
  const [users, setUsers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [roleRequests, setRoleRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState("author");
  const [invitationUrl, setInvitationUrl] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (isOpen) loadUsers();
  }, [isOpen]);

  if (!isOpen) return null;

  async function loadUsers() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchUsers();
      setUsers(res.users || []);
      setInvitations(res.invitations || []);
      const requests = await fetchRoleRequests();
      setRoleRequests(requests.requests || []);
    } catch (err) {
      setError(err.message || "Failed to load user accounts.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateUser(e) {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!newEmail.trim()) {
      setError("Enter the institutional email address to invite.");
      return;
    }

    const privilegedInvitation = ["reviewer", "approver", "template_admin", "admin"].includes(newRole);
    if (privilegedInvitation && !window.confirm(`Issue a one-time ${ROLES.find((r) => r.value === newRole)?.label} invitation to ${newEmail.trim()}?`)) return;

    setCreating(true);
    try {
      const result = await createInvitation({
        email: newEmail.trim(),
        role: newRole,
        confirm_privileged: privilegedInvitation,
      });
      setInvitationUrl(result.invitation_url);
      setSuccessMsg(`Invitation for ${newEmail.trim()} created. Copy and share the one-time link.`);
      setNewEmail("");
      setNewRole("author");
      await loadUsers();
    } catch (err) {
      setError(err.message || "Failed to create user.");
    } finally {
      setCreating(false);
    }
  }

  async function handleRoleChange(userId, targetRole) {
    setError(null);
    setSuccessMsg(null);
    const privileged = ["reviewer", "approver", "template_admin", "admin"].includes(targetRole);
    if (privileged && !window.confirm(`Confirm assigning ${ROLES.find((r) => r.value === targetRole)?.label || targetRole}? This grants privileged access.`)) {
      await loadUsers();
      return;
    }
    try {
      await updateUserRole(userId, targetRole, privileged);
      setSuccessMsg(`User role updated to '${targetRole}'.`);
      await loadUsers();
    } catch (err) {
      setError(err.message || "Failed to update role.");
    }
  }

  async function handleRevokeInvitation(invitation) {
    if (!window.confirm(`Revoke the unused invitation for ${invitation.email}?`)) return;
    try {
      await revokeInvitation(invitation.id);
      setSuccessMsg(`Invitation for ${invitation.email} revoked.`);
      setInvitationUrl("");
      await loadUsers();
    } catch (err) {
      setError(err.message || "Failed to revoke invitation.");
    }
  }

  async function handleRoleRequestReview(request, decision) {
    const confirmPrivileged = decision === "approve";
    if (confirmPrivileged && !window.confirm(`Approve ${request.requested_role.replaceAll("_", " ")} access for ${request.email}?`)) return;
    try {
      await reviewRoleRequest(request.id, decision, confirmPrivileged);
      setSuccessMsg(`Role request ${decision === "approve" ? "approved" : "rejected"}.`);
      await loadUsers();
    } catch (err) {
      setError(err.message || "Failed to review role request.");
    }
  }

  async function handleStatusToggle(user) {
    setError(null);
    setSuccessMsg(null);
    const newStatus = user.status === "active" ? "inactive" : "active";
    try {
      await updateUserStatus(user.id, newStatus);
      setSuccessMsg(`User account '${user.full_name}' is now ${newStatus}.`);
      await loadUsers();
    } catch (err) {
      setError(err.message || "Failed to change account status.");
    }
  }

  async function handleDelete(userId, name) {
    if (!window.confirm(`Are you sure you want to permanently delete user account '${name}'?`)) {
      return;
    }
    setError(null);
    setSuccessMsg(null);
    try {
      await deleteUser(userId);
      setSuccessMsg(`User account '${name}' was deleted.`);
      await loadUsers();
    } catch (err) {
      setError(err.message || "Failed to delete user.");
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="user-mgmt-title"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.75)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1100,
        padding: "16px",
      }}
    >
      <div
        className="theme-modal-card user-management-card"
        style={{
          background: "#ffffff",
          borderRadius: "14px",
          width: "820px",
          maxWidth: "100%",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          border: "1px solid #e2e8f0",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "18px 24px",
            borderBottom: "1px solid #f1f5f9",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "#f8fafc",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "1.3rem" }}>👥</span>
              <h3
                id="user-mgmt-title"
                style={{ margin: 0, fontSize: "1.2rem", fontWeight: 700, color: "#0f172a" }}
              >
                User & Role Management (System Admin)
              </h3>
              <span
                style={{
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  padding: "2px 8px",
                  borderRadius: "12px",
                  background: "#fee2e2",
                  color: "#991b1b",
                }}
              >
                Admin Restricted
              </span>
            </div>
            <p style={{ margin: "4px 0 0 0", fontSize: "0.82rem", color: "#64748b" }}>
              Manage accounts, assign roles (Author, Reviewer, Approver, Template Admin, System Admin, Viewer), and activate or deactivate access.
            </p>
          </div>
          <button
            type="button"
            onClick={() => { setInvitationUrl(""); onClose(); }}
            aria-label="Close user management"
            style={{
              background: "transparent",
              border: "none",
              fontSize: "1.3rem",
              color: "#94a3b8",
              cursor: "pointer",
              padding: "4px 8px",
            }}
          >
            ✕
          </button>
        </div>

        {/* Action & Alert Bar */}
        <div style={{ padding: "12px 24px", background: "#ffffff", borderBottom: "1px solid #f1f5f9" }}>
          {error && (
            <div style={{ padding: "8px 12px", background: "#fef2f2", color: "#991b1b", borderRadius: "6px", fontSize: "0.82rem", marginBottom: "8px" }}>
              ⚠️ {error}
            </div>
          )}
          {successMsg && (
            <div style={{ padding: "8px 12px", background: "#f0fdf4", color: "#166534", borderRadius: "6px", fontSize: "0.82rem", marginBottom: "8px" }}>
              ✓ {successMsg}
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.85rem", color: "#64748b" }}>
              Total Registered Accounts: <strong>{users.length}</strong>
            </span>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                onClick={loadUsers}
                style={{
                  padding: "6px 12px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  background: "#f8fafc",
                  fontSize: "0.8rem",
                  color: "#475569",
                  cursor: "pointer",
                }}
              >
                🔄 Refresh
              </button>
              <button
                type="button"
                onClick={() => setShowCreateForm(!showCreateForm)}
                style={{
                  padding: "6px 14px",
                  borderRadius: "6px",
                  border: "none",
                  background: showCreateForm ? "#64748b" : "#0284c7",
                  color: "#ffffff",
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {showCreateForm ? "Cancel Invitation" : "➕ Invite User"}
              </button>
            </div>
          </div>
        </div>

        {/* Admin invitation form */}
        {showCreateForm && (
          <form
            onSubmit={handleCreateUser}
            style={{
              padding: "16px 24px",
              background: "#f8fafc",
              borderBottom: "1px solid #e2e8f0",
              display: "grid",
              gridTemplateColumns: "minmax(180px, 2fr) minmax(140px, 1fr) auto",
              gap: "10px",
              alignItems: "end",
            }}
          >
            <div>
              <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "#475569", marginBottom: "3px" }}>
                Institutional Email *
              </label>
              <input
                type="email"
                placeholder="e.g., rollno@dept.svnit.ac.in"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                required
                style={{ width: "100%", padding: "7px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.82rem", boxSizing: "border-box" }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "#475569", marginBottom: "3px" }}>
                Assigned Role *
              </label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                style={{ width: "100%", padding: "7px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.82rem", boxSizing: "border-box" }}
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <button
                type="submit"
                disabled={creating}
                style={{
                  padding: "8px 16px",
                  borderRadius: "6px",
                  border: "none",
                  background: creating ? "#94a3b8" : "#16a34a",
                  color: "#ffffff",
                  fontSize: "0.82rem",
                  fontWeight: 600,
                  cursor: creating ? "not-allowed" : "pointer",
                  height: "33px",
                }}
              >
                {creating ? "Creating..." : "Create Invitation"}
              </button>
            </div>
          </form>
        )}

        {invitationUrl && (
          <div style={{ padding: "12px 24px", background: "#eff6ff", borderBottom: "1px solid #bfdbfe", overflowWrap: "anywhere" }}>
            <strong style={{ color: "#1e3a8a", fontSize: ".82rem" }}>One-time invitation link (shown once):</strong>
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              <input readOnly value={invitationUrl} aria-label="Invitation link" style={{ flex: 1, minWidth: 0, padding: 7 }} />
              <button type="button" onClick={() => navigator.clipboard.writeText(invitationUrl)} style={{ padding: "6px 10px" }}>Copy</button>
            </div>
          </div>
        )}

        {/* User Table */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>
          {loading ? (
            <div style={{ padding: "40px", textAlign: "center", color: "#64748b" }}>Loading accounts...</div>
          ) : users.length === 0 ? (
            <div style={{ padding: "40px", textAlign: "center", color: "#64748b" }}>No users found.</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.84rem" }}>
              <thead>
                <tr style={{ background: "#f8fafc", textAlign: "left", color: "#475569", borderBottom: "2px solid #e2e8f0" }}>
                  <th style={{ padding: "10px 12px" }}>User</th>
                  <th style={{ padding: "10px 12px" }}>Email</th>
                  <th style={{ padding: "10px 12px" }}>Assigned Role</th>
                  <th style={{ padding: "10px 12px" }}>Status</th>
                  <th style={{ padding: "10px 12px" }}>Email Verified</th>
                  <th style={{ padding: "10px 12px" }}>Created</th>
                  <th style={{ padding: "10px 12px", textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const roleConfig = ROLES.find((r) => r.value === u.role) || { label: u.role, color: "#64748b" };
                  const isCurrent = currentUserId === u.id;
                  const isActive = u.status === "active";

                  return (
                    <tr key={u.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "10px 12px", fontWeight: 600, color: "#0f172a" }}>
                        {u.full_name} {isCurrent && <span style={{ fontSize: "0.7rem", color: "#0284c7" }}>(You)</span>}
                      </td>
                      <td style={{ padding: "10px 12px", color: "#475569" }}>{u.email}</td>
                      <td style={{ padding: "10px 12px" }}>
                        <select
                          value={u.role}
                          onChange={(e) => handleRoleChange(u.id, e.target.value)}
                          style={{
                            padding: "4px 8px",
                            borderRadius: "6px",
                            border: `1px solid ${roleConfig.color}`,
                            fontSize: "0.78rem",
                            fontWeight: 600,
                            color: roleConfig.color,
                            background: "#ffffff",
                          }}
                        >
                          {ROLES.map((r) => (
                            <option key={r.value} value={r.value}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <span
                          style={{
                            padding: "3px 8px",
                            borderRadius: "12px",
                            fontSize: "0.72rem",
                            fontWeight: 700,
                            background: isActive ? "#dcfce7" : "#fee2e2",
                            color: isActive ? "#166534" : "#991b1b",
                          }}
                        >
                          {isActive ? "● Active" : "○ Inactive"}
                        </span>
                      </td>
                      <td style={{ padding: "10px 12px" }}>{u.is_verified ? "Verified" : "Pending"}</td>
                      <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>{u.created_at || "—"}</td>
                      <td style={{ padding: "10px 12px", textAlign: "right" }}>
                        <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                          <button
                            type="button"
                            onClick={() => handleStatusToggle(u)}
                            disabled={isCurrent && isActive}
                            title={isCurrent && isActive ? "Cannot deactivate yourself" : "Toggle status"}
                            style={{
                              padding: "4px 10px",
                              borderRadius: "5px",
                              border: "1px solid #cbd5e1",
                              background: isActive ? "#fff1f2" : "#f0fdf4",
                              color: isActive ? "#e11d48" : "#16a34a",
                              fontSize: "0.74rem",
                              fontWeight: 600,
                              cursor: isCurrent && isActive ? "not-allowed" : "pointer",
                            }}
                          >
                            {isActive ? "Deactivate" : "Activate"}
                          </button>
                          {!isCurrent && (
                            <button
                              type="button"
                              onClick={() => handleDelete(u.id, u.full_name)}
                              title="Delete user account"
                              style={{
                                padding: "4px 8px",
                                borderRadius: "5px",
                                border: "1px solid #fecaca",
                                background: "#ffffff",
                                color: "#ef4444",
                                fontSize: "0.74rem",
                                cursor: "pointer",
                              }}
                            >
                              🗑️
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {invitations.length > 0 && (
            <section style={{ marginTop: 24 }}>
              <h4 style={{ color: "#0f172a" }}>Invitations</h4>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".82rem" }}>
                <thead><tr style={{ textAlign: "left", color: "#475569" }}><th>Email</th><th>Role</th><th>Status</th><th>Expires</th><th /></tr></thead>
                <tbody>{invitations.map((inv) => {
                  const inviteStatus = inv.used_at ? "Accepted" : inv.revoked_at ? "Revoked" : new Date(inv.expires_at) <= new Date() ? "Expired" : "Pending";
                  return <tr key={inv.id} style={{ borderTop: "1px solid #e2e8f0" }}>
                    <td>{inv.email}</td><td>{ROLES.find((r) => r.value === inv.role)?.label || inv.role}</td><td>{inviteStatus}</td><td>{new Date(inv.expires_at).toLocaleString()}</td>
                    <td>{inviteStatus === "Pending" && <button type="button" onClick={() => handleRevokeInvitation(inv)}>Revoke</button>}</td>
                  </tr>;
                })}</tbody>
              </table>
            </section>
          )}

          {roleRequests.length > 0 && (
            <section style={{ marginTop: 24 }}>
              <h4 style={{ color: "#0f172a" }}>Role Requests</h4>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".82rem" }}>
                <thead><tr style={{ textAlign: "left", color: "#475569" }}><th>Email</th><th>Requested role</th><th>Status</th><th>Submitted</th><th /></tr></thead>
                <tbody>{roleRequests.map((request) => <tr key={request.id} style={{ borderTop: "1px solid #e2e8f0" }}>
                  <td>{request.email}</td><td>{request.requested_role.replaceAll("_", " ")}</td><td>{request.status}</td><td>{new Date(request.created_at).toLocaleString()}</td>
                  <td>{request.status === "pending" && <span style={{ display: "flex", gap: 6 }}>
                    <button type="button" onClick={() => handleRoleRequestReview(request, "approve")}>Approve</button>
                    <button type="button" onClick={() => handleRoleRequestReview(request, "reject")}>Reject</button>
                  </span>}</td>
                </tr>)}</tbody>
              </table>
            </section>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "12px 24px",
            borderTop: "1px solid #f1f5f9",
            display: "flex",
            justifyContent: "flex-end",
            background: "#f8fafc",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "7px 18px",
              borderRadius: "6px",
              border: "1px solid #cbd5e1",
              background: "#ffffff",
              color: "#475569",
              fontSize: "0.84rem",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
