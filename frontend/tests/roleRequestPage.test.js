import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pageSource = readFileSync(new URL("../src/components/RoleRequestPage.jsx", import.meta.url), "utf8");

test("role request dropdown offers Author first and never offers System Admin", () => {
  const author = pageSource.indexOf('<option value="author">Author</option>');
  const reviewer = pageSource.indexOf('<option value="reviewer">Reviewer</option>');
  const approver = pageSource.indexOf('<option value="approver">Approver</option>');
  const templateAdmin = pageSource.indexOf('<option value="template_admin">Template Admin</option>');

  assert.ok(author >= 0);
  assert.ok(author < reviewer && reviewer < approver && approver < templateAdmin);
  assert.equal(pageSource.includes('<option value="admin"'), false);
});
