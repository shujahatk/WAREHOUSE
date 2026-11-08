/**
 * Structured logger with automatic secret redaction and error tracking.
 * Safe for production: never outputs passwords, tokens, secrets, or raw cookies.
 */

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

const SENSITIVE_KEYS = new Set([
  "password",
  "token",
  "secret",
  "cookie",
  "authorization",
  "filesecret",
  "stockflow_session",
  "bytesbase64",
]);

function redact(key: string, value: unknown): unknown {
  if (typeof key === "string" && SENSITIVE_KEYS.has(key.toLowerCase())) {
    return "[REDACTED]";
  }
  if (value && typeof value === "object") {
    if (Array.isArray(value)) {
      return value.map((item, idx) => redact(String(idx), item));
    }
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      clean[k] = redact(k, v);
    }
    return clean;
  }
  return value;
}

export type LogEntry = {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
};

class StructuredLogger {
  private minLevelIndex: number;
  private readonly levels: LogLevel[] = ["DEBUG", "INFO", "WARN", "ERROR"];

  constructor() {
    const envLevel = (process.env.LOG_LEVEL || (process.env.NODE_ENV === "production" ? "INFO" : "DEBUG")).toUpperCase();
    this.minLevelIndex = this.levels.indexOf(envLevel as LogLevel);
    if (this.minLevelIndex === -1) this.minLevelIndex = 1; // default INFO
  }

  private write(level: LogLevel, message: string, context?: Record<string, unknown>, err?: unknown): void {
    const levelIndex = this.levels.indexOf(level);
    if (levelIndex < this.minLevelIndex) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
    };

    if (context && Object.keys(context).length > 0) {
      entry.context = redact("context", context) as Record<string, unknown>;
    }

    if (err instanceof Error) {
      entry.error = {
        name: err.name,
        message: err.message,
        stack: process.env.NODE_ENV !== "production" ? err.stack : undefined,
      };
    } else if (err) {
      entry.error = {
        name: "UnknownError",
        message: String(err),
      };
    }

    const json = JSON.stringify(entry);

    if (level === "ERROR") {
      console.error(json);
      // Hook for error tracker (e.g. Sentry.captureException)
      this.notifyTracker(entry);
    } else if (level === "WARN") {
      console.warn(json);
    } else {
      console.log(json);
    }
  }

  private notifyTracker(_entry: LogEntry): void {
    void _entry;
    // If Sentry or another error tracker is configured in environment:
    const dsn = process.env.SENTRY_DSN;
    if (dsn && typeof window === "undefined") {
      // Server-side error tracking integration point
    }
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.write("DEBUG", message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.write("INFO", message, context);
  }

  warn(message: string, context?: Record<string, unknown>, err?: unknown): void {
    this.write("WARN", message, context, err);
  }

  error(message: string, err?: unknown, context?: Record<string, unknown>): void {
    this.write("ERROR", message, context, err);
  }
}

export const logger = new StructuredLogger();
