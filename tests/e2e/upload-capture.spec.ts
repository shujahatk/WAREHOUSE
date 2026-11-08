import { test, expect } from "@playwright/test";

// Minimal valid 1x1 JPEG buffer
const VALID_JPEG_BUFFER = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,
  0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
  0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
  0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20, 0x24, 0x2e, 0x27, 0x20,
  0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29, 0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27,
  0x39, 0x3d, 0x38, 0x32, 0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
  0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x1f, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01,
  0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04,
  0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f,
  0x00, 0xbf, 0x00, 0xff, 0xd9,
]);

// Minimal valid PDF buffer
const VALID_PDF_BUFFER = Buffer.from(
  "%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n/Pages 2 0 R\n>>\nendobj\n2 0 obj\n<<\n/Type /Pages\n/Kids [3 0 R]\n/Count 1\n>>\nendobj\n3 0 obj\n<<\n/Type /Page\n/Parent 2 0 R\n/MediaBox [0 0 612 792]\n/Resources <<>>\n>>\nendobj\nxref\n0 4\n0000000000 65535 f \n0000000010 00000 n \n0000000060 00000 n \n0000000117 00000 n \ntrailer\n<<\n/Size 4\n/Root 1 0 R\n>>\nstartxref\n194\n%%EOF"
);

