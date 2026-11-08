import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createLocalAdapter } from "../../domain/local-adapter.ts";
import { detectFileType, MAX_FILE_SIZE_BYTES } from "../security/file-validation.ts";
import { cleanupExpiredPendingUploads } from "../../domain/commands.ts";
import { can, type AuthUser } from "./permissions.ts";
import { signedFileUrl, fileSignatureMatches } from "../../domain/files.ts";

const now = "2026-10-22T08:00:00.000Z";
const reference = JSON.stringify({
  warehouses: [
    { name: "Bremen", country: "Germany" },
    { name: "Turnhout", country: "Belgium" },
    { name: "Spain", country: "Spain" },
  ],
  companies: [
    { name: "North Mill", kind: "supplier" },
    { name: "Meridian Packaging", kind: "customer" },
    { name: "Atlas Logistics", kind: "customer" },
  ],
  materials: [
    { materialNumber: "LDPE", description: "LDPE film", unit: "kg", lowStockThresholdKg: 25 },
  ],
  packagingTypes: [
    { name: "Normal Pallet", tareKg: 25 },
  ],
});

function env(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    STOCKFLOW_OWNER_EMAIL: "owner@example.com",
    STOCKFLOW_OWNER_NAME: "Ada Owner",
    STOCKFLOW_OWNER_PASSWORD: "owner-pass-1",
    STOCKFLOW_REFERENCE_JSON: reference,
    STOCKFLOW_FILE_SECRET: "test-file-token-secret-for-signing-tests-only-32chars",
  };
}

function setup() {
  const dir = mkdtempSync(path.join(tmpdir(), "stockflow-upload-"));
  const file = path.join(dir, "store.json");
  const store = createLocalAdapter(file, env(), () => now);
  return { store, dir, services: store.services() };
}

// Sample file buffers
const validJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
const validPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const validWebp = Buffer.concat([
  Buffer.from([0x52, 0x49, 0x46, 0x46]),
  Buffer.from([0x20, 0x00, 0x00, 0x00]),
  Buffer.from([0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38]),
]);
const validGif = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00]);
const validPdf = Buffer.from("%PDF-1.4 sample pdf content for upload test");
const fakeJpegWithExeHeader = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]); // MZ executable header
const plainTextFile = Buffer.from("Hello world, this is a plain text file pretending to be an image.");

test("1. Magic byte detection correctly identifies and validates genuine file types", () => {
  const jpegResult = detectFileType(validJpeg);
  assert.equal(jpegResult.valid, true);
  assert.equal(jpegResult.mime, "image/jpeg");
  assert.equal(jpegResult.ext, "jpg");

  const pngResult = detectFileType(validPng);
  assert.equal(pngResult.valid, true);
  assert.equal(pngResult.mime, "image/png");
  assert.equal(pngResult.ext, "png");

  const webpResult = detectFileType(validWebp);
  assert.equal(webpResult.valid, true);
  assert.equal(webpResult.mime, "image/webp");
  assert.equal(webpResult.ext, "webp");

  const gifResult = detectFileType(validGif);
  assert.equal(gifResult.valid, true);
  assert.equal(gifResult.mime, "image/gif");
  assert.equal(gifResult.ext, "gif");

  const pdfResult = detectFileType(validPdf);
  assert.equal(pdfResult.valid, true);
  assert.equal(pdfResult.mime, "application/pdf");
  assert.equal(pdfResult.ext, "pdf");
});

test("2. File validation rejects spoofed extensions and unsupported content types", () => {
  // Executable header disguised as image
  const fakeExe = detectFileType(fakeJpegWithExeHeader);
  assert.equal(fakeExe.valid, false);
  assert.match(fakeExe.error ?? "", /Real file type does not match supported formats/);

  // Plain text disguised as PDF
  const fakePdf = detectFileType(plainTextFile);
  assert.equal(fakePdf.valid, false);
  assert.match(fakePdf.error ?? "", /Real file type does not match supported formats/);

  // Empty buffer
  const empty = detectFileType(Buffer.alloc(0));
  assert.equal(empty.valid, false);
  assert.match(empty.error ?? "", /is empty/);
});

