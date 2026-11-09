import { createSupabaseRestClient, type FetchLike, type SupabaseRestClient } from "./client.ts";

export const SESSION_COOKIE_NAME = "stockflow_session";

export function createServerSupabaseClient(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: FetchLike = fetch,
): SupabaseRestClient {
  return createSupabaseRestClient(env, fetchImpl);
}

