const CONTENT_TYPES = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

function getFilename(disposition, format) {
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const plain = disposition.match(/filename="?([^";]+)"?/i)?.[1];
  try {
    return encoded ? decodeURIComponent(encoded) : (plain || `document.${format}`);
  } catch {
    return plain || `document.${format}`;
  }
}

export async function fetchAuthenticatedDocumentFile(fetchImpl, url, token, fileFormat) {
  const format = String(fileFormat).toLowerCase();
  if (!CONTENT_TYPES[format]) throw new Error("Choose PDF or DOCX to download.");

  let response;
  try {
    response = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch {
    throw new Error("Could not reach the SmartDocs server. Check your connection and try again.");
  }
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    if (response.status === 401) throw new Error("Your sign-in session expired. Sign in again and retry the download.");
    if (response.status === 403) throw new Error("You do not have permission to access this document.");
    if (response.status === 404) throw new Error(`${format.toUpperCase()} file is unavailable for this document version.`);
    if (response.status >= 500) throw new Error("The server could not prepare the document download. Please try again later.");
    const detail = error.detail || error.message;
    throw new Error(typeof detail === "string" ? detail : `Unable to download the ${format.toUpperCase()} file.`);
  }

  if (!response.headers.get("content-type")?.toLowerCase().startsWith(CONTENT_TYPES[format])) {
    throw new Error(`The server did not return a valid ${format.toUpperCase()} file.`);
  }
  const blob = await response.blob();
  const bytes = new Uint8Array(await blob.slice(0, 5).arrayBuffer());
  const validSignature = format === "pdf"
    ? new TextDecoder().decode(bytes) === "%PDF-"
    : bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (!blob.size || !validSignature) throw new Error(`The downloaded ${format.toUpperCase()} file is invalid.`);

  return {
    blob,
    filename: getFilename(response.headers.get("content-disposition") || "", format),
  };
}
