import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fetchAuthenticatedDocumentFile } from "../src/utils/downloadFile.js";
import { getWorkflowActions } from "../src/utils/workflowActions.js";

test("authenticated PDF download sends bearer token and validates actual PDF bytes", async () => {
  let request;
  const fetchMock = async (url, options) => {
    request = { url, options };
    return new Response(new Blob(["%PDF-1.7\ncanonical"]), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": "attachment; filename=permission-v1.pdf",
      },
    });
  };

  const downloaded = await fetchAuthenticatedDocumentFile(fetchMock, "/api/documents/doc-1/download/pdf", "firebase-id-token", "pdf");
  assert.equal(request.options.headers.Authorization, "Bearer firebase-id-token");
  assert.equal(request.options.cache, "no-store");
  assert.equal(downloaded.filename, "permission-v1.pdf");
  assert.equal(await downloaded.blob.slice(0, 5).text(), "%PDF-");
});

test("authenticated DOCX download validates OOXML response and filename", async () => {
  const fetchMock = async () => new Response(new Blob([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00])]), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "content-disposition": "attachment; filename*=UTF-8''official%20document.docx",
    },
  });
  const downloaded = await fetchAuthenticatedDocumentFile(fetchMock, "/download/docx", "firebase-id-token", "docx");
  assert.equal(downloaded.filename, "official document.docx");
  assert.deepEqual(Array.from(new Uint8Array(await downloaded.blob.slice(0, 2).arrayBuffer())), [0x50, 0x4b]);
});

test("download errors distinguish expired sessions, missing files, and invalid content", async () => {
  await assert.rejects(
    fetchAuthenticatedDocumentFile(async () => new Response(JSON.stringify({ detail: "expired" }), { status: 401 }), "/file", "token", "pdf"),
    /session expired/i,
  );
  await assert.rejects(
    fetchAuthenticatedDocumentFile(async () => new Response(JSON.stringify({ detail: "missing" }), { status: 404 }), "/file", "token", "pdf"),
    /PDF file is unavailable/i,
  );
  await assert.rejects(
    fetchAuthenticatedDocumentFile(async () => new Response(new Blob(["not a pdf"]), { headers: { "content-type": "application/pdf" } }), "/file", "token", "pdf"),
    /invalid/i,
  );
});

test("workflow UI only offers actions for the current role and stage", () => {
  const document = { workflow_stage: "reviewer", status: "in_review" };
  assert.deepEqual(getWorkflowActions(document, "reviewer").map(({ value }) => value), ["review_approved", "changes_requested"]);
  assert.deepEqual(getWorkflowActions(document, "approver"), []);
  assert.deepEqual(getWorkflowActions({ workflow_stage: "admin", status: "in_review" }, "admin").map(({ value }) => value), ["approved"]);
  assert.deepEqual(getWorkflowActions({ workflow_stage: "template_admin", status: "in_review" }, "admin"), []);
});

test("download service waits for Firebase auth and requests a fresh Firebase ID token", () => {
  const source = readFileSync(new URL("../src/services/documentApi.js", import.meta.url), "utf8");
  assert.match(source, /await authReady/);
  assert.match(source, /firebaseAuth\.currentUser/);
  assert.match(source, /user\.getIdToken\(\)/);
});
