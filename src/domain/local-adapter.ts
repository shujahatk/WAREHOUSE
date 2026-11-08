/**
 * TEMPORARY: Compatibility wrapper for LocalAdapter.
 * In Phase 10, this will be removed and replaced by the SupabaseAdapter.
 */
export * from "../lib/data/local-adapter.ts";
import { getDataAdapter } from "../lib/data/local-adapter.ts";
export const getAdapter = getDataAdapter;
