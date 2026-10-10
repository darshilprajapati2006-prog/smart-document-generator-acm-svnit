const APPROVED_ROOTS = ["svnit.ac.in", "svnit.acm.org"];

export function isApprovedInstitutionalEmail(email) {
  const parts = String(email || "").trim().toLowerCase().split("@");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return false;
  const domain = parts[1];
  return APPROVED_ROOTS.some((root) => domain === root || domain.endsWith(`.${root}`));
}
