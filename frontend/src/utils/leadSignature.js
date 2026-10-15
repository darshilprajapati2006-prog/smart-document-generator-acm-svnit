export const MAX_LEAD_SIGNATURE_BYTES = 1024 * 1024;

export function createLeadSignatureState(data = "", fileName = "", confirmed = false, error = "") {
  return { data, fileName, confirmed, error };
}

export function clearLeadSignatureState(error = "") {
  return createLeadSignatureState("", "", false, error);
}

export function hasLeadSignaturePreview(state) {
  return Boolean(state?.data);
}

export function validateLeadSignatureFile(file) {
  if (!file) return "Choose a signature image to upload.";
  const extension = String(file.name || "").split(".").pop()?.toLowerCase();
  const validType = (file.type === "image/png" && extension === "png")
    || (file.type === "image/jpeg" && ["jpg", "jpeg"].includes(extension));
  if (!validType) return "Unsupported file. Choose a PNG, JPG, or JPEG image.";
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_LEAD_SIGNATURE_BYTES) {
    return "Signature image must be smaller than or equal to 1 MB.";
  }
  return "";
}
