import type { Result } from "../../domain/result.ts";
import { getSupabaseConfig, type SupabaseConfig } from "./config.ts";

export type FetchLike = typeof fetch;

export type SupabaseAuthSession = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: {
    id: string;
    email?: string;
  };
};

function extractErrorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;
  const record = body as Record<string, unknown>;
  for (const key of ["message", "error_description", "msg", "error", "details"]) {
    const val = record[key];
    if (typeof val === "string" && val.trim().length > 0) {
      return val.trim();
    }
  }
  return fallback;
}

export class SupabaseRestClient {
  readonly config: SupabaseConfig;
  private readonly fetchImpl: FetchLike;

  constructor(config: SupabaseConfig, fetchImpl: FetchLike = fetch) {
    this.config = config;
    this.fetchImpl = fetchImpl;
  }

  private headers(accessToken?: string | null, extra?: Record<string, string>, useServiceRole = false): Record<string, string> {
    const apiKey = useServiceRole
      ? this.config.serviceRoleKey ?? this.config.anonKey
      : this.config.anonKey;
    const bearer = useServiceRole
      ? this.config.serviceRoleKey ?? accessToken ?? this.config.anonKey
      : accessToken || this.config.anonKey;

    return {
      apikey: apiKey,
      Authorization: `Bearer ${bearer}`,
      "Content-Type": "application/json",
      ...extra,
    };
  }

  async select<T>(table: string, query = "select=*", accessToken?: string | null): Promise<Result<T[]>> {
    const qs = query.startsWith("?") ? query.slice(1) : query;
    const url = `${this.config.url}/rest/v1/${encodeURIComponent(table)}${qs ? `?${qs}` : ""}`;
    try {
      const response = await this.fetchImpl(url, {
        method: "GET",
        headers: this.headers(accessToken),
        cache: "no-store",
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        return { ok: false, error: extractErrorMessage(data, `Failed to read ${table} (${response.status}).`) };
      }
      return { ok: true, value: Array.isArray(data) ? (data as T[]) : [] };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : `Network error reading ${table}.` };
    }
  }

  async insert<T>(
    table: string,
    payload: unknown,
    accessToken?: string | null,
    options?: { upsert?: boolean; onConflict?: string; useServiceRole?: boolean },
  ): Promise<Result<T>> {
    const qs = options?.onConflict ? `?on_conflict=${encodeURIComponent(options.onConflict)}` : "";
    const url = `${this.config.url}/rest/v1/${encodeURIComponent(table)}${qs}`;
    const preferParts = ["return=representation"];
    if (options?.upsert) {
      preferParts.push("resolution=merge-duplicates");
    }
    try {
      const response = await this.fetchImpl(url, {
        method: "POST",
        headers: this.headers(accessToken, { Prefer: preferParts.join(",") }, options?.useServiceRole),
        body: JSON.stringify(payload),
        cache: "no-store",
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        return { ok: false, error: extractErrorMessage(data, `Failed to insert into ${table} (${response.status}).`) };
      }
      const row = Array.isArray(data) ? data[0] : data;
      return { ok: true, value: row as T };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : `Network error inserting into ${table}.` };
    }
  }

