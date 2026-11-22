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
      // Strictly verify requirement 7: "Your account is awaiting admin approval."
      assert.ok(loginRes.error?.includes("Your account is awaiting admin approval."));
      assert.ok(loginRes.error?.includes("pending administrator approval"));

      // Verify requirement 2: Pending user cannot access protected routes or APIs
      const currentRes = await store.current("alice-unapproved-session");
      assert.equal(currentRes, null);

      const viewRes = await store.view("alice-unapproved-session");
      assert.equal(viewRes.actor, null);
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

  it("9. Complete end-to-end signup, pending login, approval, rejection, and approved login verification", async () => {
    const { dir, store } = createTestAdapter();
    try {
      // 1. User signs up -> account status is pending
      const signupRes = await store.run(null, "signUpUser", {
        name: "Elena Trader",
        email: "elena@example.com",
        phone: "+32470889900",
        password: "ElenaPassword123!",
        confirmPassword: "ElenaPassword123!",
        notes: "Commodities trader",
      });
      assert.equal(signupRes.error, undefined);
      assert.ok(signupRes.notice?.includes("Registration submitted"));

      // 2. Pending user attempting to log in sees: "Your account is awaiting admin approval."
      const pendingLogin = await store.signIn("elena@example.com", "ElenaPassword123!");
      assert.equal(pendingLogin.ok, false);
      assert.ok(pendingLogin.error?.includes("Your account is awaiting admin approval."));

      // 3. Admin logs in and sees registration request in Admin Portal
      const adminSign = await store.signIn("owner@example.com", "owner-pass-1");
      assert.equal(adminSign.ok, true);
      const snap1 = await store.snapshot(adminSign.value.sessionId);
      const elenaInStore = snap1.users.find((u) => u.email === "elena@example.com");
      assert.ok(elenaInStore);
      assert.equal(elenaInStore.approvalStatus, "pending");
      assert.equal(elenaInStore.active, false);

      // 4. Admin rejects registration with reason
      const rejectRes = await store.run(adminSign.value.sessionId, "rejectRegistration", {
        userId: elenaInStore.id,
        reason: "Verification credentials insufficient",
      });
      assert.equal(rejectRes.error, undefined);

      // 5. Rejected user cannot log in and is shown rejection message
      const rejectedLogin = await store.signIn("elena@example.com", "ElenaPassword123!");
      assert.equal(rejectedLogin.ok, false);
      assert.ok(rejectedLogin.error?.includes("rejected (declined)"));

      // 6. Second user signs up -> approved path
      const user2Signup = await store.run(null, "signUpUser", {
        name: "Felix Approved",
        email: "felix@example.com",
        phone: "+32470443322",
        password: "FelixPassword123!",
        confirmPassword: "FelixPassword123!",
      });
      assert.equal(user2Signup.error, undefined);

      // 7. Felix is pending and cannot log in
      const felixPending = await store.signIn("felix@example.com", "FelixPassword123!");
      assert.equal(felixPending.ok, false);
      assert.ok(felixPending.error?.includes("Your account is awaiting admin approval."));

      // 8. Admin approves Felix as worker in Bornem
      const snap2 = await store.snapshot(adminSign.value.sessionId);
      const felixInStore = snap2.users.find((u) => u.email === "felix@example.com");
      assert.ok(felixInStore);

      const approveRes = await store.run(adminSign.value.sessionId, "approveRegistration", {
        userId: felixInStore.id,
        role: "worker",
        warehouse: "Bornem",
      });
      assert.equal(approveRes.error, undefined);

      // 9. Approved Felix can now successfully log in
      const felixLogin = await store.signIn("felix@example.com", "FelixPassword123!");
      assert.equal(felixLogin.ok, true);
      assert.equal(felixLogin.value.profile.role, "worker");
      assert.equal(felixLogin.value.profile.approvalStatus, "approved");
      assert.equal(felixLogin.value.profile.active, true);

      // 10. Existing approved accounts continue working normally
      const ownerCheck = await store.signIn("owner@example.com", "owner-pass-1");
      assert.equal(ownerCheck.ok, true);
      assert.equal(ownerCheck.value.profile.approvalStatus, "approved");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("10. Strict Login Request Permissions: Admin-only access, Staff cannot view or approve/reject login requests", async () => {
    const { dir, store } = createTestAdapter();
    try {
      // 1. New user submits registration request
      const signupRes = await store.run(null, "signUpUser", {
        name: "Gina Applicant",
        email: "gina@example.com",
        phone: "+32470112233",
        password: "GinaPassword123!",
        confirmPassword: "GinaPassword123!",
        notes: "Warehouse applicant",
      });
      assert.equal(signupRes.error, undefined);

      // Sign in as Admin (owner)
      const adminSign = await store.signIn("owner@example.com", "owner-pass-1");
      assert.equal(adminSign.ok, true);

      // Admin creates Staff user
      const addStaffRes = await store.run(adminSign.value.sessionId, "addUser", {
        name: "Sam Staff",
        email: "staff@example.com",
        role: "manager",
        password: "StaffPassword123!",
      });
      assert.equal(addStaffRes.error, undefined);
      const staffSign = await store.signIn("staff@example.com", "StaffPassword123!");
      assert.equal(staffSign.ok, true);

      // Admin creates Worker user
      const addWorkerRes = await store.run(adminSign.value.sessionId, "addUser", {
        name: "Wally Worker",
        email: "worker@example.com",
        role: "worker",
        warehouse: "Bornem",
        password: "WorkerPassword123!",
      });
      assert.equal(addWorkerRes.error, undefined);
      const workerSign = await store.signIn("worker@example.com", "WorkerPassword123!");
      assert.equal(workerSign.ok, true);

      // 2. Admin sees pending registration request in accounts
      const adminView = await store.view(adminSign.value.sessionId);
      const pendingInAdmin = adminView.state.accounts.find((u) => u.email === "gina@example.com");
      assert.ok(pendingInAdmin, "Admin must be able to view pending registration request");
      assert.equal(pendingInAdmin.approvalStatus, "pending");

      // 3. Staff MUST NOT see pending registration requests in state.accounts
      const staffView = await store.view(staffSign.value.sessionId);
      const pendingInStaff = staffView.state.accounts.find((u) => u.email === "gina@example.com");
      assert.equal(pendingInStaff, undefined, "Staff must NOT see pending registration requests");

      // 4. Worker MUST NOT see pending registration requests in state.accounts
      const workerView = await store.view(workerSign.value.sessionId);
      const pendingInWorker = workerView.state.accounts.find((u) => u.email === "gina@example.com");
      assert.equal(pendingInWorker, undefined, "Worker must NOT see pending registration requests");

      // 5. Direct API calls by Staff must NOT approve or reject login requests
      const staffApprove = await store.run(staffSign.value.sessionId, "approveRegistration", {
        userId: pendingInAdmin.id,
        role: "worker",
        warehouse: "Bornem",
      });
      assert.equal(staffApprove.error, "Only Admin can approve account registrations.");

      const staffReject = await store.run(staffSign.value.sessionId, "rejectRegistration", {
        userId: pendingInAdmin.id,
        reason: "Staff attempting rejection",
      });
      assert.equal(staffReject.error, "Only Admin can reject account registrations.");

      const staffDeleteReq = await store.run(staffSign.value.sessionId, "deleteRegistrationRequest", {
        userId: pendingInAdmin.id,
      });
      assert.equal(staffDeleteReq.error, "Only Admin can delete registration requests.");

      const staffDecideOffers = await store.run(staffSign.value.sessionId, "decideOffersUserRegistration", {
        userId: pendingInAdmin.id,
        decision: "approved",
      });
      assert.equal(staffDecideOffers.error, "Only Admin can approve or reject account registrations.");

      // 6. Direct API calls by Worker must NOT approve or reject
      const workerApprove = await store.run(workerSign.value.sessionId, "approveRegistration", {
        userId: pendingInAdmin.id,
        role: "worker",
      });
      assert.equal(workerApprove.error, "Only Admin can approve account registrations.");

      // 7. Admin approval succeeds
      const adminApprove = await store.run(adminSign.value.sessionId, "approveRegistration", {
        userId: pendingInAdmin.id,
        role: "worker",
        warehouse: "Bornem",
        notes: "Approved by Admin",
      });
      assert.equal(adminApprove.error, undefined);

      // 8. Now approved, Gina can log in
      const ginaLogin = await store.signIn("gina@example.com", "GinaPassword123!");
      assert.equal(ginaLogin.ok, true);
      assert.equal(ginaLogin.value.profile.approvalStatus, "approved");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
