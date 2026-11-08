/**
 * Upload retry helper with exponential backoff and jitter.
 * Retries transient failures when uploading files (photos, CMR, documents).
 */

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  onRetry?: (attempt: number, maxRetries: number, error: unknown) => void;
}

export async function uploadWithRetry<T>(
  uploadFn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelayMs = 400,
    maxDelayMs = 3000,
    onRetry,
  } = options;

  let attempt = 0;
  let lastError: unknown;

  while (attempt <= maxRetries) {
    try {
      return await uploadFn();
    } catch (error) {
      lastError = error;
      attempt++;
      if (attempt > maxRetries) {
        break;
      }
      // Exponential backoff with jitter
      const delay = Math.min(
        maxDelayMs,
        initialDelayMs * Math.pow(2, attempt - 1) + Math.random() * 100
      );
      if (onRetry) {
        onRetry(attempt, maxRetries, error);
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("File upload failed after several attempts. Please check your network and try again.");
}
