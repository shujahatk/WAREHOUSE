/**
 * Adapter selector & compatibility wrapper.
 * Selects LocalAdapter by default or SupabaseAdapter when STOCKFLOW_DATA_ADAPTER=supabase.
 */
export * from "../lib/data/local-adapter.ts";
export * from "../lib/data/supabase-adapter.ts";
import { getDataAdapter } from "../lib/data/local-adapter.ts";
export const getAdapter = getDataAdapter;
