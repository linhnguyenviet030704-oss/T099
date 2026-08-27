import { test } from "node:test";
import assert from "node:assert/strict";
import { canBrowseJobApplications } from "./roleGuard.ts";

test("candidate cannot browse job applications", () => {
  assert.equal(canBrowseJobApplications("candidate"), false);
});

test("recruiter can browse job applications", () => {
  assert.equal(canBrowseJobApplications("recruiter"), true);
});

test("admin can browse job applications", () => {
  assert.equal(canBrowseJobApplications("admin"), true);
});

test("null role cannot browse job applications", () => {
  assert.equal(canBrowseJobApplications(null), false);
});

test("undefined role cannot browse job applications", () => {
  assert.equal(canBrowseJobApplications(undefined), false);
});