  async update<T>(
    table: string,
    filterQuery: string,
    payload: unknown,
    accessToken?: string | null,
    options?: { useServiceRole?: boolean },
  ): Promise<Result<T>> {
    const qs = filterQuery.startsWith("?") ? filterQuery.slice(1) : filterQuery;
    const url = `${this.config.url}/rest/v1/${encodeURIComponent(table)}?${qs}`;
    try {
      const response = await this.fetchImpl(url, {
        method: "PATCH",
        headers: this.headers(accessToken, { Prefer: "return=representation" }, options?.useServiceRole),
        body: JSON.stringify(payload),
        cache: "no-store",
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        return { ok: false, error: extractErrorMessage(data, `Failed to update ${table} (${response.status}).`) };
      }
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) {
        return { ok: false, error: `No matching record updated in ${table}.` };
      }
      return { ok: true, value: row as T };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : `Network error updating ${table}.` };
    }
  }

  async delete(table: string, filterQuery: string, accessToken?: string | null): Promise<Result<void>> {
    const qs = filterQuery.startsWith("?") ? filterQuery.slice(1) : filterQuery;
    const url = `${this.config.url}/rest/v1/${encodeURIComponent(table)}?${qs}`;
    try {
      const response = await this.fetchImpl(url, {
        method: "DELETE",
        headers: this.headers(accessToken),
        cache: "no-store",
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        return { ok: false, error: extractErrorMessage(data, `Failed to delete from ${table} (${response.status}).`) };
      }
      return { ok: true, value: undefined };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : `Network error deleting from ${table}.` };
    }
  }

  async rpc<T>(fnName: string, params: Record<string, unknown>, accessToken?: string | null): Promise<Result<T>> {
    const url = `${this.config.url}/rest/v1/rpc/${encodeURIComponent(fnName)}`;
    try {
      const response = await this.fetchImpl(url, {
        method: "POST",
        headers: this.headers(accessToken),
        body: JSON.stringify(params),
        cache: "no-store",
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        return { ok: false, error: extractErrorMessage(data, `RPC ${fnName} failed (${response.status}).`) };
      }
      const unwrapped = Array.isArray(data) && data.length === 1 ? data[0] : data;
      return { ok: true, value: unwrapped as T };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : `Network error calling RPC ${fnName}.` };
    }
  }

  readonly auth = {
    signInWithPassword: async (email: string, password: string): Promise<Result<SupabaseAuthSession>> => {
      const url = `${this.config.url}/auth/v1/token?grant_type=password`;
      try {
        const response = await this.fetchImpl(url, {
          method: "POST",
          headers: this.headers(null),
          body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
          cache: "no-store",
        });
        const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
        if (!response.ok || !data || typeof data.access_token !== "string") {
          return {
            ok: false,
            error: extractErrorMessage(data, "Email or password did not match an active account."),
          };
        }
        const userObj = (data.user ?? {}) as Record<string, unknown>;
        return {
          ok: true,
          value: {
            accessToken: data.access_token,
            refreshToken: typeof data.refresh_token === "string" ? data.refresh_token : "",
            expiresIn: typeof data.expires_in === "number" ? data.expires_in : 3600,
            user: {
              id: typeof userObj.id === "string" ? userObj.id : "",
              email: typeof userObj.email === "string" ? userObj.email : email,
            },
          },
        };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : "Authentication request failed." };
      }
    },

    signOut: async (accessToken: string): Promise<void> => {
      const url = `${this.config.url}/auth/v1/logout`;
      try {
        await this.fetchImpl(url, {
          method: "POST",
          headers: this.headers(accessToken),
          cache: "no-store",
        });
      } catch {
        // Ignore network errors on sign-out cleanup
      }
    },

    getUser: async (accessToken: string): Promise<Result<{ id: string; email: string }>> => {
      const url = `${this.config.url}/auth/v1/user`;
      try {
        const response = await this.fetchImpl(url, {
          method: "GET",
          headers: this.headers(accessToken),
          cache: "no-store",
        });
        const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
        if (!response.ok || !data || typeof data.id !== "string") {
          return { ok: false, error: extractErrorMessage(data, "Invalid or expired session.") };
        }
        return {
          ok: true,
          value: {
            id: data.id,
            email: typeof data.email === "string" ? data.email : "",
          },
        };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : "Failed to verify user session." };
      }
    },

    adminCreateUser: async (input: {
      email: string;
      password: string;
      name: string;
      role: string;
    }): Promise<Result<{ id: string; email: string }>> => {
      if (!this.config.serviceRoleKey) {
        return {
          ok: false,
          error: "SUPABASE_SERVICE_ROLE_KEY is required on the server to provision Auth users.",
        };
      }
      const url = `${this.config.url}/auth/v1/admin/users`;
      try {
        const response = await this.fetchImpl(url, {
          method: "POST",
          headers: this.headers(null, undefined, true),
          body: JSON.stringify({
            email: input.email.trim().toLowerCase(),
            password: input.password,
            email_confirm: true,
            user_metadata: { name: input.name, role: input.role },
          }),
          cache: "no-store",
        });
        const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
        if (!response.ok || !data || typeof data.id !== "string") {
          return { ok: false, error: extractErrorMessage(data, "Failed to create Supabase Auth user.") };
        }
        return {
          ok: true,
          value: {
            id: data.id,
            email: typeof data.email === "string" ? data.email : input.email,
          },
        };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : "Failed to provision Auth user." };
      }
    },
  };

  readonly storage = {
    upload: async (
      path: string,
      bytes: Buffer | Uint8Array,
      mime: string,
      accessToken?: string | null,
    ): Promise<Result<{ key: string }>> => {
      const cleanPath = path.replace(/^\/+/, "");
      const url = `${this.config.url}/storage/v1/object/${encodeURIComponent(this.config.storageBucket)}/${cleanPath}`;
      try {
        const response = await this.fetchImpl(url, {
          method: "POST",
          headers: {
            ...this.headers(accessToken, {
              "Content-Type": mime || "application/octet-stream",
              "x-upsert": "true",
            }),
          },
          body: Buffer.from(bytes),
          cache: "no-store",
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          return { ok: false, error: extractErrorMessage(data, `Storage upload failed (${response.status}).`) };
        }
        return { ok: true, value: { key: cleanPath } };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : "Storage upload network error." };
      }
    },

    download: async (
      path: string,
      accessToken?: string | null,
    ): Promise<Result<{ bytes: Buffer; mime: string }>> => {
      const cleanPath = path.replace(/^\/+/, "");
      const url = `${this.config.url}/storage/v1/object/authenticated/${encodeURIComponent(this.config.storageBucket)}/${cleanPath}`;
      try {
        const response = await this.fetchImpl(url, {
          method: "GET",
          headers: this.headers(accessToken),
          cache: "no-store",
        });
        if (!response.ok) {
          return { ok: false, error: `Storage download failed (${response.status}).` };
        }
        const arrayBuf = await response.arrayBuffer();
        return {
          ok: true,
          value: {
            bytes: Buffer.from(arrayBuf),
            mime: response.headers.get("content-type") || "application/octet-stream",
          },
        };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : "Storage download network error." };
      }
    },

    createSignedUrl: async (
      path: string,
      expiresInSeconds: number,
      accessToken?: string | null,
    ): Promise<Result<{ url: string; expiresAt: string }>> => {
      const cleanPath = path.replace(/^\/+/, "");
      const url = `${this.config.url}/storage/v1/object/sign/${encodeURIComponent(this.config.storageBucket)}/${cleanPath}`;
      try {
        const response = await this.fetchImpl(url, {
          method: "POST",
          headers: this.headers(accessToken),
          body: JSON.stringify({ expiresIn: expiresInSeconds }),
          cache: "no-store",
        });
        const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
        if (!response.ok || !data || typeof data.signedURL !== "string") {
          return { ok: false, error: extractErrorMessage(data, "Failed to create signed URL.") };
        }
        const fullUrl = data.signedURL.startsWith("http")
          ? data.signedURL
          : `${this.config.url}/storage/v1${data.signedURL}`;
        const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();
        return { ok: true, value: { url: fullUrl, expiresAt } };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : "Failed to sign storage URL." };
      }
    },

    remove: async (paths: string[], accessToken?: string | null): Promise<Result<void>> => {
      const url = `${this.config.url}/storage/v1/object/${encodeURIComponent(this.config.storageBucket)}`;
      try {
        const response = await this.fetchImpl(url, {
          method: "DELETE",
          headers: this.headers(accessToken),
          body: JSON.stringify({ prefixes: paths.map((p) => p.replace(/^\/+/, "")) }),
          cache: "no-store",
        });
        if (!response.ok) {
          const data = await response.json().catch(() => null);
          return { ok: false, error: extractErrorMessage(data, `Storage delete failed (${response.status}).`) };
        }
        return { ok: true, value: undefined };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : "Storage delete network error." };
      }
    },
  };
}

export function createSupabaseRestClient(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: FetchLike = fetch,
): SupabaseRestClient {
  return new SupabaseRestClient(getSupabaseConfig(env), fetchImpl);
}

