export function getWorkflowActions(document, actorRole) {
  if (!document) return [];
  const role = actorRole === "system_admin" ? "admin" : actorRole;
  const { workflow_stage: stage, status } = document;
  if (role === "author" && stage === "author" && ["draft", "changes_requested"].includes(status)) {
    return [{ value: "ready_for_review", label: "Submit to Reviewer" }];
  }
  if (role === "reviewer" && stage === "reviewer" && status === "ready_for_review") {
    return [{ value: "in_review", label: "Start Review" }, { value: "changes_requested", label: "Request Changes" }];
  }
  if (role === "reviewer" && stage === "reviewer" && status === "in_review") {
    return [{ value: "review_approved", label: "Approve Review" }, { value: "changes_requested", label: "Request Changes" }];
  }
  if (role === "approver" && stage === "approver" && status === "in_review") {
    return [
      { value: "approver_approved", label: "Approve and Send to Template Admin" },
      { value: "changes_requested", label: "Request Changes" },
      { value: "rejected", label: "Reject Document" },
    ];
  }
  if (role === "template_admin" && stage === "template_admin" && status === "in_review") {
    return [{ value: "template_approved", label: "Approve Template Compliance" }, { value: "changes_requested", label: "Request Changes" }];
  }
  if (role === "admin" && stage === "admin" && status === "in_review") {
    return [{ value: "approved", label: "Final System Admin Approval" }];
  }
  return [];
}
