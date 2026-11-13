"use server";

import { cookies } from "next/headers";
import { getAdapter } from "./local-adapter.ts";

const COOKIE = "stockflow_session";

async function sessionId(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(COOKIE)?.value ?? null;
}

import { checkLoginRateLimit, resetRateLimit } from "@/lib/security/rate-limit";
import { logger } from "@/lib/logger";

export async function signInAction(email: string, password: string): Promise<{ error: string | null }> {
  try {
    const rate = checkLoginRateLimit(email);
    if (!rate.allowed) {
      logger.warn("Sign-in rate limit exceeded", { email });
      return {
        error: `Too many sign-in attempts. Please wait ${rate.retryAfterSeconds} seconds before trying again.`,
      };
    }
    const result = await getAdapter().signIn(email, password);
    if (!result.ok) {
      logger.warn("Sign-in authentication failed", { email, error: result.error });
      return { error: result.error };
    }
    resetRateLimit(`login:${email.trim().toLowerCase()}`);
    logger.info("User signed in successfully", { email, role: result.value.profile.role });
    const jar = await cookies();
    jar.set(COOKIE, result.value.sessionId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 12,
      secure: process.env.NODE_ENV === "production",
    });
    return { error: null };
  } catch (error) {
    logger.error("Sign-in exception", error, { email });
    return { error: error instanceof Error ? error.message : "Sign-in could not reach the warehouse store." };
  }
}

export async function signOutAction(): Promise<void> {
  const jar = await cookies();
  const current = jar.get(COOKIE)?.value;
  if (current) {
    try {
      await getAdapter().signOut(current);
    } catch { }
  }
  jar.set(COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    expires: new Date(0),
    secure: process.env.NODE_ENV === "production",
  });
  jar.delete(COOKIE);
}

export async function loadWorkspace() {
  return getAdapter().view(await sessionId());
}

export async function runCommand(name: string, payload: unknown) {
  return getAdapter().run(await sessionId(), name, payload);
}

import type { UploadTargetMetadata } from "@/lib/data/interfaces";

export async function createUploadTargetAction(
  metadata: Omit<UploadTargetMetadata, "actorId">
) {
  const sid = await sessionId();
  const adapter = getAdapter();
  const current = sid ? await adapter.current(sid) : null;
  if (!current) {
    return { ok: false as const, error: "Sign in again to continue." };
  }
  return adapter.services().files.createUploadTarget({
    ...metadata,
    actorId: current.id,
  });
}

export async function confirmUploadAction(fileId: string, bytesBase64?: string) {
  const sid = await sessionId();
  const adapter = getAdapter();
  const current = sid ? await adapter.current(sid) : null;
  if (!current) {
    return { ok: false as const, error: "Sign in again to continue." };
  }
  return adapter.services().files.confirmUpload({
    fileId,
    bytesBase64,
    actorId: current.id,
  });
}

export async function deleteFileAction(fileId: string) {
  const sid = await sessionId();
  return getAdapter().run(sid, "detachFile", { id: fileId });
}
