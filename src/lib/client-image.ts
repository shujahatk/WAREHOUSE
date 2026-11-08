/**
 * Client-side image compression and file utilities.
 * Longest side 1600 px, JPEG quality 0.8, keep correct orientation, 10 MB max.
 */

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

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
 * Compresses an image file in the browser before upload.
 * If file is not an image (e.g. PDF), it is returned untouched.
 * Longest side is constrained to 1600px, encoded as JPEG quality 0.8.
 */
export async function compressImageIfNeeded(
  file: File
): Promise<{ blob: Blob; mime: string; name: string; size: number }> {
  // If it's a PDF or non-image, validate size and return directly
  if (!file.type.startsWith("image/")) {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new Error(`File "${file.name}" exceeds the 10 MB limit.`);
    }
    return {
      blob: file,
      mime: file.type || "application/octet-stream",
      name: file.name,
      size: file.size,
    };
  }

  // Client-side 10 MB raw limit check
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(`Image "${file.name}" exceeds the 10 MB limit.`);
  }

  // In non-browser / test environments without window/Image
  if (typeof window === "undefined" || typeof document === "undefined") {
    return {
      blob: file,
      mime: file.type,
      name: file.name,
      size: file.size,
    };
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      try {
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;
        const maxSide = 1600;

        if (width > maxSide || height > maxSide) {
          if (width > height) {
            height = Math.round((height * maxSide) / width);
            width = maxSide;
          } else {
            width = Math.round((width * maxSide) / height);
            height = maxSide;
          }
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
            size: file.size,
          });
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve({
                blob: file,
                mime: file.type,
                name: file.name,
                size: file.size,
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
            });
          },
          "image/jpeg",
          0.8
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