test.describe("Phase 9.5: Easy Capture & Immediate Upload Suite", () => {
  test.describe.configure({ mode: "serial" });

  let savedFileSignedUrl: string = "";
  let containerNumber: string = "";
  let bremenWorkerPassword: string = "";
  let spainWorkerPassword: string = "";

  test.beforeAll(() => {
    containerNumber = `CONT-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  });

  test("1. Owner prepares Workers and inbound shipment for Worker at Bremen warehouse", async ({ page }) => {
    // Sign in as Owner
    await page.context().clearCookies();
    await page.goto("/login");
    await page.fill('input[type="email"]', "owner@example.com");
    await page.fill('input[type="password"]', "owner-pass-1");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/(dashboard|warehouses|containers|users)/);

    // Create Bremen worker and Spain worker on /users
    await page.goto("/users");
    await expect(page.locator("h1")).toContainText("Users");
    await page.locator('label:has-text("Name") input').fill("Bob Worker");
    await page.locator('label:has-text("Email") input').fill("worker@example.com");
    await page.locator('label:has-text("Role") select').first().selectOption("worker");
    await page.locator('label:has-text("Warehouse") select').selectOption("Bremen");
    await page.click('button:has-text("Add user")');
    await expect(page.locator("body")).toContainText(/Bob Worker was added\. Temporary password:/);
    const notice1 = await page.locator("p", { hasText: "Temporary password:" }).textContent();
    bremenWorkerPassword = notice1?.match(/Temporary password:\s*(\S+)/)?.[1] ?? "";
    expect(bremenWorkerPassword.length).toBeGreaterThan(0);

    await page.locator('label:has-text("Name") input').fill("Spain Worker");
    await page.locator('label:has-text("Email") input').fill("spain-worker@example.com");
    await page.locator('label:has-text("Role") select').first().selectOption("worker");
    await page.locator('label:has-text("Warehouse") select').selectOption("Spain");
    await page.click('button:has-text("Add user")');
    await expect(page.locator("body")).toContainText(/Spain Worker was added\. Temporary password:/);
    const notice2 = await page.locator("p", { hasText: "Temporary password:" }).textContent();
    spainWorkerPassword = notice2?.match(/Temporary password:\s*(\S+)/)?.[1] ?? "";
    expect(spainWorkerPassword.length).toBeGreaterThan(0);

    // Sign in as Bremen Worker to create the planned container shipment
    await page.context().clearCookies();
    await page.goto("/login");
    await page.fill('input[type="email"]', "worker@example.com");
    await page.fill('input[type="password"]', bremenWorkerPassword);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/(dashboard|warehouses|containers|tasks|inventory)/);

    // Navigate to containers page and wait for hydration before filling inputs
    await page.goto("/containers");
    await expect(page.locator("h1")).toContainText("Incoming / Unloading");

    // Create planned container shipment
    await page.locator('label:has-text("Container number") input').fill(containerNumber);
    await expect(page.locator('label:has-text("Container number") input')).toHaveValue(containerNumber);
    await page.locator('label:has-text("PO number") input').fill("PO-1");
    await page.locator('label:has-text("Supplier") input').fill("North Mill");
    await page.locator('label:has-text("Warehouse") select').selectOption("Bremen");
    await page.click('button:has-text("Add planned shipment")');

    // Verify container exists on page
    await expect(page.locator("body")).toContainText(containerNumber);
  });

  test("2. Worker mobile-first UploadCapture: camera buttons >=48px, zero photo block, immediate upload", async ({
    page,
  }) => {
    // Clear cookies & sign in as Worker (assigned to Bremen)
    await page.context().clearCookies();
    await page.goto("/login");
    await page.fill('input[type="email"]', "worker@example.com");
    await page.fill('input[type="password"]', bremenWorkerPassword);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/(dashboard|warehouses|containers|tasks|inventory)/);

    // Visit shipment page
    await page.goto(`/containers/${containerNumber}`);
    const requestSection = page.locator("section").filter({ hasText: "Stock Movement Request Workflow" });
    await expect(requestSection).toBeVisible();

    // Verify touch targets >= 48px
    const takePhotoBtn = requestSection.locator("#btn-take-photo");
    const chooseFileBtn = requestSection.locator("#btn-choose-file");
    await expect(takePhotoBtn).toBeVisible();
    await expect(chooseFileBtn).toBeVisible();

    const photoBox = await takePhotoBtn.boundingBox();
    expect(photoBox).not.toBeNull();
    expect(photoBox!.height).toBeGreaterThanOrEqual(48);

    const fileBox = await chooseFileBtn.boundingBox();
    expect(fileBox).not.toBeNull();
    expect(fileBox!.height).toBeGreaterThanOrEqual(48);

    // Requirement: A request cannot be submitted without at least one photo.
    const submitBtn = requestSection.locator('button:has-text("Step 2: Submit request with photos")');
    await submitBtn.click();
    await expect(page.locator("body")).toContainText(/A request cannot be submitted without at least one photo/i);

    // Upload a photo immediately on selection using camera input with capture="environment"
    const cameraInput = requestSection.locator('input[type="file"][capture="environment"]');
    await cameraInput.setInputFiles({
      name: "container_door_seal.jpg",
      mimeType: "image/jpeg",
      buffer: VALID_JPEG_BUFFER,
    });

    // Verify immediate upload feedback: thumbnail & saved badge
    await expect(requestSection).toContainText(/Saved/i, { timeout: 10000 });
    await expect(requestSection.locator('img[alt*="_PHOTO_1"], img[alt*="container_door_seal"]').first()).toBeVisible();

    // Now submit the request atomically claiming the pending photo
    await submitBtn.click();

    // Verify request is created (e.g. REQ-2026-...)
    await expect(requestSection).toContainText(/REQ-2026-/i, { timeout: 10000 });

    // File gallery displays the claimed photo with readable name REQ-..._PHOTO_1.jpg
    await expect(requestSection).toContainText(/_PHOTO_1\.jpg/i);

    // Tap to enlarge / view details panel
    const photoCard = requestSection.locator('[role="button"]').filter({ hasText: "_PHOTO_1.jpg" }).first();
    await photoCard.click();

    // Details panel assertions
    const modal = page.locator('div[role="dialog"]:not([data-nextjs-dialog])');
    await expect(modal).toBeVisible();
    await expect(modal).toContainText(/Bob Worker/i);
    await expect(modal).toContainText(/Bremen/i);
    await expect(modal).toContainText(/photo/i);
    await expect(modal).toContainText(containerNumber);

    // Close details modal
    await page.click('button[aria-label="Close details"]');
    await expect(modal).toBeHidden();
  });

  test("3. Worker uploads PDF document (CMR) and Admin views CMR PDF details drawer & signed URL in read-only mode", async ({ page }) => {
    // Sign in as Bremen Worker to upload CMR PDF
    await page.context().clearCookies();
    await page.goto("/login");
    await page.fill('input[type="email"]', "worker@example.com");
    await page.fill('input[type="password"]', bremenWorkerPassword);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/(dashboard|warehouses|containers|tasks|inventory)/);

    // Navigate to shipment page
    await page.goto(`/containers/${containerNumber}`);

    const cmrSection = page.locator("section").filter({ hasText: "CMR" });
    await expect(cmrSection).toBeVisible();

    // CMR Upload Section
    const cmrFileInput = cmrSection.locator('input[type="file"][accept*="application/pdf"]').first();
    await cmrFileInput.setInputFiles({
      name: "inbound_waybill.pdf",
      mimeType: "application/pdf",
      buffer: VALID_PDF_BUFFER,
    });

    // Verify immediate upload with "Saved" badge
    await expect(cmrSection).toContainText(/Saved/i, { timeout: 10000 });

    // Now sign in as Admin (Owner) and verify Admin can view the CMR PDF and open the details modal in read-only mode
    await page.context().clearCookies();
    await page.goto("/login");
    await page.fill('input[type="email"]', "owner@example.com");
    await page.fill('input[type="password"]', "owner-pass-1");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/(dashboard|warehouses|containers|users)/);

    await page.goto(`/containers/${containerNumber}`);
    const adminCmrSection = page.locator("section").filter({ hasText: "CMR" });
    await expect(adminCmrSection).toBeVisible();
    // Admin must NOT see file upload inputs on CMR section
    await expect(adminCmrSection.locator('input[type="file"]')).toHaveCount(0);

    // Verify Attached CMR Document in FileGallery
    const cmrCard = adminCmrSection.locator('div[role="button"]').first();
    await expect(cmrCard).toBeVisible();
    await expect(cmrCard).toContainText(/PDF/i);

    // Tap CMR card to open details modal
    await cmrCard.click();
    const modal = page.locator('div[role="dialog"]:not([data-nextjs-dialog])');
    await expect(modal).toBeVisible();
    await expect(modal).toContainText(/cmr/i);
    await expect(modal).toContainText(/Bob Worker/i);
    await expect(modal).toContainText(/PDF Document/i);

    // Capture the time-limited signed download link
    const downloadLink = modal.locator('a[href*="/api/files/"]').first();
    await expect(downloadLink).toBeVisible();
    const href = await downloadLink.getAttribute("href");
    expect(href).not.toBeNull();
    savedFileSignedUrl = href!;

    // Close modal
    await page.click('button[aria-label="Close details"]');
  });

  test("4. File endpoint security: unauthenticated 401 and cross-warehouse Worker 403 isolation", async ({
    page,
    request,
  }) => {
    expect(savedFileSignedUrl).toBeTruthy();

    // 1. Unauthenticated request without session cookie returns 401 Unauthorized
    const unauthRes = await request.get(savedFileSignedUrl);
    expect(unauthRes.status()).toBe(401);

    // 2. Clear cookies & sign in as Spain Worker (assigned to Spain, not Bremen)
    await page.context().clearCookies();
    await page.goto("/login");
    await page.fill('input[type="email"]', "spain-worker@example.com");
    await page.fill('input[type="password"]', spainWorkerPassword);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/(dashboard|warehouses|containers|tasks|inventory)/);

    const cookies = await page.context().cookies();
    const sessionCookie = cookies.find((c) => c.name === "stockflow_session")?.value;
    expect(sessionCookie).toBeTruthy();

    // Make an HTTP request to Bremen's file URL with Spain Worker's session cookie -> 403 Forbidden
    const response = await request.get(savedFileSignedUrl, {
      headers: {
        Cookie: `stockflow_session=${sessionCookie}`,
      },
    });

    expect(response.status()).toBe(403);
    const body = await response.text();
    expect(body).toContain("Forbidden: You can only access files from your warehouse.");
  });
});
