export type DataAdapterMode = "local" | "supabase";

export type SupabaseConfig = {
  url: string;
  anonKey: string;
  serviceRoleKey: string | null;
  storageBucket: string;
};

export function getDataAdapterMode(env: NodeJS.ProcessEnv = process.env): DataAdapterMode {
  const raw = env.STOCKFLOW_DATA_ADAPTER?.trim().toLowerCase();
  if (raw === "supabase") {
    return "supabase";
  }
  return "local";
}

export function getSupabaseConfig(env: NodeJS.ProcessEnv = process.env): SupabaseConfig {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, "") ?? "";
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim() || null;
  const storageBucket = env.SUPABASE_STORAGE_BUCKET?.trim() || "stockflow-files";

  if (!url || !anonKey) {
    throw new Error(
      "Supabase configuration is incomplete. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  return {
    url,
    anonKey,
    serviceRoleKey,
    storageBucket,
  };
}

