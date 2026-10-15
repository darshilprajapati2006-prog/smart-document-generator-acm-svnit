import test from "node:test";
import assert from "node:assert/strict";
import {
  validateLeadSignatureFile,
  MAX_LEAD_SIGNATURE_BYTES,
  createLeadSignatureState,
  clearLeadSignatureState,
  hasLeadSignaturePreview,
} from "../src/utils/leadSignature.js";

test("lead signature upload accepts PNG and JPEG files within the size limit", () => {
  assert.equal(validateLeadSignatureFile({ name: "sign.png", type: "image/png", size: 1200 }), "");
  assert.equal(validateLeadSignatureFile({ name: "sign.jpg", type: "image/jpeg", size: MAX_LEAD_SIGNATURE_BYTES }), "");
  assert.equal(validateLeadSignatureFile({ name: "sign.jpeg", type: "image/jpeg", size: 800 }), "");
});

test("lead signature upload rejects unsupported, mismatched, empty, and oversized files", () => {
  assert.match(validateLeadSignatureFile({ name: "sign.gif", type: "image/gif", size: 1200 }), /Unsupported/);
  assert.match(validateLeadSignatureFile({ name: "sign.png", type: "image/jpeg", size: 1200 }), /Unsupported/);
  assert.match(validateLeadSignatureFile({ name: "sign.png", type: "image/png", size: 0 }), /1 MB/);
  assert.match(validateLeadSignatureFile({ name: "sign.png", type: "image/png", size: MAX_LEAD_SIGNATURE_BYTES + 1 }), /1 MB/);
});

test("lead signature preview appears for an uploaded image and removal clears it and authorization", () => {
  const uploaded = createLeadSignatureState("data:image/png;base64,c2ln", "lead.png", true);
  assert.equal(hasLeadSignaturePreview(uploaded), true);
  const removed = clearLeadSignatureState();
  assert.equal(hasLeadSignaturePreview(removed), false);
  assert.equal(removed.confirmed, false);
  assert.equal(removed.fileName, "");
});
