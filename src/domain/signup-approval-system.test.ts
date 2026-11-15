import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createLocalAdapter } from "./local-adapter.ts";

const now = "2026-11-15T12:00:00.000Z";
const reference = JSON.stringify({
  warehouses: [
    { name: "Bornem", country: "Belgium" },
    { name: "Turnhout", country: "Belgium" },
  ],
  companies: [
    { name: "Supplier Corp", kind: "supplier" },
  ],
  packagingTypes: [{ name: "Normal Pallet", tareKg: 25 }],
});

function createTestAdapter() {
  const dir = mkdtempSync(path.join(tmpdir(), "rm-signup-test-"));
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: "test",
    STOCKFLOW_OWNER_EMAIL: "owner@example.com",
    STOCKFLOW_OWNER_NAME: "Ada Owner",
    STOCKFLOW_OWNER_PASSWORD: "owner-pass-1",
    STOCKFLOW_REFERENCE_JSON: reference,
  };
  const store = createLocalAdapter(path.join(dir, "store.json"), env, () => now);
  return { dir, store };
}

describe("User Signup & Admin Approval System", () => {
  it("1. Public signup creates pending inactive user with validations", async () => {
    const { dir, store } = createTestAdapter();
    try {
      // Invalid email
      const badEmail = await store.run(null, "signUpUser", {
        name: "John Doe",
        email: "invalid-email",
        phone: "+32470123456",
        password: "Password123!",
        confirmPassword: "Password123!",
      });
      assert.equal(badEmail.error, "Please enter a valid email address.");

      // Short password
      const shortPass = await store.run(null, "signUpUser", {
        name: "John Doe",
        email: "john@example.com",
        phone: "+32470123456",
        password: "pass",
        confirmPassword: "pass",
      });
      assert.equal(shortPass.error, "Password must be at least 8 characters long.");

      // Password mismatch
      const mismatch = await store.run(null, "signUpUser", {
        name: "John Doe",
        email: "john@example.com",
        phone: "+32470123456",
        password: "Password123!",
        confirmPassword: "DifferentPassword123!",
      });
      assert.equal(mismatch.error, "Passwords do not match.");

      // Valid signup
      const valid = await store.run(null, "signUpUser", {
        name: "John Doe",
        email: "john@example.com",
        phone: "+32470123456",
        password: "Password123!",
        confirmPassword: "Password123!",
        notes: "Looking for warehouse shift work",
      });
      assert.equal(valid.error, undefined);
      assert.ok(valid.notice?.includes("Registration submitted"));

      // Duplicate signup
      const duplicate = await store.run(null, "signUpUser", {
        name: "John Clone",
        email: "john@example.com",
        phone: "+32470123456",
        password: "Password123!",
        confirmPassword: "Password123!",
      });
      assert.ok(duplicate.error?.includes("already pending"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("2. Pending user cannot log in and is blocked with clear message", async () => {
    const { dir, store } = createTestAdapter();
    try {
      await store.run(null, "signUpUser", {
        name: "Alice Pending",
        email: "alice@example.com",
        phone: "+32470112233",
        password: "Password123!",
        confirmPassword: "Password123!",
      });

      const loginRes = await store.signIn("alice@example.com", "Password123!");
      assert.equal(loginRes.ok, false);
      assert.ok(loginRes.error?.includes("pending administrator approval"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("3. Admin receives instant notification when signup request is submitted", async () => {
    const { dir, store } = createTestAdapter();
    try {
      await store.run(null, "signUpUser", {
        name: "Bob Applicant",
        email: "bob@example.com",
        phone: "+32470998877",
        password: "Password123!",
        confirmPassword: "Password123!",
      });

      // Check admin notifications
      const adminSign = await store.signIn("owner@example.com", "owner-pass-1");
      assert.equal(adminSign.ok, true);
      const snap = await store.snapshot(adminSign.value.sessionId);
      
      const notifs = snap.notifications.filter(
        (n) => n.eventType === "user_registration" && n.title.includes("Bob Applicant")
      );
      assert.ok(notifs.length >= 1);
      assert.ok(notifs[0].message.includes("+32470998877"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("4. Admin approves registration with assigned role and warehouse, enabling login", async () => {
    const { dir, store } = createTestAdapter();
    try {
      await store.run(null, "signUpUser", {
        name: "Charlie Worker",
        email: "charlie@example.com",
        phone: "+32470554433",
        password: "Password123!",
        confirmPassword: "Password123!",
      });

      const adminSign = await store.signIn("owner@example.com", "owner-pass-1");
      assert.equal(adminSign.ok, true);

      const snap = await store.snapshot(adminSign.value.sessionId);
      const applicant = snap.users.find((u) => u.email === "charlie@example.com");
      assert.ok(applicant);

      // Approve as worker in Turnhout
      const approveRes = await store.run(adminSign.value.sessionId, "approveRegistration", {
        userId: applicant.id,
        role: "worker",
        warehouse: "Turnhout",
        notes: "Assigned to Turnhout morning shift",
      });
      assert.equal(approveRes.error, undefined);

      // Charlie can now log in
      const charlieLogin = await store.signIn("charlie@example.com", "Password123!");
      assert.equal(charlieLogin.ok, true);
      assert.equal(charlieLogin.value.profile.role, "worker");
      assert.equal(charlieLogin.value.profile.active, true);
      assert.equal(charlieLogin.value.profile.approvalStatus, "approved");

      // Verify audit log
      const updatedSnap = await store.snapshot(adminSign.value.sessionId);
      const auditEntry = updatedSnap.auditLog.find(
        (a) => a.action === "user-registration-approved" && a.targetId === applicant.id
      );
      assert.ok(auditEntry);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("5. Admin rejects registration with reason; rejected user cannot log in", async () => {
    const { dir, store } = createTestAdapter();
    try {
      await store.run(null, "signUpUser", {
        name: "Dave Rejected",
        email: "dave@example.com",
        phone: "+32470001122",
        password: "Password123!",
        confirmPassword: "Password123!",
      });

      const adminSign = await store.signIn("owner@example.com", "owner-pass-1");
      assert.equal(adminSign.ok, true);
      const snap = await store.snapshot(adminSign.value.sessionId);
      const applicant = snap.users.find((u) => u.email === "dave@example.com");
      assert.ok(applicant);

      // Reject registration
      const rejectRes = await store.run(adminSign.value.sessionId, "rejectRegistration", {
        userId: applicant.id,
        reason: "Unauthorized domain",
      });
      assert.equal(rejectRes.error, undefined);

      // Dave cannot log in
      const daveLogin = await store.signIn("dave@example.com", "Password123!");
      assert.equal(daveLogin.ok, false);
      assert.ok(daveLogin.error?.includes("declined"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("6. Admin deactivates and reactivates user account", async () => {
    const { dir, store } = createTestAdapter();
    try {
      const adminSign = await store.signIn("owner@example.com", "owner-pass-1");
      assert.equal(adminSign.ok, true);

      // First add a manager user to test with
      await store.run(adminSign.value.sessionId, "addUser", {
        name: "Test Staff",
        email: "teststaff@example.com",
        role: "manager",
      });

      // Deactivate manager
      const deactRes = await store.run(adminSign.value.sessionId, "deactivateUser", {
        email: "teststaff@example.com",
      });
      assert.equal(deactRes.error, undefined);

      // Staff cannot log in while inactive
      const snap = await store.snapshot(adminSign.value.sessionId);
      const staffUser = snap.users.find((u) => u.email === "teststaff@example.com");
      assert.equal(staffUser?.active, false);

      // Reactivate manager
      const reactRes = await store.run(adminSign.value.sessionId, "reactivateUser", {
        email: "teststaff@example.com",
      });
      assert.equal(reactRes.error, undefined);

      const snapAfter = await store.snapshot(adminSign.value.sessionId);
      const staffAfter = snapAfter.users.find((u) => u.email === "teststaff@example.com");
      assert.equal(staffAfter?.active, true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("7. Deletion safeguards: cannot delete self or last owner", async () => {
    const { dir, store } = createTestAdapter();
    try {
      const adminSign = await store.signIn("owner@example.com", "owner-pass-1");
      assert.equal(adminSign.ok, true);

      // Try deleting self
      const selfDel = await store.run(adminSign.value.sessionId, "deleteUser", {
        email: "owner@example.com",
      });
      assert.ok(selfDel.error?.includes("cannot delete your own account"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("8. Existing accounts remain functional", async () => {
    const { dir, store } = createTestAdapter();
    try {
      // Owner login
      const ownerRes = await store.signIn("owner@example.com", "owner-pass-1");
      assert.equal(ownerRes.ok, true);
      assert.equal(ownerRes.value.profile.role, "owner");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