test("3. Upload interface enforces 10 MB limit on server", async () => {
  const { store, dir, services } = setup();
  try {
    const ownerAuth = await store.signIn("owner@example.com", "owner-pass-1");
    assert.equal(ownerAuth.ok, true);
    if (!ownerAuth.ok) return;

    await store.run(ownerAuth.value.sessionId, "addUser", {
      name: "Upload Worker",
      email: "uploader@example.com",
      role: "worker",
      warehouse: "Bremen",
      password: "uploader-pass-1",
    });
    const worker = (await store.snapshot()).users.find((u) => u.email === "uploader@example.com")!;
    assert.ok(worker);

    // Over 10 MB
    const tooLargeBytes = MAX_FILE_SIZE_BYTES + 1;
    const targetResult = await services.files.createUploadTarget({
      actorId: worker.id,
      kind: "photo",
      filename: "huge-photo.jpg",
      mime: "image/jpeg",
      byteSize: tooLargeBytes,
      warehouse: "Bremen",
    });

    assert.equal(targetResult.ok, false);
    assert.match(targetResult.error ?? "", /exceeds 10 MB limit/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("4. Pending upload creation and atomic claiming on request submission", async () => {
  const { store, dir, services } = setup();
  try {
    const ownerAuth = await store.signIn("owner@example.com", "owner-pass-1");
    assert.equal(ownerAuth.ok, true);
    if (!ownerAuth.ok) return;

    const addWorker = await store.run(ownerAuth.value.sessionId, "addUser", {
      name: "Bruno Worker",
      email: "bruno@example.com",
      role: "worker",
      warehouse: "Bremen",
      password: "bruno-pass-1",
    });
    assert.equal(addWorker.error, undefined);

    const snapUsers = await store.snapshot();
    const worker = snapUsers.users.find((u) => u.email === "bruno@example.com")!;
    assert.ok(worker);

    const workerAuth = await store.signIn("bruno@example.com", "bruno-pass-1");
    assert.equal(workerAuth.ok, true);
    if (!workerAuth.ok) return;

    // 1. Worker uploads photo before request exists -> pending upload
    const target = await services.files.createUploadTarget({
      actorId: worker.id,
      kind: "photo",
      filename: "cargo-seal.jpg",
      mime: "image/jpeg",
      byteSize: validJpeg.length,
      warehouse: "Bremen",
    });
    assert.equal(target.ok, true);
    if (!target.ok) return;
    assert.equal(target.value.fileId.length > 0, true);

    // Confirm upload with valid jpeg bytes
    const confirmed = await services.files.confirmUpload({
      actorId: worker.id,
      fileId: target.value.fileId,
      bytesBase64: validJpeg.toString("base64"),
    });
    assert.equal(confirmed.ok, true);
    if (!confirmed.ok) return;
    assert.equal(confirmed.value.status, "pending");
    assert.equal(confirmed.value.requestId, null);
    assert.equal(confirmed.value.requestNumber, null);

    // Register an inbound container to submit request against
    const inbound = await store.run(workerAuth.value.sessionId, "addInbound", {
      number: "IN-2026-001",
      po: "PO-777",
      supplier: "North Mill",
      warehouse: "Bremen",
    });
    assert.equal(inbound.error, undefined);

    // 2. Submit request: claims the pending photo in atomic step
    const createReq = await store.run(workerAuth.value.sessionId, "createRequest", {
      shipment: "IN-2026-001",
      direction: "inbound",
    });
    assert.equal(createReq.error, undefined);
    assert.match(createReq.notice ?? "", /Request REQ-2026-\d{4}/);

    // Verify photo is now active and tied to the new request
    const snap = await store.snapshot();
    const claimedPhoto = snap.documents.find((d) => d.id === target.value.fileId);
    assert.ok(claimedPhoto);
    assert.equal(claimedPhoto.status, "active");
    assert.ok(claimedPhoto.requestId);
    assert.match(claimedPhoto.requestNumber ?? "", /^REQ-2026-\d{4}$/);
    assert.equal(claimedPhoto.originalFilename, "cargo-seal.jpg");
    assert.match(claimedPhoto.readableName ?? "", new RegExp(`${claimedPhoto.requestNumber}_PHOTO_1\\.jpg`));
    assert.match(claimedPhoto.storageKey, new RegExp(`^photo/${claimedPhoto.requestNumber}/`));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("5. A request cannot be submitted without at least one photo", async () => {
  const { store, dir } = setup();
  try {
    const ownerAuth = await store.signIn("owner@example.com", "owner-pass-1");
    assert.equal(ownerAuth.ok, true);
    if (!ownerAuth.ok) return;

    const addWorker = await store.run(ownerAuth.value.sessionId, "addUser", {
      name: "Claire Worker",
      email: "claire@example.com",
      role: "worker",
      warehouse: "Bremen",
      password: "claire-pass-1",
    });
    assert.equal(addWorker.error, undefined);

    const snapUsers = await store.snapshot();
    const worker = snapUsers.users.find((u) => u.email === "claire@example.com")!;
    assert.ok(worker);

    const workerAuth = await store.signIn("claire@example.com", "claire-pass-1");
    assert.equal(workerAuth.ok, true);
    if (!workerAuth.ok) return;

    const inbound = await store.run(workerAuth.value.sessionId, "addInbound", {
      number: "IN-2026-002",
      po: "PO-778",
      supplier: "North Mill",
      warehouse: "Bremen",
    });
    assert.equal(inbound.error, undefined);

    // Attempt submit with 0 photos
    const failSubmit = await store.run(workerAuth.value.sessionId, "createRequest", {
      shipment: "IN-2026-002",
      direction: "inbound",
    });

    assert.equal(Boolean(failSubmit.error), true);
    assert.match(failSubmit.error ?? "", /A request cannot be submitted without at least one photo/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("6. 24-hour expiry of unclaimed pending uploads", async () => {
  const { store, dir, services } = setup();
  try {
    const ownerAuth = await store.signIn("owner@example.com", "owner-pass-1");
    assert.equal(ownerAuth.ok, true);
    if (!ownerAuth.ok) return;

    const addWorker = await store.run(ownerAuth.value.sessionId, "addUser", {
      name: "Dave Worker",
      email: "dave@example.com",
      role: "worker",
      warehouse: "Bremen",
      password: "dave-pass-1",
    });
    assert.equal(addWorker.error, undefined);

    const snapUsers = await store.snapshot();
    const worker = snapUsers.users.find((u) => u.email === "dave@example.com")!;
    assert.ok(worker);

    // Create pending upload at T0
    const target = await services.files.createUploadTarget({
      actorId: worker.id,
      kind: "photo",
      filename: "old-upload.jpg",
      mime: "image/jpeg",
      byteSize: validJpeg.length,
      warehouse: "Bremen",
    });
    assert.equal(target.ok, true);
    if (!target.ok) return;

    await services.files.confirmUpload({
      actorId: worker.id,
      fileId: target.value.fileId,
      bytesBase64: validJpeg.toString("base64"),
    });

    // Check at T0 + 10 hours: not pruned
    const tenHoursLater = new Date(Date.parse(now) + 10 * 60 * 60 * 1000).toISOString();
    const snap1 = await store.snapshot();
    cleanupExpiredPendingUploads(snap1, tenHoursLater);
    assert.equal(snap1.documents.some((d) => d.id === target.value.fileId), true);

    // Check at T0 + 25 hours: pruned
    const twentyFiveHoursLater = new Date(Date.parse(now) + 25 * 60 * 60 * 1000).toISOString();
    const snap2 = await store.snapshot();
    const prunedCount = cleanupExpiredPendingUploads(snap2, twentyFiveHoursLater);
    assert.equal(prunedCount, 1);
    assert.equal(snap2.documents.some((d) => d.id === target.value.fileId), false);
    assert.equal(snap2.blobs.some((b) => b.key === target.value.fileId), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("7. Permission matrix for files (Worker, Manager, Owner, Customer)", () => {
  const workerBremen: AuthUser = {
    id: "worker-1",
    name: "Worker Bremen",
    email: "wb@example.com",
    role: "worker",
    warehouseId: "wh-bremen",
    warehouse: "Bremen",
    companyId: null,
    company: null,
    active: true,
  };

  const manager: AuthUser = {
    id: "manager-1",
    name: "Mona Manager",
    email: "manager@example.com",
    role: "manager",
    warehouseId: null,
    warehouse: null,
    companyId: null,
    company: null,
    active: true,
  };

  const customerMeridian: AuthUser = {
    id: "customer-1",
    name: "Customer Meridian",
    email: "customer@meridian.com",
    role: "customer",
    warehouseId: null,
    warehouse: null,
    companyId: "comp-meridian",
    company: "Meridian Packaging",
    active: true,
  };

  const owner: AuthUser = {
    id: "owner-1",
    name: "Ada Owner",
    email: "owner@example.com",
    role: "owner",
    warehouseId: null,
    warehouse: null,
    companyId: null,
    company: null,
    active: true,
  };

  // 1. Worker upload permissions
  assert.equal(can(workerBremen, "file:upload", { warehouse: "Bremen" }), true);
  assert.equal(can(workerBremen, "file:upload", { warehouse: "Spain" }), false);

  // 2. Worker delete permissions (own uploads in own warehouse only)
  assert.equal(can(workerBremen, "file:delete", { warehouse: "Bremen", createdBy: "worker-1" }), true);
  assert.equal(can(workerBremen, "file:delete", { warehouse: "Bremen", createdBy: "other-worker" }), false);
  assert.equal(can(workerBremen, "file:delete", { warehouse: "Spain", createdBy: "worker-1" }), false);

  // 3. Staff (manager) file view permissions: can view operational files across all warehouses
  assert.equal(can(manager, "file:view", { requestStatus: "approved" }), true);
  assert.equal(can(manager, "file:view", { requestStatus: "completed" }), true);
  assert.equal(can(manager, "file:view", { requestStatus: "submitted" }), true);

  // 4. Legacy Customer role is inactive and denied all file access
  assert.equal(can(customerMeridian, "file:view", { companyId: "comp-meridian" }), false);
  assert.equal(can(customerMeridian, "file:view", { companyId: "comp-atlas" }), false);

  // 5. Owner file permissions: views all operational documents/images, cannot upload or delete
  assert.equal(can(owner, "file:view", {}), true);
  assert.equal(can(owner, "file:upload", {}), false);
  assert.equal(can(owner, "file:delete", {}), false);
});

test("8. Time-limited signed URLs correctly verify and reject expired/tampered tokens", () => {
  const fileKey = "photo/REQ-2026-0001/1729584000-doc1.jpg";
  const secret = "test-file-token-secret-for-signing-tests-only-32chars";
  const testNow = "2026-10-22T08:00:00.000Z";
  const nowMs = Date.parse(testNow);

  // Valid token valid for 300 seconds
  const signed = signedFileUrl(secret, fileKey, testNow, 300);
  assert.match(signed.url, /^\/api\/files\//);

  const parsed = new URL(signed.url, "http://localhost");
  const exp = parsed.searchParams.get("exp")!;
  const sig = parsed.searchParams.get("sig")!;

  // 1. Valid signature and not expired
  assert.equal(fileSignatureMatches(secret, fileKey, exp, sig, nowMs), true);

  // 2. Tampered signature rejected
  const tamperedSig = sig.slice(0, -2) + "00";
  assert.equal(fileSignatureMatches(secret, fileKey, exp, tamperedSig, nowMs), false);

  // 3. Expired token rejected (checked at nowMs + 400 seconds)
  assert.equal(fileSignatureMatches(secret, fileKey, exp, sig, nowMs + 400 * 1000), false);
});

test("9. File audit log entries are generated for every upload and delete", async () => {
  const { store, dir, services } = setup();
  try {
    const ownerAuth = await store.signIn("owner@example.com", "owner-pass-1");
    assert.equal(ownerAuth.ok, true);
    if (!ownerAuth.ok) return;

    const addWorker = await store.run(ownerAuth.value.sessionId, "addUser", {
      name: "Eva Worker",
      email: "eva@example.com",
      role: "worker",
      warehouse: "Bremen",
      password: "eva-pass-1",
    });
    assert.equal(addWorker.error, undefined);

    const snapUsers = await store.snapshot();
    const worker = snapUsers.users.find((u) => u.email === "eva@example.com")!;
    assert.ok(worker);

    // 1. Upload photo
    const target = await services.files.createUploadTarget({
      actorId: worker.id,
      kind: "photo",
      filename: "test-audit.jpg",
      mime: "image/jpeg",
      byteSize: validJpeg.length,
      warehouse: "Bremen",
    });
    assert.equal(target.ok, true);
    if (!target.ok) return;

    await services.files.confirmUpload({
      actorId: worker.id,
      fileId: target.value.fileId,
      bytesBase64: validJpeg.toString("base64"),
    });

    const snap1 = await store.snapshot();
    const uploadAudit = snap1.auditLog.find((a) => a.action === "file-uploaded" && a.targetId === target.value.fileId);
    assert.equal(Boolean(uploadAudit), true);
    assert.equal(uploadAudit?.userId, worker.id);

    // 2. Delete photo
    const deleteResult = await services.files.delete(target.value.fileId);
    assert.equal(deleteResult.ok, true);

    const snap2 = await store.snapshot();
    const deleteAudit = snap2.auditLog.find((a) => a.action === "file-deleted" && a.targetId === target.value.fileId);
    assert.equal(Boolean(deleteAudit), true);
    assert.equal(deleteAudit?.userId, worker.id);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
