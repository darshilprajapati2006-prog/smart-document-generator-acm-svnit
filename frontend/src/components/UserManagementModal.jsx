import React, { useState, useEffect } from "react";
import {
  fetchUsers,
  createInvitation,
  updateUserRole,
  updateUserStatus,
  deleteUser,
  revokeInvitation,
  fetchRoleRequests,
  reviewRoleRequest,
} from "../services/documentApi";

const ROLES = [
  { value: "author", label: "Author", color: "#b39bff" },
  { value: "reviewer", label: "Reviewer", color: "#e5bb69" },
  { value: "approver", label: "Approver", color: "#5fc993" },
  { value: "template_admin", label: "Template Admin", color: "#d4c6ff" },
  { value: "viewer", label: "Viewer", color: "#a29daf" },
];

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

export default function UserManagementModal({ isOpen, onClose, currentUserId }) {
  const [users, setUsers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [roleRequests, setRoleRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeSection, setActiveSection] = useState("accounts");
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState("author");
  const [invitationUrl, setInvitationUrl] = useState("");
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);

  const pendingInvitations = invitations.filter((invitation) =>
    !invitation.used_at &&
    !invitation.revoked_at &&
    new Date(invitation.expires_at) > new Date()
  );

  useEffect(() => {
    if (isOpen) {
      loadUsers();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e) {
      if (e.key === "Escape") {
        setInvitationUrl("");
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

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

  async function handleCopyLink() {
    if (!invitationUrl) return;
    try {
      await navigator.clipboard.writeText(invitationUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // Fallback
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
    if (
      privilegedInvitation &&
      !window.confirm(
        `Issue a one-time ${ROLES.find((r) => r.value === newRole)?.label} invitation to ${newEmail.trim()}?`
      )
    ) {
      return;
    }

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
      setError(err.message || "Failed to create invitation.");
    } finally {
      setCreating(false);
    }
  }

  async function handleRoleChange(userId, targetRole) {
    setError(null);
    setSuccessMsg(null);
    const privileged = ["reviewer", "approver", "template_admin", "admin"].includes(targetRole);
    if (
      privileged &&
      !window.confirm(
        `Confirm assigning ${ROLES.find((r) => r.value === targetRole)?.label || targetRole}? This grants elevated institutional access.`
      )
    ) {
      await loadUsers();
      return;
    }
    try {
      await updateUserRole(userId, targetRole, privileged);
      setSuccessMsg(`User role updated to '${targetRole}'.`);
      await loadUsers();
    } catch (err) {
      setError(err.message || "Failed to update user role.");
    }
  }

  async function handleStatusToggle(user) {
    setError(null);
    setSuccessMsg(null);
    const newStatus = user.status === "active" ? "inactive" : "active";
    try {
      await updateUserStatus(user.id, newStatus);
      setSuccessMsg(`Account '${user.full_name}' is now ${newStatus}.`);
      await loadUsers();
    } catch (err) {
      setError(err.message || "Failed to change account status.");
    }
  }

  async function handleDelete(userId, name) {
    if (!window.confirm(`Are you sure you want to permanently delete user account '${name}'? This action cannot be undone.`)) {
      return;
    }
    setError(null);
    setSuccessMsg(null);
    try {
      await deleteUser(userId);
      setSuccessMsg(`User account '${name}' was deleted.`);
      await loadUsers();
    } catch (err) {
      setError(err.message || "Failed to delete user account.");
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
    if (
      confirmPrivileged &&
      !window.confirm(`Approve ${request.requested_role.replaceAll("_", " ")} access for ${request.email}?`)
    ) {
      return;
    }
    try {
      await reviewRoleRequest(request.id, decision, confirmPrivileged);
      setSuccessMsg(`Role request ${decision === "approve" ? "approved" : "rejected"}.`);
      await loadUsers();
    } catch (err) {
      setError(err.message || "Failed to review role request.");
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="user-mgmt-title"
      className="user-mgmt-backdrop"
      onClick={() => {
        setInvitationUrl("");
        onClose();
      }}
    >
      <div className="user-mgmt-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <header className="user-mgmt-header">
          <div className="user-mgmt-header-left">
            <div className="user-mgmt-header-icon" aria-hidden="true">
              👥
            </div>
            <div className="user-mgmt-header-text">
              <div className="user-mgmt-title-row">
                <h3 id="user-mgmt-title" className="user-mgmt-title">
                  User & Role Management
                </h3>
                <span className="user-mgmt-admin-badge">Admin Restricted</span>
              </div>
              <p className="user-mgmt-subtitle">
                Manage accounts and assign approved roles. System Admin access is reserved for the configured one-time bootstrap account.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="user-mgmt-close-btn"
            onClick={() => {
              setInvitationUrl("");
              onClose();
            }}
            aria-label="Close user management modal"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M1 1L13 13M1 13L13 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        {/* Action & Stats Bar */}
        <div className="user-mgmt-action-bar">
          <div className="user-mgmt-action-btns">
            <button
              type="button"
              className="secondary-btn"
              onClick={loadUsers}
              disabled={loading}
              aria-label="Refresh accounts"
            >
              🔄 Refresh
            </button>
            <button
              type="button"
              className={showCreateForm ? "secondary-btn" : "primary-btn"}
              onClick={() => {
                setActiveSection("invitations");
                setShowCreateForm((visible) => !visible);
              }}
            >
              {showCreateForm ? "✕ Cancel" : "➕ Invite User"}
            </button>
          </div>
        </div>

        {/* Feedback alerts */}
        {(error || successMsg) && (
          <div className="user-mgmt-alerts">
            {error && (
              <div className="feedback-banner feedback-error" role="alert">
                ⚠️ {error}
              </div>
            )}
            {successMsg && (
              <div className="feedback-banner feedback-success" role="status">
                ✓ {successMsg}
              </div>
            )}
          </div>
        )}

        <div className="user-mgmt-tabs" role="tablist" aria-label="User management sections">
          {[
            { id: "accounts", label: "Total Registered Accounts", count: users.length },
            { id: "invitations", label: "Pending Invitations", count: pendingInvitations.length },
            { id: "requests", label: "Role Change Requests", count: roleRequests.length },
          ].map((tab, index, tabs) => (
            <button
              key={tab.id}
              id={`user-mgmt-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={activeSection === tab.id}
              aria-controls={`user-mgmt-panel-${tab.id}`}
              tabIndex={activeSection === tab.id ? 0 : -1}
              className={`user-mgmt-tab${activeSection === tab.id ? " active" : ""}`}
              onClick={() => setActiveSection(tab.id)}
              onKeyDown={(event) => {
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                event.preventDefault();
                const nextIndex = event.key === "Home" ? 0
                  : event.key === "End" ? tabs.length - 1
                    : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
                const nextTab = tabs[nextIndex];
                setActiveSection(nextTab.id);
                event.currentTarget.parentElement
                  ?.querySelector(`#user-mgmt-tab-${nextTab.id}`)
                  ?.focus();
              }}
            >
              <span>{tab.label}</span>
              <span className="user-mgmt-tab-count">{tab.count}</span>
            </button>
          ))}
        </div>

        {/* Admin invitation form */}
        {showCreateForm && activeSection === "invitations" && (
          <form onSubmit={handleCreateUser} className="user-mgmt-invite-card">
            <div className="user-mgmt-invite-grid">
              <div className="user-mgmt-input-group">
                <label htmlFor="invite-email">Institutional Email *</label>
                <input
                  id="invite-email"
                  type="email"
                  placeholder="e.g., rollno@dept.svnit.ac.in"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  required
                  className="user-mgmt-input"
                />
              </div>
              <div className="user-mgmt-input-group">
                <label htmlFor="invite-role">Assigned Role *</label>
                <select
                  id="invite-role"
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  className="user-mgmt-input"
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
                  className="primary-btn"
                  style={{ width: "100%", height: 38 }}
                >
                  {creating ? "Creating..." : "Send Invitation"}
                </button>
              </div>
            </div>
          </form>
        )}

        {/* One-time link banner */}
        {invitationUrl && (
          <div className="user-mgmt-url-banner">
            <strong>One-Time Invitation Link (shown once):</strong>
            <div className="user-mgmt-url-row">
              <input
                readOnly
                value={invitationUrl}
                aria-label="One-time invitation link"
                className="user-mgmt-input"
                style={{ flex: 1, minWidth: 0 }}
              />
              <button
                type="button"
                className="secondary-btn"
                onClick={handleCopyLink}
                style={{ flexShrink: 0, minWidth: 100 }}
              >
                {copied ? "✓ Copied!" : "📋 Copy Link"}
              </button>
            </div>
          </div>
        )}

        {/* Main Content Area */}
        <div className="user-mgmt-body">
          <section
            id="user-mgmt-panel-accounts"
            role="tabpanel"
            aria-labelledby="user-mgmt-tab-accounts"
            tabIndex={0}
            className="user-mgmt-panel"
            hidden={activeSection !== "accounts"}
          >
          {loading ? (
            <div className="empty-state">Loading registered accounts...</div>
          ) : users.length === 0 ? (
            <div className="empty-state">No user accounts found.</div>
          ) : (
            <div className="user-mgmt-table-scroll">
              <table className="user-mgmt-table user-mgmt-users-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Institutional Email</th>
                    <th>Assigned Role</th>
                    <th>Status</th>
                    <th>Email Verified</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const isCurrent = currentUserId === u.id;
                    const isActive = u.status === "active";
                    const initials = getInitials(u.full_name, u.email);

                    return (
                      <tr key={u.id}>
                        {/* User Cell */}
                        <td data-label="User" className="user-mgmt-user-column">
                          <div className="user-mgmt-user-cell">
                            <div className="user-mgmt-avatar" aria-hidden="true">
                              {initials}
                            </div>
                            <span className="user-mgmt-user-name">
                              {u.full_name || "Unnamed User"}
                              {isCurrent && <span className="user-mgmt-you-badge">(You)</span>}
                            </span>
                          </div>
                        </td>

                        {/* Email Cell */}
                        <td data-label="Institutional email" className="user-mgmt-email-cell user-mgmt-email-column">
                          {u.email}
                        </td>

                        {/* Role Cell */}
                        <td data-label="Assigned role" className="user-mgmt-role-column">
                          <select
                            value={u.role}
                            onChange={(e) => handleRoleChange(u.id, e.target.value)}
                            className="user-mgmt-role-select"
                            aria-label={`Assigned role for ${u.full_name || u.email}`}
                          >
                            {u.role === "admin" && <option value="admin" disabled>System Admin (protected)</option>}
                            {ROLES.map((r) => (
                              <option key={r.value} value={r.value}>
                                {r.label}
                              </option>
                            ))}
                          </select>
                        </td>

                        {/* Status Cell */}
                        <td data-label="Status" className="user-mgmt-status-column" style={{ textAlign: "center" }}>
                          <span className={`user-mgmt-status-badge ${isActive ? "active" : "inactive"}`}>
                            <span className="status-dot" aria-hidden="true" />
                            {isActive ? "Active" : "Inactive"}
                          </span>
                        </td>

                        {/* Email Verified Cell */}
                        <td data-label="Email verified" className="user-mgmt-verified-column" style={{ textAlign: "center" }}>
                          <span className={`user-mgmt-verified-badge ${u.is_verified ? "verified" : "pending"}`}>
                            {u.is_verified ? "✓ Verified" : "⏳ Pending"}
                          </span>
                        </td>

                        {/* Created Cell */}
                        <td data-label="Created" className="user-mgmt-date-cell user-mgmt-created-column">
                          {u.created_at || "—"}
                        </td>

                        {/* Actions Cell */}
                        <td data-label="Actions" className="user-mgmt-actions-column">
                          <div className="user-mgmt-actions-cell">
                            <button
                              type="button"
                              onClick={() => handleStatusToggle(u)}
                              disabled={isCurrent && isActive}
                              title={
                                isCurrent && isActive
                                  ? "Cannot deactivate your own active session"
                                  : isActive
                                  ? "Deactivate user account"
                                  : "Activate user account"
                              }
                              className={`user-mgmt-toggle-btn ${isActive ? "btn-deactivate" : "btn-activate"}`}
                            >
                              {isActive ? "Deactivate" : "Activate"}
                            </button>
                            {!isCurrent && (
                              <button
                                type="button"
                                onClick={() => handleDelete(u.id, u.full_name)}
                                title={`Permanently delete user account '${u.full_name}'`}
                                aria-label={`Delete user account ${u.full_name}`}
                                className="user-mgmt-delete-btn"
                              >
                                <svg
                                  width="14"
                                  height="14"
                                  viewBox="0 0 16 16"
                                  fill="none"
                                  aria-hidden="true"
                                >
                                  <path
                                    d="M2.5 4H13.5M5.5 4V2.5C5.5 1.95 5.95 1.5 6.5 1.5H9.5C10.05 1.5 10.5 1.95 10.5 2.5V4M12.5 4V13.5C12.5 14.05 12.05 14.5 11.5 14.5H4.5C3.95 14.5 3.5 14.05 3.5 13.5V4H12.5Z"
                                    stroke="currentColor"
                                    strokeWidth="1.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                  <path
                                    d="M6.5 7V11.5M9.5 7V11.5"
                                    stroke="currentColor"
                                    strokeWidth="1.5"
                                    strokeLinecap="round"
                                  />
                                </svg>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          </section>

          {/* Pending Invitations Sub-table */}
          <section
            id="user-mgmt-panel-invitations"
            role="tabpanel"
            aria-labelledby="user-mgmt-tab-invitations"
            tabIndex={0}
            className="user-mgmt-panel"
            hidden={activeSection !== "invitations"}
          >
          {loading ? (
            <div className="empty-state">Loading invitations...</div>
          ) : pendingInvitations.length > 0 ? (
            <div className="user-mgmt-sub-section">
              <div className="user-mgmt-sub-header">
                <h4>Pending Invitations ({pendingInvitations.length})</h4>
              </div>
              <div className="user-mgmt-table-scroll">
                <table className="user-mgmt-table user-mgmt-invitations-table">
                  <thead>
                    <tr>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th>Expires</th>
                      <th style={{ textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingInvitations.map((inv) => {
                      return (
                        <tr key={inv.id}>
                          <td data-label="Email" className="user-mgmt-email-cell">{inv.email}</td>
                          <td data-label="Role">
                            <span className="user-mgmt-you-badge" style={{ color: "var(--text)" }}>
                              {ROLES.find((r) => r.value === inv.role)?.label || inv.role}
                            </span>
                          </td>
                          <td data-label="Status">
                            <span className="user-mgmt-verified-badge pending">
                              Pending
                            </span>
                          </td>
                          <td data-label="Expires" className="user-mgmt-date-cell">
                            {new Date(inv.expires_at).toLocaleString()}
                          </td>
                          <td data-label="Actions" style={{ textAlign: "right" }}>
                            <button
                              type="button"
                              className="user-mgmt-toggle-btn btn-deactivate"
                              onClick={() => handleRevokeInvitation(inv)}
                            >
                              Revoke
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : <div className="empty-state">No pending invitations.</div>}
          </section>

          {/* Role Requests Sub-table */}
          <section
            id="user-mgmt-panel-requests"
            role="tabpanel"
            aria-labelledby="user-mgmt-tab-requests"
            tabIndex={0}
            className="user-mgmt-panel"
            hidden={activeSection !== "requests"}
          >
          {loading ? (
            <div className="empty-state">Loading role change requests...</div>
          ) : roleRequests.length > 0 ? (
            <div className="user-mgmt-sub-section">
              <div className="user-mgmt-sub-header">
                <h4>Role Change Requests ({roleRequests.length})</h4>
              </div>
              <div className="user-mgmt-table-scroll">
                <table className="user-mgmt-table user-mgmt-requests-table">
                  <thead>
                    <tr>
                      <th>Email</th>
                      <th>Requested Role</th>
                      <th>Status</th>
                      <th>Submitted</th>
                      <th style={{ textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roleRequests.map((request) => (
                      <tr key={request.id}>
                        <td data-label="Email" className="user-mgmt-email-cell">{request.email}</td>
                        <td data-label="Requested role">
                          <span className="user-mgmt-you-badge" style={{ color: "var(--text)" }}>
                            {request.requested_role.replaceAll("_", " ")}
                          </span>
                        </td>
                        <td data-label="Status">
                          <span className={`user-mgmt-verified-badge ${request.status === "pending" ? "pending" : "verified"}`}>
                            {request.status}
                          </span>
                        </td>
                        <td data-label="Submitted" className="user-mgmt-date-cell">
                          {new Date(request.created_at).toLocaleString()}
                        </td>
                        <td data-label="Actions" style={{ textAlign: "right" }}>
                          {request.status === "pending" && (
                            <div className="user-mgmt-actions-cell">
                              <button
                                type="button"
                                className="user-mgmt-toggle-btn btn-activate"
                                onClick={() => handleRoleRequestReview(request, "approve")}
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                className="user-mgmt-toggle-btn btn-deactivate"
                                onClick={() => handleRoleRequestReview(request, "reject")}
                              >
                                Reject
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : <div className="empty-state">No role change requests.</div>}
          </section>
        </div>

        {/* Footer */}
        <footer className="user-mgmt-footer">
          <div className="user-mgmt-audit-note">
            <span>🔒</span>
            <span>RBAC permissions and account status changes take effect immediately across all sessions.</span>
          </div>
          <button
            type="button"
            className="secondary-btn"
            onClick={() => {
              setInvitationUrl("");
              onClose();
            }}
          >
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}
