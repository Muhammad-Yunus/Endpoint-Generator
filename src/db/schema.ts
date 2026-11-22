import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
} from 'drizzle-orm/pg-core';
import type {
  DbColumnDef,
  PathParamDef,
  HeaderDef,
  BodyFieldDef,
  SqlMappingConfig,
  PaginationConfig,
  ProfilerStep,
} from '../types/domain.ts';

export const users = pgTable('eg_users', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('Admin'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const workspaces = pgTable('eg_workspaces', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  code: text('code').notNull(),
  description: text('description').notNull().default(''),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const teams = pgTable('eg_teams', {
  id: serial('id').primaryKey(),
  workspaceId: integer('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  leadEmail: text('lead_email').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const developers = pgTable('eg_developers', {
  id: serial('id').primaryKey(),
  workspaceId: integer('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  teamId: integer('team_id')
    .notNull()
    .references(() => teams.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  email: text('email').notNull(),
  role: text('role').notNull().default('Developer'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const datasources = pgTable('eg_datasources', {
  id: serial('id').primaryKey(),
  workspaceId: integer('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  teamId: integer('team_id'),
  name: text('name').notNull(),
  engine: text('engine').notNull().default('postgresql'),
  host: text('host').notNull(),
  port: integer('port').notNull().default(5432),
  databaseName: text('database_name').notNull(),
  username: text('username').notNull(),
  sslMode: text('ssl_mode').notNull().default('require'),
  active: boolean('active').notNull().default(true),
  createdBy: text('created_by').notNull().default('System'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const datasourceObjects = pgTable('eg_datasource_objects', {
  id: serial('id').primaryKey(),
  datasourceId: integer('datasource_id')
    .notNull()
    .references(() => datasources.id, { onDelete: 'cascade' }),
  schemaName: text('schema_name').notNull(),
  objectName: text('object_name').notNull(),
  objectType: text('object_type').notNull(),
  columnsJson: jsonb('columns_json').$type<DbColumnDef[]>().notNull().default([]),
});

export const authConfigs = pgTable('eg_auth_configs', {
  id: serial('id').primaryKey(),
  workspaceId: integer('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  providerType: text('provider_type').notNull().default('Common Auth'),
  headerKeyName: text('header_key_name').notNull().default('X-CommonAuth-Key'),
  headerSecretName: text('header_secret_name').notNull().default('X-CommonAuth-Secret'),
  defaultExpiredMinutes: integer('default_expired_minutes').notNull().default(0),
  description: text('description').notNull().default(''),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const authIdentifiers = pgTable('eg_auth_identifiers', {
  id: serial('id').primaryKey(),
  authConfigId: integer('auth_config_id')
    .notNull()
    .references(() => authConfigs.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  apiKey: text('api_key').notNull(),
  secretHash: text('secret_hash').notNull(),
  secretMasked: text('secret_masked').notNull(),
  usePlainSecret: boolean('use_plain_secret').notNull().default(false),
  customExpiredMinutes: integer('custom_expired_minutes'),
  expiredAt: timestamp('expired_at', { withTimezone: true }),
  scopesJson: jsonb('scopes_json').$type<string[]>().notNull().default(['Read All']),
  active: boolean('active').notNull().default(true),
  locked: boolean('locked').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const collections = pgTable('eg_collections', {
  id: serial('id').primaryKey(),
  workspaceId: integer('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  authConfigId: integer('auth_config_id'),
  active: boolean('active').notNull().default(true),
  createdBy: text('created_by').notNull().default('Alex Morgan'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const endpoints = pgTable('eg_endpoints', {
  id: serial('id').primaryKey(),
  collectionId: integer('collection_id')
    .notNull()
    .references(() => collections.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  datasourceId: integer('datasource_id').notNull(),
  active: boolean('active').notNull().default(true),
  createdBy: text('created_by').notNull().default('Alex Morgan'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const endpointVersions = pgTable('eg_endpoint_versions', {
  id: serial('id').primaryKey(),
  endpointId: integer('endpoint_id')
    .notNull()
    .references(() => endpoints.id, { onDelete: 'cascade' }),
  versionNumber: integer('version_number').notNull().default(1),
  versionLabel: text('version_label').notNull().default('Ver.1'),
  method: text('method').notNull().default('POST'),
  pathSegmentsJson: jsonb('path_segments_json').$type<string[]>().notNull().default([]),
  pathParamsJson: jsonb('path_params_json').$type<PathParamDef[]>().notNull().default([]),
  headersJson: jsonb('headers_json').$type<HeaderDef[]>().notNull().default([]),
  bodyFieldsJson: jsonb('body_fields_json').$type<BodyFieldDef[]>().notNull().default([]),
  dbSchema: text('db_schema').notNull().default('public'),
  dbObjectName: text('db_object_name').notNull().default(''),
  dbObjectType: text('db_object_type').notNull().default('stored_procedure'),
  crudOperation: text('crud_operation').notNull().default('execute_rpc'),
  sqlMappingJson: jsonb('sql_mapping_json').$type<SqlMappingConfig>().notNull(),
  paginationConfigJson: jsonb('pagination_config_json').$type<PaginationConfig>().notNull(),
  status: text('status').notNull().default('Draft'),
  active: boolean('active').notNull().default(true),
  scopesJson: jsonb('scopes_json').$type<string[]>().notNull().default([]),
  description: text('description').notNull().default(''),
  globalProfiling: boolean('global_profiling').notNull().default(false),
  endpointProfiling: boolean('endpoint_profiling').notNull().default(true),
  rateLimiterEnabled: boolean('rate_limiter_enabled').notNull().default(false),
  rateLimiterBy: text('rate_limiter_by').notNull().default('By IP'),
  rateLimiterMaxReq: integer('rate_limiter_max_req').notNull().default(60),
  rateLimiterWindow: text('rate_limiter_window').notNull().default('1m'),
  rateLimiterMaxConcurrency: integer('rate_limiter_max_concurrency').notNull().default(10),
  circuitBreakerEnabled: boolean('circuit_breaker_enabled').notNull().default(false),
  circuitBreakerFailureThreshold: integer('circuit_breaker_failure_threshold').notNull().default(50),
  circuitBreakerTimeoutSec: integer('circuit_breaker_timeout_sec').notNull().default(30),
  circuitBreakerFallbackJson: jsonb('circuit_breaker_fallback_json')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({ status: 503, message: 'Service temporarily unavailable (circuit open)' }),
  cacheEnabled: boolean('cache_enabled').notNull().default(false),
  cacheTtlSec: integer('cache_ttl_sec').notNull().default(60),
  cacheKeyStrategy: text('cache_key_strategy').notNull().default('path+body'),
  useDefaultResponseFormat: boolean('use_default_response_format').notNull().default(true),
  sitVersionTag: text('sit_version_tag'),
  sitDeployedAt: timestamp('sit_deployed_at', { withTimezone: true }),
  sitDeployedBy: text('sit_deployed_by'),
  prodVersionTag: text('prod_version_tag'),
  prodDeployedAt: timestamp('prod_deployed_at', { withTimezone: true }),
  prodDeployedBy: text('prod_deployed_by'),
  createdBy: text('created_by').notNull().default('Alex Morgan'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const deployments = pgTable('eg_deployments', {
  id: serial('id').primaryKey(),
  endpointId: integer('endpoint_id').notNull(),
  endpointVersionId: integer('endpoint_version_id').notNull(),
  endpointName: text('endpoint_name').notNull(),
  collectionName: text('collection_name').notNull(),
  environment: text('environment').notNull(),
  versionTag: text('version_tag').notNull(),
  deployedBy: text('deployed_by').notNull(),
  deployedAt: timestamp('deployed_at', { withTimezone: true }).notNull().defaultNow(),
  notes: text('notes').notNull().default(''),
});

export const requestLogs = pgTable('eg_request_logs', {
  id: serial('id').primaryKey(),
  requestKey: text('request_key').notNull(),
  collectionId: integer('collection_id').notNull(),
  collectionName: text('collection_name').notNull(),
  endpointId: integer('endpoint_id').notNull(),
  endpointName: text('endpoint_name').notNull(),
  endpointVersionId: integer('endpoint_version_id').notNull(),
  versionLabel: text('version_label').notNull(),
  datasourceId: integer('datasource_id').notNull(),
  datasourceName: text('datasource_name').notNull(),
  datasourceEngine: text('datasource_engine').notNull(),
  authConfigId: integer('auth_config_id'),
  authSourceLabel: text('auth_source_label').notNull(),
  authIdentifierLabel: text('auth_identifier_label').notNull(),
  method: text('method').notNull(),
  path: text('path').notNull(),
  statusCode: integer('status_code').notNull(),
  statusMessage: text('status_message').notNull(),
  durationMs: integer('duration_ms').notNull(),
  requestHeadersJson: jsonb('request_headers_json').$type<Record<string, string>>().notNull().default({}),
  requestBodyJson: jsonb('request_body_json').$type<unknown>(),
  responseBodyJson: jsonb('response_body_json').$type<unknown>(),
  profilerStepsJson: jsonb('profiler_steps_json').$type<ProfilerStep[]>().notNull().default([]),
  errorStack: text('error_stack'),
  logCategory: text('log_category').notNull().default('request'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const alertConfigs = pgTable('eg_alert_configs', {
  id: serial('id').primaryKey(),
  workspaceId: integer('workspace_id').notNull(),
  name: text('name').notNull(),
  channel: text('channel').notNull().default('Email'),
  thresholdErrorRate: integer('threshold_error_rate').notNull().default(5),
  thresholdLatencyMs: integer('threshold_latency_ms').notNull().default(500),
  target: text('target').notNull(),
  active: boolean('active').notNull().default(true),
});

export const environments = pgTable('eg_environments', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  baseUrl: text('base_url').notNull(),
  gatewayHost: text('gateway_host').notNull(),
  tlsEnabled: boolean('tls_enabled').notNull().default(true),
  autoPromote: boolean('auto_promote').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
