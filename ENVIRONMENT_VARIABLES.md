# StockFlow — Environment Variables Reference

This document provides a comprehensive guide to all configuration variables utilized by the StockFlow platform.

---

## 1. Core Platform Variables

### `STOCKFLOW_DATA_ADAPTER`
- **Description**: Determines the active data access layer.
- **Allowed Values**:
  - `supabase` (Required for production and live database deployments)
  - `local` (Used for deterministic offline unit tests and isolated CI environments)
- **Required**: Yes
- **Default**: `local` (if omitted in non-production)

---

## 2. Supabase Cloud Configuration

### `NEXT_PUBLIC_SUPABASE_URL`
- **Description**: The public HTTPS endpoint of your Supabase project instance.
- **Example**: `https://dyluiydjzbmrhzgpaxqq.supabase.co`
- **Required**: Yes (when `STOCKFLOW_DATA_ADAPTER=supabase`)

### `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **Description**: The public anonymous client API key used for authenticated user requests with Bearer JWTs.
- **Required**: Yes (when `STOCKFLOW_DATA_ADAPTER=supabase`)

### `SUPABASE_SERVICE_ROLE_KEY`
- **Description**: The privileged administrative service role key for system-level migrations and user management.
- **Security**: **Strictly private**. Never expose to client bundles or browser code.
- **Required**: Optional (for backend admin operations).

### `SUPABASE_STORAGE_BUCKET`
- **Description**: The name of the private Supabase storage bucket used for operational evidence, CMR documents, and lab certificates.
- **Default**: `stockflow-files`
- **Required**: Yes

---

## 3. Initial Owner Bootstrap Configuration

When the application connects to a newly provisioned database, it automatically ensures a root Administrator account exists:

### `STOCKFLOW_OWNER_EMAIL`
- **Description**: Email address of the primary executive/system owner.
- **Example**: `admin@stockflow.com`
- **Required**: Yes

### `STOCKFLOW_OWNER_NAME`
- **Description**: Full display name of the primary administrator.
- **Example**: `"Admin Owner"`
- **Required**: Yes

### `STOCKFLOW_OWNER_PASSWORD`
- **Description**: Initial password assigned to the root administrator.
- **Security**: Must be at least 8 characters long with uppercase, lowercase, and special characters.
- **Required**: Yes

---

## 4. Local & Offline Mode Variables

### `STOCKFLOW_STORE_PATH`
- **Description**: Filesystem directory path for storing the JSON operational snapshot when running with `STOCKFLOW_DATA_ADAPTER=local`.
- **Default**: `.stockflow-data/store.json`
- **Required**: No (only used in local adapter mode)

---

## 5. Summary Table

| Variable | Public/Server | Production Default | Description |
| :--- | :---: | :--- | :--- |
| `STOCKFLOW_DATA_ADAPTER` | Server | `supabase` | Adapter engine selection |
| `NEXT_PUBLIC_SUPABASE_URL` | Public | `https://*.supabase.co` | Supabase API endpoint |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | *Client JWT Key* | Supabase client access key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server | *Confidential* | Supabase superuser key |
| `SUPABASE_STORAGE_BUCKET` | Server | `stockflow-files` | Document storage bucket |
| `STOCKFLOW_OWNER_EMAIL` | Server | `admin@stockflow.com` | Root admin email |
| `STOCKFLOW_OWNER_NAME` | Server | `"Admin Owner"` | Root admin name |
| `STOCKFLOW_OWNER_PASSWORD` | Server | *Secure Password* | Initial root admin password |
