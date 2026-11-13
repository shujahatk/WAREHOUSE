/**
 * Client-side image compression and document optimization utilities.
 * Longest side 1920 px, JPEG quality 0.78, EXIF orientation preserved, 10 MB max.
 * Skips unnecessary recompression for already small/optimized images and preserves PDF integrity.
 */

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_IMAGE_DIMENSION = 1920;
export const IMAGE_COMPRESSION_QUALITY = 0.78;
export const SKIP_RECOMPRESSION_BYTES = 200 * 1024; // 200 KB

export interface OptimizedFileResult {
  blob: Blob;
  mime: string;
  name: string;
  size: number;
  originalSize: number;
  wasCompressed: boolean;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export async function fileToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        const comma = result.indexOf(",");
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      } else {
        reject(new Error("Failed to convert file to base64"));
      }
    };
    reader.onerror = () => reject(reader.error || new Error("Failed to read file"));
    reader.readAsDataURL(blob);
  });
}

/**
 * Compresses an image file in the browser before upload, or validates a PDF/document.
 * - Longest side constrained to 1920px, encoded as JPEG quality 0.78.
 * - Preserves EXIF orientation via createImageBitmap({ imageOrientation: "from-image" }) or Image element.
 * - Skips unnecessary recompression when image is already small/optimized.
 * - Validates PDF header without corrupting legal/textual document content.
 */
export async function compressImageIfNeeded(
  file: File
): Promise<OptimizedFileResult> {
  const originalSize = file.size;

  if (originalSize === 0) {
    throw new Error(`File "${file.name}" is empty.`);
  }

  // Non-image files (PDFs, office documents)
  if (!file.type.startsWith("image/")) {
    if (originalSize > MAX_FILE_SIZE_BYTES) {
      throw new Error(`File "${file.name}" exceeds the 10 MB limit.`);
    }

    const isPdf =
      file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (isPdf && typeof file.slice === "function") {
      try {
        const headerSlice = file.slice(0, 5);
        const headerBuf = await headerSlice.arrayBuffer();
        const headerBytes = new Uint8Array(headerBuf);
        const headerStr = String.fromCharCode(...headerBytes);
        if (headerBytes.length >= 4 && !headerStr.startsWith("%PDF")) {
          throw new Error(`File "${file.name}" is not a valid PDF document.`);
        }
      } catch (err) {
        if (err instanceof Error && err.message.includes("not a valid PDF")) {
          throw err;
        }
      }
    }

    return {
      blob: file,
      mime: isPdf ? "application/pdf" : file.type || "application/octet-stream",
      name: file.name,
      size: originalSize,
      originalSize,
      wasCompressed: false,
    };
  }

  // Client-side 10 MB raw limit check for images
  if (originalSize > MAX_FILE_SIZE_BYTES) {
    throw new Error(`Image "${file.name}" exceeds the 10 MB limit.`);
  }

  // In non-browser / test environments without window/document
  if (typeof window === "undefined" || typeof document === "undefined") {
    return {
      blob: file,
      mime: file.type,
      name: file.name,
      size: originalSize,
      originalSize,
      wasCompressed: false,
    };
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      try {
        const origWidth = img.naturalWidth || img.width;
        const origHeight = img.naturalHeight || img.height;
        let width = origWidth;
        let height = origHeight;
        const maxSide = MAX_IMAGE_DIMENSION;

        const needsResize = width > maxSide || height > maxSide;
        if (needsResize) {
          if (width > height) {
            height = Math.round((height * maxSide) / width);
            width = maxSide;
          } else {
            width = Math.round((width * maxSide) / height);
            height = maxSide;
          }
        }

        // Skip unnecessary recompression if image is already within dimensions and small JPEG/WebP
        if (
          !needsResize &&
          originalSize <= SKIP_RECOMPRESSION_BYTES &&
          (file.type === "image/jpeg" || file.type === "image/webp")
        ) {
          resolve({
            blob: file,
            mime: file.type,
            name: file.name,
            size: originalSize,
            originalSize,
            wasCompressed: false,
          });
          return;
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve({
            blob: file,
            mime: file.type,
            name: file.name,
            size: originalSize,
            originalSize,
            wasCompressed: false,
          });
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve({
                blob: file,
                mime: file.type,
                name: file.name,
                size: originalSize,
                originalSize,
                wasCompressed: false,
              });
              return;
            }

            // If not resized and recompression produced a larger file for an existing JPEG/WebP, keep original
            if (
              !needsResize &&
              blob.size >= originalSize &&
              (file.type === "image/jpeg" || file.type === "image/webp")
            ) {
              resolve({
                blob: file,
                mime: file.type,
                name: file.name,
                size: originalSize,
                originalSize,
                wasCompressed: false,
              });
              return;
            }

            const baseName = file.name.replace(/\.[^/.]+$/, "");
            const newName = `${baseName}.jpg`;

            resolve({
              blob,
              mime: "image/jpeg",
              name: newName,
              size: blob.size,
              originalSize,
              wasCompressed: blob.size < originalSize || needsResize,
            });
          },
          "image/jpeg",
          IMAGE_COMPRESSION_QUALITY
        );
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`Failed to load image "${file.name}" for compression.`));
    };

    img.src = objectUrl;
  });
}
