import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.ts';

const { Pool } = pg;

let pool: pg.Pool | null = null;
let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;
let dbAvailable = false;

export async function initDatabase(): Promise<{ connected: boolean; error?: string }> {
  const host = process.env.DB_HOST?.trim();
  const port = Number(process.env.DB_PORT?.trim() || 5432);
  const database = process.env.DB_NAME?.trim();
  const user = process.env.DB_USER?.trim();
  const password = process.env.DB_PASSWORD;
  const sslEnv = process.env.DB_SSL?.trim().toLowerCase();

  if (!host || !database || !user || !password) {
    dbAvailable = false;
    return {
      connected: false,
      error: 'DB_HOST, DB_NAME, DB_USER, or DB_PASSWORD not set; running with in-memory store',
    };
  }

  const useSsl =
    sslEnv === 'false' || host === 'localhost' || host === '127.0.0.1'
      ? false
      : { rejectUnauthorized: false };

  try {
    pool = new Pool({
      host,
      port: Number.isFinite(port) && port > 0 ? port : 5432,
      database,
      user,
      password,
      ssl: useSsl,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 8_000,
    });

    await pool.query('SELECT 1');

    // Bootstrap schema idempotently so fresh PostgreSQL instances work immediately
    await pool.query(`
      CREATE TABLE IF NOT EXISTS eg_users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'Admin',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS eg_workspaces (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        code TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS eg_teams (
        id SERIAL PRIMARY KEY,
        workspace_id INTEGER NOT NULL REFERENCES eg_workspaces(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        lead_email TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS eg_developers (
        id SERIAL PRIMARY KEY,
        workspace_id INTEGER NOT NULL REFERENCES eg_workspaces(id) ON DELETE CASCADE,
        team_id INTEGER NOT NULL REFERENCES eg_teams(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'Developer',
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS eg_datasources (
        id SERIAL PRIMARY KEY,
        workspace_id INTEGER NOT NULL REFERENCES eg_workspaces(id) ON DELETE CASCADE,
        team_id INTEGER,
        name TEXT NOT NULL,
        engine TEXT NOT NULL DEFAULT 'postgresql',
        host TEXT NOT NULL,
        port INTEGER NOT NULL DEFAULT 5432,
        database_name TEXT NOT NULL,
        username TEXT NOT NULL,
        ssl_mode TEXT NOT NULL DEFAULT 'require',
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_by TEXT NOT NULL DEFAULT 'System',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS eg_datasource_objects (
        id SERIAL PRIMARY KEY,
        datasource_id INTEGER NOT NULL REFERENCES eg_datasources(id) ON DELETE CASCADE,
        schema_name TEXT NOT NULL,
        object_name TEXT NOT NULL,
        object_type TEXT NOT NULL,
        columns_json JSONB NOT NULL DEFAULT '[]'::jsonb
      );
      CREATE TABLE IF NOT EXISTS eg_auth_configs (
        id SERIAL PRIMARY KEY,
        workspace_id INTEGER NOT NULL REFERENCES eg_workspaces(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        provider_type TEXT NOT NULL DEFAULT 'Common Auth',
        header_key_name TEXT NOT NULL DEFAULT 'X-CommonAuth-Key',
        header_secret_name TEXT NOT NULL DEFAULT 'X-CommonAuth-Secret',
        default_expired_minutes INTEGER NOT NULL DEFAULT 0,
        description TEXT NOT NULL DEFAULT '',
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS eg_auth_identifiers (
        id SERIAL PRIMARY KEY,
        auth_config_id INTEGER NOT NULL REFERENCES eg_auth_configs(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        api_key TEXT NOT NULL,
        secret_hash TEXT NOT NULL,
        secret_masked TEXT NOT NULL,
        use_plain_secret BOOLEAN NOT NULL DEFAULT FALSE,
        custom_expired_minutes INTEGER,
        expired_at TIMESTAMPTZ,
        scopes_json JSONB NOT NULL DEFAULT '["Read All"]'::jsonb,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        locked BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS eg_collections (
        id SERIAL PRIMARY KEY,
        workspace_id INTEGER NOT NULL REFERENCES eg_workspaces(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        auth_config_id INTEGER,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_by TEXT NOT NULL DEFAULT 'Alex Morgan',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS eg_endpoints (
        id SERIAL PRIMARY KEY,
        collection_id INTEGER NOT NULL REFERENCES eg_collections(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        datasource_id INTEGER NOT NULL,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_by TEXT NOT NULL DEFAULT 'Alex Morgan',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS eg_endpoint_versions (
        id SERIAL PRIMARY KEY,
        endpoint_id INTEGER NOT NULL REFERENCES eg_endpoints(id) ON DELETE CASCADE,
        version_number INTEGER NOT NULL DEFAULT 1,
        version_label TEXT NOT NULL DEFAULT 'Ver.1',
        method TEXT NOT NULL DEFAULT 'POST',
        path_segments_json JSONB NOT NULL DEFAULT '[]'::jsonb,
        path_params_json JSONB NOT NULL DEFAULT '[]'::jsonb,
        headers_json JSONB NOT NULL DEFAULT '[]'::jsonb,
        body_fields_json JSONB NOT NULL DEFAULT '[]'::jsonb,
        db_schema TEXT NOT NULL DEFAULT 'public',
        db_object_name TEXT NOT NULL DEFAULT '',
        db_object_type TEXT NOT NULL DEFAULT 'stored_procedure',
        crud_operation TEXT NOT NULL DEFAULT 'execute_rpc',
        sql_mapping_json JSONB NOT NULL,
        pagination_config_json JSONB NOT NULL,
        status TEXT NOT NULL DEFAULT 'Draft',
        active BOOLEAN NOT NULL DEFAULT TRUE,
        scopes_json JSONB NOT NULL DEFAULT '[]'::jsonb,
        description TEXT NOT NULL DEFAULT '',
        global_profiling BOOLEAN NOT NULL DEFAULT FALSE,
        endpoint_profiling BOOLEAN NOT NULL DEFAULT TRUE,
        rate_limiter_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        rate_limiter_by TEXT NOT NULL DEFAULT 'By IP',
        rate_limiter_max_req INTEGER NOT NULL DEFAULT 60,
        rate_limiter_window TEXT NOT NULL DEFAULT '1m',
        rate_limiter_max_concurrency INTEGER NOT NULL DEFAULT 10,
        circuit_breaker_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        circuit_breaker_failure_threshold INTEGER NOT NULL DEFAULT 50,
        circuit_breaker_timeout_sec INTEGER NOT NULL DEFAULT 30,
        circuit_breaker_fallback_json JSONB NOT NULL DEFAULT '{"status":503,"message":"Service unavailable"}'::jsonb,
        cache_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        cache_ttl_sec INTEGER NOT NULL DEFAULT 60,
        cache_key_strategy TEXT NOT NULL DEFAULT 'path+body',
        use_default_response_format BOOLEAN NOT NULL DEFAULT TRUE,
        sit_version_tag TEXT,
        sit_deployed_at TIMESTAMPTZ,
        sit_deployed_by TEXT,
        prod_version_tag TEXT,
        prod_deployed_at TIMESTAMPTZ,
        prod_deployed_by TEXT,
        created_by TEXT NOT NULL DEFAULT 'Alex Morgan',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS eg_deployments (
        id SERIAL PRIMARY KEY,
        endpoint_id INTEGER NOT NULL,
        endpoint_version_id INTEGER NOT NULL,
        endpoint_name TEXT NOT NULL,
        collection_name TEXT NOT NULL,
        environment TEXT NOT NULL,
        version_tag TEXT NOT NULL,
        deployed_by TEXT NOT NULL,
        deployed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        notes TEXT NOT NULL DEFAULT ''
      );
      CREATE TABLE IF NOT EXISTS eg_request_logs (
        id SERIAL PRIMARY KEY,
        request_key TEXT NOT NULL,
        collection_id INTEGER NOT NULL,
        collection_name TEXT NOT NULL,
        endpoint_id INTEGER NOT NULL,
        endpoint_name TEXT NOT NULL,
        endpoint_version_id INTEGER NOT NULL,
        version_label TEXT NOT NULL,
        datasource_id INTEGER NOT NULL,
        datasource_name TEXT NOT NULL,
        datasource_engine TEXT NOT NULL,
        auth_config_id INTEGER,
        auth_source_label TEXT NOT NULL,
        auth_identifier_label TEXT NOT NULL,
        method TEXT NOT NULL,
        path TEXT NOT NULL,
        status_code INTEGER NOT NULL,
        status_message TEXT NOT NULL,
        duration_ms INTEGER NOT NULL,
        request_headers_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        request_body_json JSONB,
        response_body_json JSONB,
        profiler_steps_json JSONB NOT NULL DEFAULT '[]'::jsonb,
        error_stack TEXT,
        log_category TEXT NOT NULL DEFAULT 'request',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS eg_alert_configs (
        id SERIAL PRIMARY KEY,
        workspace_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        channel TEXT NOT NULL DEFAULT 'Email',
        threshold_error_rate INTEGER NOT NULL DEFAULT 5,
        threshold_latency_ms INTEGER NOT NULL DEFAULT 500,
        target TEXT NOT NULL,
        active BOOLEAN NOT NULL DEFAULT TRUE
      );
      CREATE TABLE IF NOT EXISTS eg_environments (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        base_url TEXT NOT NULL,
        gateway_host TEXT NOT NULL,
        tls_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        auto_promote BOOLEAN NOT NULL DEFAULT FALSE,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- Runtime target schemas, tables, views & functions for live SQL/CRUD/RPC execution
      CREATE SCHEMA IF NOT EXISTS network_management;
      CREATE TABLE IF NOT EXISTS network_management.master_locations (
        id SERIAL PRIMARY KEY,
        location_code VARCHAR(32) NOT NULL UNIQUE,
        location_name VARCHAR(120) NOT NULL,
        location_type VARCHAR(32) NOT NULL,
        parent_location_code VARCHAR(32),
        region_name VARCHAR(64),
        is_active BOOLEAN NOT NULL DEFAULT TRUE
      );
      CREATE OR REPLACE VIEW network_management.vw_active_district_hierarchy AS
        SELECT
          d.location_code AS district_code,
          d.location_name AS district_name,
          COALESCE(c.location_name, 'JAKARTA SELATAN') AS city_name,
          COALESCE(p.location_name, 'DKI JAKARTA') AS province_name,
          'CGK-' || LEFT(REPLACE(d.location_code, '.', ''), 5) AS hub_code
        FROM network_management.master_locations d
        LEFT JOIN network_management.master_locations c ON c.location_code = d.parent_location_code
        LEFT JOIN network_management.master_locations p ON p.location_code = c.parent_location_code
        WHERE d.location_type = 'DISTRICT' AND d.is_active = TRUE;

      CREATE OR REPLACE FUNCTION network_management.sp_master_location_select(
        var_location_type VARCHAR DEFAULT NULL,
        var_parent_location_code VARCHAR DEFAULT NULL,
        var_location_name VARCHAR DEFAULT NULL
      )
      RETURNS TABLE (
        location_code VARCHAR,
        location_name VARCHAR,
        location_type VARCHAR,
        parent_location_code VARCHAR
      )
      LANGUAGE sql AS $$
        SELECT m.location_code, m.location_name, m.location_type, m.parent_location_code
        FROM network_management.master_locations m
        WHERE (var_location_type IS NULL OR UPPER(m.location_type) = UPPER(var_location_type))
          AND (var_parent_location_code IS NULL OR m.parent_location_code = var_parent_location_code)
          AND (var_location_name IS NULL OR UPPER(m.location_name) LIKE '%' || UPPER(var_location_name) || '%')
        ORDER BY m.location_code ASC;
      $$;

      CREATE OR REPLACE FUNCTION network_management.fn_resolve_service_coverage(
        origin_district VARCHAR,
        dest_district VARCHAR,
        service_tier VARCHAR DEFAULT 'REG'
      )
      RETURNS TABLE (
        origin VARCHAR,
        destination VARCHAR,
        tier VARCHAR,
        sla_hours INTEGER,
        is_covered BOOLEAN
      )
      LANGUAGE sql AS $$
        SELECT
          origin_district AS origin,
          dest_district AS destination,
          COALESCE(service_tier, 'REG') AS tier,
          CASE WHEN UPPER(COALESCE(service_tier, 'REG')) = 'NEXT_DAY' THEN 24 ELSE 48 END AS sla_hours,
          EXISTS(SELECT 1 FROM network_management.master_locations WHERE location_code = origin_district)
            AND EXISTS(SELECT 1 FROM network_management.master_locations WHERE location_code = dest_district) AS is_covered;
      $$;

      CREATE SCHEMA IF NOT EXISTS secure_access;
      CREATE TABLE IF NOT EXISTS secure_access.user_accounts (
        id SERIAL PRIMARY KEY,
        nik VARCHAR(32) NOT NULL UNIQUE,
        full_name VARCHAR(120) NOT NULL,
        email VARCHAR(120) NOT NULL,
        department VARCHAR(64),
        status VARCHAR(24) NOT NULL DEFAULT 'ACTIVE'
      );
      CREATE OR REPLACE FUNCTION secure_access.sp_get_user_permission(
        var_user_id VARCHAR,
        var_app_code VARCHAR DEFAULT NULL
      )
      RETURNS TABLE (
        role_code VARCHAR,
        permission_key VARCHAR
      )
      LANGUAGE sql AS $$
        SELECT v.role_code::VARCHAR, v.permission_key::VARCHAR
        FROM (VALUES
          ('PLATFORM_ADMIN', 'ENDPOINT_DEPLOY'),
          ('OPS_SUPERVISOR', 'COD_VIEW')
        ) AS v(role_code, permission_key)
        WHERE var_user_id IS NOT NULL;
      $$;

      CREATE SCHEMA IF NOT EXISTS hco_logistics;
      CREATE TABLE IF NOT EXISTS hco_logistics.waybill_cod_summary (
        id SERIAL PRIMARY KEY,
        waybill_no VARCHAR(40) NOT NULL UNIQUE,
        hub_code VARCHAR(20) NOT NULL,
        cod_amount NUMERIC NOT NULL,
        settlement_status VARCHAR(32) NOT NULL
      );
    `);

    // Seed runtime target tables once if empty
    const locCount = await pool.query('SELECT COUNT(*)::int AS cnt FROM network_management.master_locations');
    if (locCount.rows[0]?.cnt === 0) {
      await pool.query(`
        INSERT INTO network_management.master_locations (location_code, location_name, location_type, parent_location_code, region_name, is_active) VALUES
        ('31', 'DKI JAKARTA', 'PROVINCE', NULL, 'JABODETABEK', TRUE),
        ('31.74', 'JAKARTA SELATAN', 'CITY', '31', 'JABODETABEK', TRUE),
        ('31.74.01', 'TEBET', 'DISTRICT', '31.74', 'JABODETABEK', TRUE),
        ('31.74.02', 'SETIABUDI', 'DISTRICT', '31.74', 'JABODETABEK', TRUE),
        ('32', 'JAWA BARAT', 'PROVINCE', NULL, 'JAWA BARAT', TRUE),
        ('32.73', 'KOTA BANDUNG', 'CITY', '32', 'JAWA BARAT', TRUE),
        ('32.73.02', 'COBLONG', 'DISTRICT', '32.73', 'JAWA BARAT', TRUE)
        ON CONFLICT (location_code) DO NOTHING;
      `);
    }
    const uaCount = await pool.query('SELECT COUNT(*)::int AS cnt FROM secure_access.user_accounts');
    if (uaCount.rows[0]?.cnt === 0) {
      await pool.query(`
        INSERT INTO secure_access.user_accounts (nik, full_name, email, department, status) VALUES
        ('2024001', 'Alex Morgan', 'alex.morgan@demo.com', 'Platform Engineering', 'ACTIVE'),
        ('2024002', 'Budi Darmawan', 'budi.darmawan@demo.com', 'Data Architecture', 'ACTIVE'),
        ('2024003', 'Developer User04', 'developer.user04@demo.com', 'Platform Ops', 'ACTIVE')
        ON CONFLICT (nik) DO NOTHING;
      `);
    }
    const codCount = await pool.query('SELECT COUNT(*)::int AS cnt FROM hco_logistics.waybill_cod_summary');
    if (codCount.rows[0]?.cnt === 0) {
      await pool.query(`
        INSERT INTO hco_logistics.waybill_cod_summary (waybill_no, hub_code, cod_amount, settlement_status) VALUES
        ('100084920192', 'CGK-TBT01', 185000, 'SETTLED'),
        ('100084920199', 'BDO-CBL02', 342500, 'PENDING'),
        ('100084920205', 'CGK-STB01', 95000, 'SETTLED')
        ON CONFLICT (waybill_no) DO NOTHING;
      `);
    }

    dbInstance = drizzle(pool, { schema });
    dbAvailable = true;
    return { connected: true };
  } catch (err) {
    dbAvailable = false;
    return { connected: false, error: err instanceof Error ? err.message : 'Database connection error' };
  }
}

export function getDb() {
  return dbInstance;
}

export function isDbConnected(): boolean {
  return dbAvailable;
}

export function getPgPool(): pg.Pool | null {
  return pool;
}
