/**
 * Server-side file content validation using magic bytes.
 * Never trust client-provided Content-Type or file extensions alone.
 */

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB limit

export type DetectedFileType = {
  valid: boolean;
  mime: string;
  ext: string;
  error?: string;
};

/**
 * Inspects binary buffer headers to determine the genuine file type.
 */
export function detectFileType(buffer: Buffer): DetectedFileType {
  if (!buffer || buffer.length === 0) {
    return { valid: false, mime: "", ext: "", error: "File buffer is empty." };
  }

  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      mime: "",
      ext: "",
      error: `File size exceeds the 10 MB limit (${(buffer.length / (1024 * 1024)).toFixed(1)} MB).`,
    };
  }

  // 1. JPEG: starts with FF D8 FF
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return { valid: true, mime: "image/jpeg", ext: "jpg" };
  }

  // 2. PNG: starts with 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { valid: true, mime: "image/png", ext: "png" };
  }

  // 3. WebP: RIFF at 0..3 and WEBP at 8..11
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return { valid: true, mime: "image/webp", ext: "webp" };
  }

  // 4. GIF: GIF87a or GIF89a
  if (
    buffer.length >= 6 &&
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38 &&
    (buffer[4] === 0x37 || buffer[4] === 0x39) &&
    buffer[5] === 0x61
  ) {
    return { valid: true, mime: "image/gif", ext: "gif" };
  }

  // 5. PDF: %PDF- (0x25 0x50 0x44 0x46 0x2D)
  if (
    buffer.length >= 5 &&
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46 &&
    buffer[4] === 0x2d
  ) {
    return { valid: true, mime: "application/pdf", ext: "pdf" };
  }

  return {
    valid: false,
    mime: "",
    ext: "",
    error: "Invalid file content. Real file type does not match supported formats (JPEG, PNG, WebP, GIF, PDF).",
  };
}
