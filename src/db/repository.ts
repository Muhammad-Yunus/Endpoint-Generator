import crypto from 'node:crypto';
import pg from 'pg';
import { eq, desc, asc, and, gte, lte, ilike, or } from 'drizzle-orm';
import { getDb, getPgPool, isDbConnected } from './index.ts';
import * as schema from './schema.ts';
import {
  SEED_WORKSPACES,
  SEED_TEAMS,
  SEED_DEVELOPERS,
  SEED_DATASOURCES,
  SEED_DATASOURCE_OBJECTS,
  SEED_AUTH_CONFIGS,
  SEED_AUTH_IDENTIFIERS,
  SEED_COLLECTIONS,
  SEED_ENDPOINTS,
  SEED_ENDPOINT_VERSIONS,
  SEED_DEPLOYMENTS,
  SEED_REQUEST_LOGS,
  SEED_ALERTS,
  SEED_ENVIRONMENTS,
  INITIAL_VIRTUAL_TABLES,
} from './seedData.ts';
import type {
  Workspace,
  Team,
  Developer,
  Datasource,
  DatasourceObject,
  AuthConfig,
  AuthIdentifier,
  Collection,
  Endpoint,
  EndpointVersion,
  DeploymentRecord,
  RequestLog,
  AlertConfig,
  EnvironmentConfig,
  AuthSessionUser,
  DashboardAnalytics,
  ProfilerStep,
  HttpMethod,
  CrudOperation,
} from '../types/domain.ts';

const EPHEMERAL_SESSION_KEY = crypto.randomBytes(32).toString('hex');

function getSessionSecret(): string {
  return process.env.SESSION_SECRET?.trim() || EPHEMERAL_SESSION_KEY;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, keyHex] = storedHash.split(':');
  if (!salt || !keyHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

export function signSessionToken(user: AuthSessionUser): string {
  const payload = Buffer.from(
    JSON.stringify({ ...user, exp: Date.now() + 24 * 3600_000 }),
    'utf8'
  ).toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(payload)
    .digest('base64url');
  return `${payload}.${sig}`;
}

export function verifySessionToken(token: string): AuthSessionUser | null {
  try {
    const [payload, sig] = token.split('.');
    if (!payload || !sig) return null;
    const expected = crypto
      .createHmac('sha256', getSessionSecret())
      .update(payload)
      .digest('base64url');
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!decoded.exp || Date.now() > decoded.exp) return null;
    return { id: decoded.id, name: decoded.name, email: decoded.email, role: decoded.role };
  } catch {
    return null;
  }
}

interface StoredUser extends AuthSessionUser {
  passwordHash: string;
}

class Repository {
  private users: StoredUser[] = [];
  private workspaces: Workspace[] = structuredClone(SEED_WORKSPACES);
  private teams: Team[] = structuredClone(SEED_TEAMS);
  private developers: Developer[] = structuredClone(SEED_DEVELOPERS);
  private datasources: Datasource[] = structuredClone(SEED_DATASOURCES);
  private datasourceObjects: DatasourceObject[] = structuredClone(SEED_DATASOURCE_OBJECTS);
  private authConfigs: AuthConfig[] = structuredClone(SEED_AUTH_CONFIGS);
  private authIdentifiers: AuthIdentifier[] = structuredClone(SEED_AUTH_IDENTIFIERS);
  private collections: Collection[] = structuredClone(SEED_COLLECTIONS);
  private endpoints: Endpoint[] = structuredClone(SEED_ENDPOINTS);
  private endpointVersions: EndpointVersion[] = structuredClone(SEED_ENDPOINT_VERSIONS);
  private deployments: DeploymentRecord[] = structuredClone(SEED_DEPLOYMENTS);
  private requestLogs: RequestLog[] = structuredClone(SEED_REQUEST_LOGS);
  private alertConfigs: AlertConfig[] = structuredClone(SEED_ALERTS);
  private environments: EnvironmentConfig[] = structuredClone(SEED_ENVIRONMENTS);
  private virtualTables: Record<string, Array<Record<string, unknown>>> = structuredClone(INITIAL_VIRTUAL_TABLES);

  // Runtime resilience state
  private rateLimitBuckets = new Map<string, { count: number; windowStart: number }>();
  private circuitStates = new Map<number, { failures: number; openUntil: number }>();
  private responseCache = new Map<string, { value: unknown; expiresAt: number }>();

  private nextId(arr: Array<{ id: number }>): number {
    return arr.length === 0 ? 1 : Math.max(...arr.map((x) => x.id)) + 1;
  }

  async hydrateOrSeed(): Promise<void> {
    const db = getDb();
    if (!db || !isDbConnected()) return;

    try {
      const existingWs = await db.select().from(schema.workspaces);
      if (existingWs.length === 0) {
        // Seed PostgreSQL via Drizzle ORM
        await db.insert(schema.workspaces).values(
          SEED_WORKSPACES.map((w) => ({
            name: w.name,
            code: w.code,
            description: w.description,
            active: w.active,
          }))
        );
        await db.insert(schema.teams).values(
          SEED_TEAMS.map((t) => ({
            workspaceId: t.workspaceId,
            name: t.name,
            description: t.description,
            leadEmail: t.leadEmail,
          }))
        );
        await db.insert(schema.developers).values(
          SEED_DEVELOPERS.map((d) => ({
            workspaceId: d.workspaceId,
            teamId: d.teamId,
            name: d.name,
            email: d.email,
            role: d.role,
            active: d.active,
          }))
        );
        await db.insert(schema.datasources).values(
          SEED_DATASOURCES.map((ds) => ({
            workspaceId: ds.workspaceId,
            teamId: ds.teamId,
            name: ds.name,
            engine: ds.engine,
            host: ds.host,
            port: ds.port,
            databaseName: ds.databaseName,
            username: ds.username,
            sslMode: ds.sslMode,
            active: ds.active,
            createdBy: ds.createdBy,
          }))
        );
        await db.insert(schema.datasourceObjects).values(
          SEED_DATASOURCE_OBJECTS.map((obj) => ({
            datasourceId: obj.datasourceId,
            schemaName: obj.schemaName,
            objectName: obj.objectName,
            objectType: obj.objectType,
            columnsJson: obj.columns,
          }))
        );
        await db.insert(schema.authConfigs).values(
          SEED_AUTH_CONFIGS.map((ac) => ({
            workspaceId: ac.workspaceId,
            name: ac.name,
            providerType: ac.providerType,
            headerKeyName: ac.headerKeyName,
            headerSecretName: ac.headerSecretName,
            defaultExpiredMinutes: ac.defaultExpiredMinutes,
            description: ac.description,
            active: ac.active,
          }))
        );
        await db.insert(schema.authIdentifiers).values(
          SEED_AUTH_IDENTIFIERS.map((ai) => ({
            authConfigId: ai.authConfigId,
            name: ai.name,
            apiKey: ai.apiKey,
            secretHash: hashPassword(ai.secretMasked),
            secretMasked: ai.secretMasked,
            usePlainSecret: ai.usePlainSecret,
            customExpiredMinutes: ai.customExpiredMinutes,
            scopesJson: ai.scopes,
            active: ai.active,
            locked: ai.locked,
          }))
        );
        await db.insert(schema.collections).values(
          SEED_COLLECTIONS.map((c) => ({
            workspaceId: c.workspaceId,
            name: c.name,
            description: c.description,
            authConfigId: c.authConfigId,
            active: c.active,
            createdBy: c.createdBy,
          }))
        );
        await db.insert(schema.endpoints).values(
          SEED_ENDPOINTS.map((e) => ({
            collectionId: e.collectionId,
            name: e.name,
            datasourceId: e.datasourceId,
            active: e.active,
            createdBy: e.createdBy,
          }))
        );
        await db.insert(schema.endpointVersions).values(
          SEED_ENDPOINT_VERSIONS.map((v) => ({
            endpointId: v.endpointId,
            versionNumber: v.versionNumber,
            versionLabel: v.versionLabel,
            method: v.method,
            pathSegmentsJson: v.pathSegments,
            pathParamsJson: v.pathParams,
            headersJson: v.headers,
            bodyFieldsJson: v.bodyFields,
            dbSchema: v.dbSchema,
            dbObjectName: v.dbObjectName,
            dbObjectType: v.dbObjectType,
            crudOperation: v.crudOperation,
            sqlMappingJson: v.sqlMapping,
            paginationConfigJson: v.paginationConfig,
            status: v.status,
            active: v.active,
            scopesJson: v.scopes,
            description: v.description,
            globalProfiling: v.globalProfiling,
            endpointProfiling: v.endpointProfiling,
            rateLimiterEnabled: v.rateLimiterEnabled,
            rateLimiterBy: v.rateLimiterBy,
            rateLimiterMaxReq: v.rateLimiterMaxReq,
            rateLimiterWindow: v.rateLimiterWindow,
            rateLimiterMaxConcurrency: v.rateLimiterMaxConcurrency,
            circuitBreakerEnabled: v.circuitBreakerEnabled,
            circuitBreakerFailureThreshold: v.circuitBreakerFailureThreshold,
            circuitBreakerTimeoutSec: v.circuitBreakerTimeoutSec,
            circuitBreakerFallbackJson: v.circuitBreakerFallbackJson,
            cacheEnabled: v.cacheEnabled,
            cacheTtlSec: v.cacheTtlSec,
            cacheKeyStrategy: v.cacheKeyStrategy,
            useDefaultResponseFormat: v.useDefaultResponseFormat,
            sitVersionTag: v.sitVersionTag,
            sitDeployedBy: v.sitDeployedBy,
            prodVersionTag: v.prodVersionTag,
            prodDeployedBy: v.prodDeployedBy,
            createdBy: v.createdBy,
          }))
        );
        await db.insert(schema.deployments).values(
          SEED_DEPLOYMENTS.map((d) => ({
            endpointId: d.endpointId,
            endpointVersionId: d.endpointVersionId,
            endpointName: d.endpointName,
            collectionName: d.collectionName,
            environment: d.environment,
            versionTag: d.versionTag,
            deployedBy: d.deployedBy,
            deployedAt: new Date(d.deployedAt),
            notes: d.notes,
          }))
        );
        await db.insert(schema.requestLogs).values(
          SEED_REQUEST_LOGS.map((l) => ({
            requestKey: l.requestKey,
            collectionId: l.collectionId,
            collectionName: l.collectionName,
            endpointId: l.endpointId,
            endpointName: l.endpointName,
            endpointVersionId: l.endpointVersionId,
            versionLabel: l.versionLabel,
            datasourceId: l.datasourceId,
            datasourceName: l.datasourceName,
            datasourceEngine: l.datasourceEngine,
            authConfigId: l.authConfigId,
            authSourceLabel: l.authSourceLabel,
            authIdentifierLabel: l.authIdentifierLabel,
            method: l.method,
            path: l.path,
            statusCode: l.statusCode,
            statusMessage: l.statusMessage,
            durationMs: l.durationMs,
            requestHeadersJson: l.requestHeaders,
            requestBodyJson: l.requestBody,
            responseBodyJson: l.responseBody,
            profilerStepsJson: l.profilerSteps,
            errorStack: l.errorStack,
            logCategory: l.logCategory,
            createdAt: new Date(l.createdAt),
          }))
        );
        await db.insert(schema.alertConfigs).values(
          SEED_ALERTS.map((a) => ({
            workspaceId: a.workspaceId,
            name: a.name,
            channel: a.channel,
            thresholdErrorRate: a.thresholdErrorRate,
            thresholdLatencyMs: a.thresholdLatencyMs,
            target: a.target,
            active: a.active,
          }))
        );
        await db.insert(schema.environments).values(
          SEED_ENVIRONMENTS.map((e) => ({
            name: e.name,
            baseUrl: e.baseUrl,
            gatewayHost: e.gatewayHost,
            tlsEnabled: e.tlsEnabled,
            autoPromote: e.autoPromote,
          }))
        );
      }

      await this.ensureRichDemoTrafficInDb();
      await this.syncFromDb();
    } catch (err) {
      console.warn('[DB Hydrate Warning] Falling back to in-memory seed state:', err);
    }
  }

  private async ensureRichDemoTrafficInDb(): Promise<void> {
    const db = getDb();
    const pool = getPgPool();
    if (!db || !pool || !isDbConnected()) return;

    // 1. Sync SERIAL sequences to avoid PK collisions after seeded IDs
    await pool.query(`
      SELECT setval(pg_get_serial_sequence('eg_auth_identifiers', 'id'), COALESCE((SELECT MAX(id) FROM eg_auth_identifiers), 1));
      SELECT setval(pg_get_serial_sequence('eg_endpoints', 'id'), COALESCE((SELECT MAX(id) FROM eg_endpoints), 1));
      SELECT setval(pg_get_serial_sequence('eg_endpoint_versions', 'id'), COALESCE((SELECT MAX(id) FROM eg_endpoint_versions), 1));
      SELECT setval(pg_get_serial_sequence('eg_request_logs', 'id'), COALESCE((SELECT MAX(id) FROM eg_request_logs), 1));
    `);

    // 2. Idempotently ensure all 10 Auth Identifiers exist
    const existingAuthIdents = await db.select().from(schema.authIdentifiers);
    const existingIdentNames = new Set(existingAuthIdents.map((a) => a.name));
    const missingAuthIdents = SEED_AUTH_IDENTIFIERS.filter((a) => !existingIdentNames.has(a.name));
    if (missingAuthIdents.length > 0) {
      await db.insert(schema.authIdentifiers).values(
        missingAuthIdents.map((ai) => ({
          authConfigId: ai.authConfigId,
          name: ai.name,
          apiKey: ai.apiKey,
          secretHash: hashPassword(ai.secretMasked),
          secretMasked: ai.secretMasked,
          usePlainSecret: ai.usePlainSecret,
          customExpiredMinutes: ai.customExpiredMinutes,
          scopesJson: ai.scopes,
          active: ai.active,
          locked: ai.locked,
        }))
      );
    }

    // 3. Normalize trailing whitespace on endpoint names and clean any duplicate created by trailing-space mismatch
    await pool.query(`UPDATE eg_endpoints SET name = TRIM(name) WHERE name <> TRIM(name)`);
    const dupRes = await pool.query(`
      SELECT id FROM eg_endpoints WHERE name = 'Get List Locations' ORDER BY id ASC
    `);
    if (dupRes.rows.length > 1) {
      const duplicateIds = dupRes.rows.slice(1).map((r: { id: number }) => r.id);
      await pool.query(`DELETE FROM eg_endpoint_versions WHERE endpoint_id = ANY($1::int[])`, [duplicateIds]);
      await pool.query(`DELETE FROM eg_endpoints WHERE id = ANY($1::int[])`, [duplicateIds]);
      await pool.query(`DELETE FROM eg_request_logs WHERE request_key LIKE 'bulk-demo-%'`);
    }

    // Idempotently ensure all 10 Endpoints and their EndpointVersions exist
    const existingEndpoints = await db.select().from(schema.endpoints);
    const endpointIdByName = new Map(existingEndpoints.map((e) => [e.name.trim(), e.id]));
    const missingEndpoints = SEED_ENDPOINTS.filter((e) => !endpointIdByName.has(e.name.trim()));
    if (missingEndpoints.length > 0) {
      const insertedEps = await db
        .insert(schema.endpoints)
        .values(
          missingEndpoints.map((e) => ({
            collectionId: e.collectionId,
            name: e.name.trim(),
            datasourceId: e.datasourceId,
            active: e.active,
            createdBy: e.createdBy,
          }))
        )
        .returning();
      for (const ep of insertedEps) {
        endpointIdByName.set(ep.name.trim(), ep.id);
      }
    }

    const existingVersions = await db.select().from(schema.endpointVersions);
    const existingVersionKeys = new Set(
      existingVersions.map((v) => `${v.endpointId}:${v.versionLabel}`)
    );
    const seedEndpointNameById = new Map(SEED_ENDPOINTS.map((e) => [e.id, e.name.trim()]));
    const missingVersions = SEED_ENDPOINT_VERSIONS.filter((v) => {
      const epName = seedEndpointNameById.get(v.endpointId);
      const dbEpId = epName ? endpointIdByName.get(epName) : undefined;
      if (!dbEpId) return false;
      return !existingVersionKeys.has(`${dbEpId}:${v.versionLabel}`);
    });
    if (missingVersions.length > 0) {
      await db.insert(schema.endpointVersions).values(
        missingVersions.map((v) => {
          const epName = seedEndpointNameById.get(v.endpointId)!;
          const dbEpId = endpointIdByName.get(epName)!;
          return {
            endpointId: dbEpId,
            versionNumber: v.versionNumber,
            versionLabel: v.versionLabel,
            method: v.method,
            pathSegmentsJson: v.pathSegments,
            pathParamsJson: v.pathParams,
            headersJson: v.headers,
            bodyFieldsJson: v.bodyFields,
            dbSchema: v.dbSchema,
            dbObjectName: v.dbObjectName,
            dbObjectType: v.dbObjectType,
            crudOperation: v.crudOperation,
            sqlMappingJson: v.sqlMapping,
            paginationConfigJson: v.paginationConfig,
            status: v.status,
            active: v.active,
            scopesJson: v.scopes,
            description: v.description,
            globalProfiling: v.globalProfiling,
            endpointProfiling: v.endpointProfiling,
            rateLimiterEnabled: v.rateLimiterEnabled,
            rateLimiterBy: v.rateLimiterBy,
            rateLimiterMaxReq: v.rateLimiterMaxReq,
            rateLimiterWindow: v.rateLimiterWindow,
            rateLimiterMaxConcurrency: v.rateLimiterMaxConcurrency,
            circuitBreakerEnabled: v.circuitBreakerEnabled,
            circuitBreakerFailureThreshold: v.circuitBreakerFailureThreshold,
            circuitBreakerTimeoutSec: v.circuitBreakerTimeoutSec,
            circuitBreakerFallbackJson: v.circuitBreakerFallbackJson,
            cacheEnabled: v.cacheEnabled,
            cacheTtlSec: v.cacheTtlSec,
            cacheKeyStrategy: v.cacheKeyStrategy,
            useDefaultResponseFormat: v.useDefaultResponseFormat,
            sitVersionTag: v.sitVersionTag,
            sitDeployedBy: v.sitDeployedBy,
            prodVersionTag: v.prodVersionTag,
            prodDeployedBy: v.prodDeployedBy,
            createdBy: v.createdBy,
          };
        })
      );
    }

    // 4. Idempotently populate bulk dummy request logs if not yet populated
    const bulkCheck = await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM eg_request_logs WHERE request_key LIKE 'bulk-demo-%'`
    );
    if ((bulkCheck.rows[0]?.cnt ?? 0) > 0) {
      return;
    }

    const [dbCollections, dbDatasources, dbAuthConfigs, dbAuthIdents, dbEndpoints, dbVersions] =
      await Promise.all([
        db.select().from(schema.collections).orderBy(asc(schema.collections.id)),
        db.select().from(schema.datasources).orderBy(asc(schema.datasources.id)),
        db.select().from(schema.authConfigs).orderBy(asc(schema.authConfigs.id)),
        db.select().from(schema.authIdentifiers).orderBy(asc(schema.authIdentifiers.id)),
        db.select().from(schema.endpoints).orderBy(asc(schema.endpoints.id)),
        db.select().from(schema.endpointVersions).orderBy(asc(schema.endpointVersions.id)),
      ]);

    const colMap = new Map(dbCollections.map((c) => [c.id, c]));
    const dsMap = new Map(dbDatasources.map((d) => [d.id, d]));
    const authCfgMap = new Map(dbAuthConfigs.map((a) => [a.id, a]));
    const firstVerByEp = new Map<number, typeof dbVersions[number]>();
    for (const v of dbVersions) {
      if (!firstVerByEp.has(v.endpointId)) firstVerByEp.set(v.endpointId, v);
    }

    const activeEndpoints = dbEndpoints.filter((e) => firstVerByEp.has(e.id));
    if (activeEndpoints.length === 0 || dbAuthIdents.length === 0) return;

    // Deterministic PRNG so distribution looks realistic and natural
    let seed = 20261122;
    const nextRand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    // Zipf-style weighted selection so Top 10 Auth Identifiers and Top 10 Endpoints form a clear curve
    const pickWeighted = <T>(items: T[], weights: number[]): T => {
      const sliceWeights = items.map((_, i) => weights[i] ?? Math.max(1, 10 - i));
      const total = sliceWeights.reduce((a, b) => a + b, 0);
      let r = nextRand() * total;
      for (let i = 0; i < items.length; i++) {
        r -= sliceWeights[i];
        if (r <= 0) return items[i];
      }
      return items[items.length - 1];
    };

    const epWeights = [26, 21, 17, 14, 11, 9, 7, 5, 4, 3];
    const authWeights = [24, 19, 15, 12, 10, 8, 6, 4, 3, 2];

    const nowMs = Date.now();
    const todayStr = new Date(nowMs).toISOString().slice(0, 10);
    const todayStartMs = new Date(`${todayStr}T00:00:00`).getTime();

    const timestampsMs: number[] = [];

    // Today's 2-hour buckets from 00:00 up to current hour (never generating future timestamps)
    const todayBucketTargets = [12, 9, 17, 25, 34, 26, 22, 29, 24, 19, 15, 11];
    for (let b = 0; b < 12; b++) {
      const bStart = todayStartMs + b * 7200_000;
      if (bStart >= nowMs - 120_000) break;
      const bEnd = Math.min(bStart + 7140_000, nowMs - 45_000);
      const count = todayBucketTargets[b] ?? 16;
      for (let k = 0; k < count; k++) {
        const ts = Math.round(bStart + 60_000 + nextRand() * Math.max(60_000, bEnd - bStart - 60_000));
        timestampsMs.push(ts);
      }
    }

    // Guarantee at least 115 logs today even if run right after midnight UTC
    if (timestampsMs.length < 40) {
      const span = Math.max(300_000, nowMs - todayStartMs - 60_000);
      for (let k = 0; k < 100; k++) {
        timestampsMs.push(Math.round(todayStartMs + 30_000 + nextRand() * span));
      }
    }

    // Past 6 days (1W view: 12 twelve-hour buckets covering morning and afternoon/evening each day)
    const dailySlotCounts = [
      [14, 19], // 1 day ago
      [12, 21], // 2 days ago
      [16, 18], // 3 days ago
      [11, 15], // 4 days ago
      [15, 22], // 5 days ago
      [10, 14], // 6 days ago
    ];
    for (let d = 1; d <= 6; d++) {
      const dayMidnightMs = todayStartMs - d * 86400_000;
      const [amCount, pmCount] = dailySlotCounts[d - 1];
      for (let k = 0; k < amCount; k++) {
        timestampsMs.push(Math.round(dayMidnightMs + (0.5 + nextRand() * 11) * 3600_000));
      }
      for (let k = 0; k < pmCount; k++) {
        timestampsMs.push(Math.round(dayMidnightMs + (12.2 + nextRand() * 11.3) * 3600_000));
      }
    }

    // 7..13 days ago (for 2-week custom date range queries)
    for (let d = 7; d <= 13; d++) {
      const dayMidnightMs = todayStartMs - d * 86400_000;
      for (let k = 0; k < 4; k++) {
        timestampsMs.push(Math.round(dayMidnightMs + (2 + nextRand() * 20) * 3600_000));
      }
    }

    const logsToInsert = timestampsMs.map((ts, idx) => {
      // Ensure every endpoint and auth identifier gets represented reliably, with weighted skew
      const ep =
        idx < activeEndpoints.length
          ? activeEndpoints[idx]
          : pickWeighted(activeEndpoints, epWeights);
      const ver = firstVerByEp.get(ep.id)!;
      const col = colMap.get(ep.collectionId);
      const ds = dsMap.get(ep.datasourceId);
      const authCfg = col?.authConfigId ? authCfgMap.get(col.authConfigId) : dbAuthConfigs[0];
      const ident =
        idx < dbAuthIdents.length
          ? dbAuthIdents[idx]
          : pickWeighted(dbAuthIdents, authWeights);

      const roll = nextRand();
      let statusCode = 200;
      let statusMessage = '[200] OK';
      let durationMs = Math.round(24 + nextRand() * 195);
      let logCategory: RequestLog['logCategory'] = 'request';
      let isCacheHit = false;
      let errorStack: string | null = null;

      if (roll >= 0.98) {
        statusCode = 500;
        statusMessage = '[500] Internal Server Error';
        durationMs = Math.round(135 + nextRand() * 210);
        errorStack = `DatabaseExecutionException: Query timeout on ${ver.dbSchema}.${ver.dbObjectName}`;
      } else if (roll >= 0.96) {
        statusCode = 503;
        statusMessage = '[503] Service Unavailable';
        durationMs = Math.round(14 + nextRand() * 32);
        logCategory = 'circuit_breaker';
        errorStack = `CircuitBreakerOpenException: Downstream threshold tripped for ${ep.name}`;
      } else if (roll >= 0.92) {
        statusCode = 429;
        statusMessage = '[429] Too Many Requests';
        durationMs = Math.round(6 + nextRand() * 16);
        logCategory = 'rate_limiter';
        errorStack = `RateLimitExceededException: Max requests per window exceeded on ${ep.name}`;
      } else if (roll >= 0.88) {
        statusCode = 401;
        statusMessage = '[401] Unauthorized';
        durationMs = Math.round(5 + nextRand() * 14);
        errorStack = `AuthenticationException: Invalid or missing token for Collection "${col?.name || 'Default'}"`;
      } else if (roll >= 0.76) {
        statusCode = 200;
        statusMessage = '[200] OK (Cache Hit)';
        durationMs = Math.round(4 + nextRand() * 14);
        isCacheHit = true;
      }

      const fullPath = `/v${ver.versionNumber}/${(ver.pathSegmentsJson || []).join('/')}`;
      const authSourceLabel = authCfg
        ? `[${authCfg.providerType}] ${authCfg.name}`
        : '[Common Auth] Default Auth';
      const authIdentifierLabel =
        statusCode === 401 && roll < 0.90
          ? 'DEMO-INVALID-KEY-01'
          : `${ident.name} (${ident.apiKey})`;

      const authHeaderName = authCfg?.headerKeyName || 'X-CommonAuth-Key';
      const profilerSteps: ProfilerStep[] = [
        {
          stage: 'Start',
          durationMs: 0,
          instantOffsetMs: 0,
          action: 'Start Request Pipeline',
          espace: 'Gateway',
          iconType: 'start',
        },
        {
          stage: 'ValidateAuthentication(...)',
          durationMs: Math.min(6, Math.max(2, Math.round(durationMs * 0.1))),
          instantOffsetMs: 1,
          action: statusCode === 401 ? 'ValidateAuthentication (401)' : 'ValidateAuthentication (OK)',
          espace: authCfg?.providerType || 'Common Auth',
          iconType: statusCode === 401 ? 'error' : 'auth',
        },
      ];

      if (isCacheHit) {
        profilerSteps.push({
          stage: 'ResponseCacheLookup(...)',
          durationMs: Math.max(2, durationMs - 4),
          instantOffsetMs: 4,
          action: 'Cache Hit',
          espace: 'Gateway Cache',
          iconType: 'cache',
        });
      } else if (statusCode < 400 || statusCode === 500) {
        profilerSteps.push({
          stage: 'RunDataExecutor(...)',
          durationMs: Math.max(8, durationMs - 9),
          instantOffsetMs: 7,
          action: statusCode === 500 ? 'RunDataExecutor (Error)' : 'RunDataExecutor',
          espace: (ds?.engine || 'postgresql').toUpperCase(),
          iconType: statusCode === 500 ? 'error' : 'execute',
        });
      }

      return {
        requestKey: `bulk-demo-${String(idx + 1).padStart(4, '0')}-${String(ts).slice(-6)}`,
        collectionId: col?.id ?? ep.collectionId,
        collectionName: col?.name || 'Jalur Kargo',
        endpointId: ep.id,
        endpointName: ep.name,
        endpointVersionId: ver.id,
        versionLabel: ver.versionLabel,
        datasourceId: ds?.id ?? ep.datasourceId,
        datasourceName: ds?.name || 'Jalur Kargo Datastore',
        datasourceEngine: ds?.engine || 'postgresql',
        authConfigId: authCfg?.id ?? null,
        authSourceLabel,
        authIdentifierLabel,
        method: ver.method,
        path: fullPath,
        statusCode,
        statusMessage,
        durationMs,
        requestHeadersJson: {
          [authHeaderName]: ident.apiKey,
          'Content-Type': 'application/json',
        },
        requestBodyJson:
          ver.method === 'GET'
            ? { limit: 25, offset: 0 }
            : { batch_code: `BATCH-${100100 + idx}`, region: 'ZONE_NORTH' },
        responseBodyJson:
          statusCode >= 400
            ? { status: statusCode, message: statusMessage, error: errorStack }
            : { status: 200, message: 'Success', count: 1 + (idx % 12), cached: isCacheHit },
        profilerStepsJson: profilerSteps,
        errorStack,
        logCategory,
        createdAt: new Date(ts),
      };
    });

    const chunkSize = 80;
    for (let i = 0; i < logsToInsert.length; i += chunkSize) {
      await db.insert(schema.requestLogs).values(logsToInsert.slice(i, i + chunkSize));
    }
  }

  async syncFromDb(): Promise<void> {
    const db = getDb();
    if (!db || !isDbConnected()) return;

    try {
      const [
        wsRows,
      teamRows,
      devRows,
      dsRows,
      dsObjRows,
      acRows,
      aiRows,
      colRows,
      epRows,
      verRows,
      depRows,
      logRows,
      alertRows,
      envRows,
      userRows,
    ] = await Promise.all([
      db.select().from(schema.workspaces).orderBy(asc(schema.workspaces.id)),
      db.select().from(schema.teams).orderBy(asc(schema.teams.id)),
      db.select().from(schema.developers).orderBy(asc(schema.developers.id)),
      db.select().from(schema.datasources).orderBy(asc(schema.datasources.id)),
      db.select().from(schema.datasourceObjects).orderBy(asc(schema.datasourceObjects.id)),
      db.select().from(schema.authConfigs).orderBy(asc(schema.authConfigs.id)),
      db.select().from(schema.authIdentifiers).orderBy(asc(schema.authIdentifiers.id)),
      db.select().from(schema.collections).orderBy(asc(schema.collections.id)),
      db.select().from(schema.endpoints).orderBy(asc(schema.endpoints.id)),
      db.select().from(schema.endpointVersions).orderBy(asc(schema.endpointVersions.id)),
      db.select().from(schema.deployments).orderBy(desc(schema.deployments.id)),
      db.select().from(schema.requestLogs).orderBy(desc(schema.requestLogs.createdAt), desc(schema.requestLogs.id)).limit(1000),
      db.select().from(schema.alertConfigs).orderBy(asc(schema.alertConfigs.id)),
      db.select().from(schema.environments).orderBy(asc(schema.environments.id)),
      db.select().from(schema.users).orderBy(asc(schema.users.id)),
    ]);

      this.workspaces = wsRows.map((w) => ({
        ...w,
        createdAt: w.createdAt.toISOString(),
        updatedAt: w.updatedAt.toISOString(),
      }));
      this.teams = teamRows.map((t) => ({ ...t, createdAt: t.createdAt.toISOString() }));
      this.developers = devRows.map((d) => ({
        ...d,
        role: d.role as Developer['role'],
        createdAt: d.createdAt.toISOString(),
      }));
      this.datasources = dsRows.map((d) => ({
        ...d,
        engine: d.engine as Datasource['engine'],
        createdAt: d.createdAt.toISOString(),
        updatedAt: d.updatedAt.toISOString(),
      }));
      this.datasourceObjects = dsObjRows.map((o) => ({
        id: o.id,
        datasourceId: o.datasourceId,
        schemaName: o.schemaName,
        objectName: o.objectName,
        objectType: o.objectType as DatasourceObject['objectType'],
        columns: o.columnsJson,
      }));
      this.authConfigs = acRows.map((a) => ({
        ...a,
        providerType: a.providerType as AuthConfig['providerType'],
        createdAt: a.createdAt.toISOString(),
      }));
      this.authIdentifiers = aiRows.map((i) => ({
        id: i.id,
        authConfigId: i.authConfigId,
        name: i.name,
        apiKey: i.apiKey,
        secretMasked: i.secretMasked,
        usePlainSecret: i.usePlainSecret,
        customExpiredMinutes: i.customExpiredMinutes,
        expiredAt: i.expiredAt ? i.expiredAt.toISOString() : null,
        scopes: i.scopesJson,
        active: i.active,
        locked: i.locked,
        createdAt: i.createdAt.toISOString(),
      }));
      this.collections = colRows.map((c) => ({
        ...c,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      }));
      this.endpoints = epRows.map((e) => ({
        ...e,
        createdAt: e.createdAt.toISOString(),
        updatedAt: e.updatedAt.toISOString(),
      }));
      this.endpointVersions = verRows.map((v) => ({
        id: v.id,
        endpointId: v.endpointId,
        versionNumber: v.versionNumber,
        versionLabel: v.versionLabel,
        method: v.method as HttpMethod,
        pathSegments: v.pathSegmentsJson,
        pathParams: v.pathParamsJson,
        headers: v.headersJson,
        bodyFields: v.bodyFieldsJson,
        dbSchema: v.dbSchema,
        dbObjectName: v.dbObjectName,
        dbObjectType: v.dbObjectType as EndpointVersion['dbObjectType'],
        crudOperation: v.crudOperation as CrudOperation,
        sqlMapping: v.sqlMappingJson,
        paginationConfig: v.paginationConfigJson,
        status: v.status as EndpointVersion['status'],
        active: v.active,
        scopes: v.scopesJson,
        description: v.description,
        globalProfiling: v.globalProfiling,
        endpointProfiling: v.endpointProfiling,
        rateLimiterEnabled: v.rateLimiterEnabled,
        rateLimiterBy: v.rateLimiterBy as EndpointVersion['rateLimiterBy'],
        rateLimiterMaxReq: v.rateLimiterMaxReq,
        rateLimiterWindow: v.rateLimiterWindow as EndpointVersion['rateLimiterWindow'],
        rateLimiterMaxConcurrency: v.rateLimiterMaxConcurrency,
        circuitBreakerEnabled: v.circuitBreakerEnabled,
        circuitBreakerFailureThreshold: v.circuitBreakerFailureThreshold,
        circuitBreakerTimeoutSec: v.circuitBreakerTimeoutSec,
        circuitBreakerFallbackJson: v.circuitBreakerFallbackJson,
        cacheEnabled: v.cacheEnabled,
        cacheTtlSec: v.cacheTtlSec,
        cacheKeyStrategy: v.cacheKeyStrategy as EndpointVersion['cacheKeyStrategy'],
        useDefaultResponseFormat: v.useDefaultResponseFormat,
        sitVersionTag: v.sitVersionTag,
        sitDeployedAt: v.sitDeployedAt ? v.sitDeployedAt.toISOString() : null,
        sitDeployedBy: v.sitDeployedBy,
        prodVersionTag: v.prodVersionTag,
        prodDeployedAt: v.prodDeployedAt ? v.prodDeployedAt.toISOString() : null,
        prodDeployedBy: v.prodDeployedBy,
        createdBy: v.createdBy,
        createdAt: v.createdAt.toISOString(),
        updatedAt: v.updatedAt.toISOString(),
      }));
      this.deployments = depRows.map((d) => ({
        ...d,
        environment: d.environment as 'SIT' | 'PROD',
        deployedAt: d.deployedAt.toISOString(),
      }));
      this.requestLogs = logRows.map((l) => ({
        id: l.id,
        requestKey: l.requestKey,
        collectionId: l.collectionId,
        collectionName: l.collectionName,
        endpointId: l.endpointId,
        endpointName: l.endpointName,
        endpointVersionId: l.endpointVersionId,
        versionLabel: l.versionLabel,
        datasourceId: l.datasourceId,
        datasourceName: l.datasourceName,
        datasourceEngine: l.datasourceEngine as Datasource['engine'],
        authConfigId: l.authConfigId,
        authSourceLabel: l.authSourceLabel,
        authIdentifierLabel: l.authIdentifierLabel,
        method: l.method as HttpMethod,
        path: l.path,
        statusCode: l.statusCode,
        statusMessage: l.statusMessage,
        durationMs: l.durationMs,
        requestHeaders: l.requestHeadersJson,
        requestBody: l.requestBodyJson,
        responseBody: l.responseBodyJson,
        profilerSteps: l.profilerStepsJson,
        errorStack: l.errorStack,
        logCategory: l.logCategory as RequestLog['logCategory'],
        createdAt: l.createdAt.toISOString(),
      }));
      this.alertConfigs = alertRows.map((a) => ({
        ...a,
        channel: a.channel as AlertConfig['channel'],
      }));
      this.environments = envRows.map((e) => ({
        ...e,
        name: e.name as 'SIT' | 'PROD',
        updatedAt: e.updatedAt.toISOString(),
      }));
      this.users = userRows.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        passwordHash: u.passwordHash,
      }));
    } catch (err) {
      console.warn('[DB Hydrate Warning] Falling back to in-memory seed state:', err);
    }
  }

  // Auth methods
  needsAdminClaim(): boolean {
    const envPasscode = process.env.ADMIN_PASSCODE?.trim();
    return !envPasscode && this.users.length === 0;
  }

  async claimOrRegisterAdmin(name: string, email: string, password: string): Promise<AuthSessionUser> {
    const cleanEmail = email.trim().toLowerCase();
    const existing = this.users.find((u) => u.email.toLowerCase() === cleanEmail);
    if (existing) {
      throw new Error('Account already exists with this email');
    }
    const passwordHash = hashPassword(password);
    const db = getDb();
    let id = this.nextId(this.users);
    if (db && isDbConnected()) {
      const [inserted] = await db
        .insert(schema.users)
        .values({ name, email: cleanEmail, passwordHash, role: this.users.length === 0 ? 'Admin' : 'Developer' })
        .returning();
      id = inserted.id;
    }
    const user: StoredUser = {
      id,
      name,
      email: cleanEmail,
      role: this.users.length === 0 ? 'Admin' : 'Developer',
      passwordHash,
    };
    this.users.push(user);
    return { id: user.id, name: user.name, email: user.email, role: user.role };
  }

  async login(email: string, password: string): Promise<AuthSessionUser | null> {
    const envPasscode = process.env.ADMIN_PASSCODE?.trim();
    if (envPasscode && password === envPasscode) {
      return { id: 1, name: 'Alex Morgan', email: email || 'alex.morgan@demo.com', role: 'Admin' };
    }
    const cleanEmail = email.trim().toLowerCase();
    const user = this.users.find((u) => u.email.toLowerCase() === cleanEmail);
    if (!user) return null;
    if (!verifyPassword(password, user.passwordHash)) return null;
    return { id: user.id, name: user.name, email: user.email, role: user.role };
  }

  async getBootstrap(user: AuthSessionUser | null) {
    if (isDbConnected()) {
      await this.syncFromDb();
    }
    return {
      workspaces: this.workspaces,
      teams: this.teams,
      developers: this.developers,
      datasources: this.datasources,
      datasourceObjects: this.datasourceObjects,
      authConfigs: this.authConfigs,
      authIdentifiers: this.authIdentifiers,
      collections: this.collections,
      endpoints: this.endpoints,
      endpointVersions: this.endpointVersions,
      deployments: this.deployments,
      alertConfigs: this.alertConfigs,
      environments: this.environments,
      dbConnected: isDbConnected(),
      authRequired: true,
      needsAdminClaim: this.needsAdminClaim(),
      user,
    };
  }

  // Workspaces / Teams / Developers
  async createWorkspace(input: { name: string; code: string; description: string }): Promise<Workspace> {
    const now = new Date().toISOString();
    const db = getDb();
    let id = this.nextId(this.workspaces);
    if (db && isDbConnected()) {
      const [row] = await db.insert(schema.workspaces).values({ ...input, active: true }).returning();
      id = row.id;
    }
    const ws: Workspace = { id, ...input, active: true, createdAt: now, updatedAt: now };
    this.workspaces.push(ws);
    return ws;
  }

  async createTeam(input: { workspaceId: number; name: string; description: string; leadEmail: string }): Promise<Team> {
    const now = new Date().toISOString();
    const db = getDb();
    let id = this.nextId(this.teams);
    if (db && isDbConnected()) {
      const [row] = await db.insert(schema.teams).values(input).returning();
      id = row.id;
    }
    const team: Team = { id, ...input, createdAt: now };
    this.teams.push(team);
    return team;
  }

  async createDeveloper(input: { workspaceId: number; teamId: number; name: string; email: string; role: Developer['role'] }): Promise<Developer> {
    const now = new Date().toISOString();
    const db = getDb();
    let id = this.nextId(this.developers);
    if (db && isDbConnected()) {
      const [row] = await db.insert(schema.developers).values({ ...input, active: true }).returning();
      id = row.id;
    }
    const dev: Developer = { id, ...input, active: true, createdAt: now };
    this.developers.push(dev);
    return dev;
  }

  // Datasources
  async createDatasource(input: Omit<Datasource, 'id' | 'createdAt' | 'updatedAt'>): Promise<Datasource> {
    const now = new Date().toISOString();
    const db = getDb();
    let id = this.nextId(this.datasources);
    if (db && isDbConnected()) {
      const [row] = await db.insert(schema.datasources).values(input).returning();
      id = row.id;
    }
    const ds: Datasource = { id, ...input, createdAt: now, updatedAt: now };
    this.datasources.push(ds);
    // Scaffold starter schema objects so the new datasource is immediately usable in Wizard
    const starterObj: DatasourceObject = {
      id: this.nextId(this.datasourceObjects),
      datasourceId: id,
      schemaName: 'public',
      objectName: 'records_catalog',
      objectType: 'table',
      columns: [
        { name: 'id', dataType: 'serial', nullable: false, isPrimaryKey: true, direction: 'COLUMN' },
        { name: 'code', dataType: 'varchar(64)', nullable: false, direction: 'COLUMN' },
        { name: 'label', dataType: 'varchar(160)', nullable: false, direction: 'COLUMN' },
        { name: 'status', dataType: 'varchar(32)', nullable: false, direction: 'COLUMN' },
      ],
    };
    if (db && isDbConnected()) {
      const [objRow] = await db
        .insert(schema.datasourceObjects)
        .values({
          datasourceId: starterObj.datasourceId,
          schemaName: starterObj.schemaName,
          objectName: starterObj.objectName,
          objectType: starterObj.objectType,
          columnsJson: starterObj.columns,
        })
        .returning();
      starterObj.id = objRow.id;
    }
    this.datasourceObjects.push(starterObj);
    return ds;
  }

  async updateDatasource(id: number, patch: Partial<Datasource>): Promise<Datasource | null> {
    const idx = this.datasources.findIndex((d) => d.id === id);
    if (idx === -1) return null;
    const updated: Datasource = { ...this.datasources[idx], ...patch, updatedAt: new Date().toISOString() };
    this.datasources[idx] = updated;
    const db = getDb();
    if (db && isDbConnected()) {
      await db
        .update(schema.datasources)
        .set({
          name: updated.name,
          teamId: updated.teamId,
          active: updated.active,
          host: updated.host,
          port: updated.port,
          databaseName: updated.databaseName,
          username: updated.username,
          sslMode: updated.sslMode,
          updatedAt: new Date(),
        })
        .where(eq(schema.datasources.id, id));
    }
    return updated;
  }

  async deleteDatasource(id: number): Promise<boolean> {
    const before = this.datasources.length;
    this.datasources = this.datasources.filter((d) => d.id !== id);
    this.datasourceObjects = this.datasourceObjects.filter((o) => o.datasourceId !== id);
    const db = getDb();
    if (db && isDbConnected()) {
      await db.delete(schema.datasources).where(eq(schema.datasources.id, id));
    }
    return this.datasources.length < before;
  }

  // Auth Configs & Identifiers
  async createAuthConfig(input: Omit<AuthConfig, 'id' | 'createdAt'>): Promise<AuthConfig> {
    const now = new Date().toISOString();
    const db = getDb();
    let id = this.nextId(this.authConfigs);
    if (db && isDbConnected()) {
      const [row] = await db.insert(schema.authConfigs).values(input).returning();
      id = row.id;
    }
    const cfg: AuthConfig = { id, ...input, createdAt: now };
    this.authConfigs.push(cfg);
    return cfg;
  }

  async createAuthIdentifier(input: {
    authConfigId: number;
    name: string;
    apiKey: string;
    secretRaw: string;
    usePlainSecret: boolean;
    customExpiredMinutes: number | null;
    scopes: string[];
  }): Promise<AuthIdentifier> {
    const now = new Date().toISOString();
    const expiredAt =
      input.customExpiredMinutes && input.customExpiredMinutes > 0
        ? new Date(Date.now() + input.customExpiredMinutes * 60_000).toISOString()
        : null;
    const secretHash = hashPassword(input.secretRaw);
    const db = getDb();
    let id = this.nextId(this.authIdentifiers);
    if (db && isDbConnected()) {
      const [row] = await db
        .insert(schema.authIdentifiers)
        .values({
          authConfigId: input.authConfigId,
          name: input.name,
          apiKey: input.apiKey,
          secretHash,
          secretMasked: input.secretRaw,
          usePlainSecret: input.usePlainSecret,
          customExpiredMinutes: input.customExpiredMinutes,
          expiredAt: expiredAt ? new Date(expiredAt) : null,
          scopesJson: input.scopes,
          active: true,
          locked: false,
        })
        .returning();
      id = row.id;
    }
    const item: AuthIdentifier = {
      id,
      authConfigId: input.authConfigId,
      name: input.name,
      apiKey: input.apiKey,
      secretMasked: input.secretRaw,
      usePlainSecret: input.usePlainSecret,
      customExpiredMinutes: input.customExpiredMinutes,
      expiredAt,
      scopes: input.scopes,
      active: true,
      locked: false,
      createdAt: now,
    };
    this.authIdentifiers.push(item);
    return item;
  }

  async updateAuthIdentifier(id: number, patch: Partial<AuthIdentifier>): Promise<AuthIdentifier | null> {
    const idx = this.authIdentifiers.findIndex((x) => x.id === id);
    if (idx === -1) return null;
    const updated = { ...this.authIdentifiers[idx], ...patch };
    this.authIdentifiers[idx] = updated;
    const db = getDb();
    if (db && isDbConnected()) {
      await db
        .update(schema.authIdentifiers)
        .set({
          name: updated.name,
          apiKey: updated.apiKey,
          secretMasked: updated.secretMasked,
          usePlainSecret: updated.usePlainSecret,
          customExpiredMinutes: updated.customExpiredMinutes,
          scopesJson: updated.scopes,
          active: updated.active,
          locked: updated.locked,
        })
        .where(eq(schema.authIdentifiers.id, id));
    }
    return updated;
  }

  async deleteAuthIdentifier(id: number): Promise<boolean> {
    const before = this.authIdentifiers.length;
    this.authIdentifiers = this.authIdentifiers.filter((x) => x.id !== id);
    const db = getDb();
    if (db && isDbConnected()) {
      await db.delete(schema.authIdentifiers).where(eq(schema.authIdentifiers.id, id));
    }
    return this.authIdentifiers.length < before;
  }

  // Collections
  async createCollection(input: {
    workspaceId: number;
    name: string;
    description: string;
    authConfigId: number | null;
    createdBy: string;
  }): Promise<Collection> {
    const now = new Date().toISOString();
    const db = getDb();
    let id = this.nextId(this.collections);
    if (db && isDbConnected()) {
      const [row] = await db
        .insert(schema.collections)
        .values({ ...input, active: true })
        .returning();
      id = row.id;
    }
    const col: Collection = { id, ...input, active: true, createdAt: now, updatedAt: now };
    this.collections.push(col);
    return col;
  }

  async updateCollection(id: number, patch: Partial<Collection>): Promise<Collection | null> {
    const idx = this.collections.findIndex((c) => c.id === id);
    if (idx === -1) return null;
    const updated = { ...this.collections[idx], ...patch, updatedAt: new Date().toISOString() };
    this.collections[idx] = updated;
    const db = getDb();
    if (db && isDbConnected()) {
      await db
        .update(schema.collections)
        .set({
          name: updated.name,
          description: updated.description,
          authConfigId: updated.authConfigId,
          active: updated.active,
          updatedAt: new Date(),
        })
        .where(eq(schema.collections.id, id));
    }
    return updated;
  }

  async deleteCollection(id: number): Promise<boolean> {
    const before = this.collections.length;
    const epIds = this.endpoints.filter((e) => e.collectionId === id).map((e) => e.id);
    this.collections = this.collections.filter((c) => c.id !== id);
    this.endpoints = this.endpoints.filter((e) => e.collectionId !== id);
    this.endpointVersions = this.endpointVersions.filter((v) => !epIds.includes(v.endpointId));
    const db = getDb();
    if (db && isDbConnected()) {
      await db.delete(schema.collections).where(eq(schema.collections.id, id));
    }
    return this.collections.length < before;
  }

  // Endpoints & Versions
  async createEndpointWithVersion(input: {
    collectionId: number;
    name: string;
    datasourceId: number;
    createdBy: string;
    version: Omit<EndpointVersion, 'id' | 'endpointId' | 'createdAt' | 'updatedAt'>;
  }): Promise<{ endpoint: Endpoint; version: EndpointVersion }> {
    const now = new Date().toISOString();
    const db = getDb();
    let epId = this.nextId(this.endpoints);
    if (db && isDbConnected()) {
      const [epRow] = await db
        .insert(schema.endpoints)
        .values({
          collectionId: input.collectionId,
          name: input.name,
          datasourceId: input.datasourceId,
          active: true,
          createdBy: input.createdBy,
        })
        .returning();
      epId = epRow.id;
    }
    const endpoint: Endpoint = {
      id: epId,
      collectionId: input.collectionId,
      name: input.name,
      datasourceId: input.datasourceId,
      active: true,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };
    this.endpoints.push(endpoint);

    const version = await this.createEndpointVersion(epId, input.version);
    return { endpoint, version };
  }

  async updateEndpoint(id: number, patch: Partial<Endpoint>): Promise<Endpoint | null> {
    const idx = this.endpoints.findIndex((e) => e.id === id);
    if (idx === -1) return null;
    const updated = { ...this.endpoints[idx], ...patch, updatedAt: new Date().toISOString() };
    this.endpoints[idx] = updated;
    const db = getDb();
    if (db && isDbConnected()) {
      await db
        .update(schema.endpoints)
        .set({
          name: updated.name,
          collectionId: updated.collectionId,
          datasourceId: updated.datasourceId,
          active: updated.active,
          updatedAt: new Date(),
        })
        .where(eq(schema.endpoints.id, id));
    }
    return updated;
  }

  async createEndpointVersion(
    endpointId: number,
    input: Omit<EndpointVersion, 'id' | 'endpointId' | 'createdAt' | 'updatedAt'>
  ): Promise<EndpointVersion> {
    const now = new Date().toISOString();
    const db = getDb();
    let id = this.nextId(this.endpointVersions);
    if (db && isDbConnected()) {
      const [row] = await db
        .insert(schema.endpointVersions)
        .values({
          endpointId,
          versionNumber: input.versionNumber,
          versionLabel: input.versionLabel,
          method: input.method,
          pathSegmentsJson: input.pathSegments,
          pathParamsJson: input.pathParams,
          headersJson: input.headers,
          bodyFieldsJson: input.bodyFields,
          dbSchema: input.dbSchema,
          dbObjectName: input.dbObjectName,
          dbObjectType: input.dbObjectType,
          crudOperation: input.crudOperation,
          sqlMappingJson: input.sqlMapping,
          paginationConfigJson: input.paginationConfig,
          status: input.status,
          active: input.active,
          scopesJson: input.scopes,
          description: input.description,
          globalProfiling: input.globalProfiling,
          endpointProfiling: input.endpointProfiling,
          rateLimiterEnabled: input.rateLimiterEnabled,
          rateLimiterBy: input.rateLimiterBy,
          rateLimiterMaxReq: input.rateLimiterMaxReq,
          rateLimiterWindow: input.rateLimiterWindow,
          rateLimiterMaxConcurrency: input.rateLimiterMaxConcurrency,
          circuitBreakerEnabled: input.circuitBreakerEnabled,
          circuitBreakerFailureThreshold: input.circuitBreakerFailureThreshold,
          circuitBreakerTimeoutSec: input.circuitBreakerTimeoutSec,
          circuitBreakerFallbackJson: input.circuitBreakerFallbackJson,
          cacheEnabled: input.cacheEnabled,
          cacheTtlSec: input.cacheTtlSec,
          cacheKeyStrategy: input.cacheKeyStrategy,
          useDefaultResponseFormat: input.useDefaultResponseFormat,
          createdBy: input.createdBy,
        })
        .returning();
      id = row.id;
    }
    const version: EndpointVersion = {
      ...input,
      id,
      endpointId,
      createdAt: now,
      updatedAt: now,
    };
    this.endpointVersions.push(version);
    return version;
  }

  async updateEndpointVersion(id: number, patch: Partial<EndpointVersion>): Promise<EndpointVersion | null> {
    const idx = this.endpointVersions.findIndex((v) => v.id === id);
    if (idx === -1) return null;
    const updated: EndpointVersion = {
      ...this.endpointVersions[idx],
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.endpointVersions[idx] = updated;
    const db = getDb();
    if (db && isDbConnected()) {
      await db
        .update(schema.endpointVersions)
        .set({
          method: updated.method,
          pathSegmentsJson: updated.pathSegments,
          pathParamsJson: updated.pathParams,
          headersJson: updated.headers,
          bodyFieldsJson: updated.bodyFields,
          dbSchema: updated.dbSchema,
          dbObjectName: updated.dbObjectName,
          dbObjectType: updated.dbObjectType,
          crudOperation: updated.crudOperation,
          sqlMappingJson: updated.sqlMapping,
          paginationConfigJson: updated.paginationConfig,
          status: updated.status,
          active: updated.active,
          scopesJson: updated.scopes,
          description: updated.description,
          globalProfiling: updated.globalProfiling,
          endpointProfiling: updated.endpointProfiling,
          rateLimiterEnabled: updated.rateLimiterEnabled,
          rateLimiterBy: updated.rateLimiterBy,
          rateLimiterMaxReq: updated.rateLimiterMaxReq,
          rateLimiterWindow: updated.rateLimiterWindow,
          rateLimiterMaxConcurrency: updated.rateLimiterMaxConcurrency,
          circuitBreakerEnabled: updated.circuitBreakerEnabled,
          circuitBreakerFailureThreshold: updated.circuitBreakerFailureThreshold,
          circuitBreakerTimeoutSec: updated.circuitBreakerTimeoutSec,
          circuitBreakerFallbackJson: updated.circuitBreakerFallbackJson,
          cacheEnabled: updated.cacheEnabled,
          cacheTtlSec: updated.cacheTtlSec,
          cacheKeyStrategy: updated.cacheKeyStrategy,
          useDefaultResponseFormat: updated.useDefaultResponseFormat,
          sitVersionTag: updated.sitVersionTag,
          sitDeployedAt: updated.sitDeployedAt ? new Date(updated.sitDeployedAt) : null,
          sitDeployedBy: updated.sitDeployedBy,
          prodVersionTag: updated.prodVersionTag,
          prodDeployedAt: updated.prodDeployedAt ? new Date(updated.prodDeployedAt) : null,
          prodDeployedBy: updated.prodDeployedBy,
          updatedAt: new Date(),
        })
        .where(eq(schema.endpointVersions.id, id));
    }
    return updated;
  }

  async deleteEndpointVersion(id: number): Promise<boolean> {
    const target = this.endpointVersions.find((v) => v.id === id);
    if (!target) return false;
    this.endpointVersions = this.endpointVersions.filter((v) => v.id !== id);
    const remaining = this.endpointVersions.filter((v) => v.endpointId === target.endpointId);
    const db = getDb();
    if (db && isDbConnected()) {
      await db.delete(schema.endpointVersions).where(eq(schema.endpointVersions.id, id));
    }
    if (remaining.length === 0) {
      this.endpoints = this.endpoints.filter((e) => e.id !== target.endpointId);
      if (db && isDbConnected()) {
        await db.delete(schema.endpoints).where(eq(schema.endpoints.id, target.endpointId));
      }
    }
    return true;
  }

  // Deployments
  async deployVersions(input: {
    versionIds: number[];
    environment: 'SIT' | 'PROD';
    deployedBy: string;
    notes: string;
  }): Promise<DeploymentRecord[]> {
    const now = new Date().toISOString();
    const created: DeploymentRecord[] = [];
    const db = getDb();

    for (const vid of input.versionIds) {
      const ver = this.endpointVersions.find((v) => v.id === vid);
      if (!ver) continue;
      const ep = this.endpoints.find((e) => e.id === ver.endpointId);
      const col = ep ? this.collections.find((c) => c.id === ep.collectionId) : null;
      const nextTag =
        input.environment === 'SIT'
          ? `0.${ver.versionNumber}+`
          : ver.sitVersionTag?.replace('+', '') || `0.${ver.versionNumber}`;

      await this.updateEndpointVersion(
        vid,
        input.environment === 'SIT'
          ? { sitVersionTag: nextTag, sitDeployedAt: now, sitDeployedBy: input.deployedBy, status: 'Published' }
          : { prodVersionTag: nextTag, prodDeployedAt: now, prodDeployedBy: input.deployedBy, status: 'Published' }
      );

      let depId = this.nextId(this.deployments);
      const rec: DeploymentRecord = {
        id: depId,
        endpointId: ver.endpointId,
        endpointVersionId: ver.id,
        endpointName: ep?.name || 'Endpoint',
        collectionName: col?.name || 'Collection',
        environment: input.environment,
        versionTag: nextTag,
        deployedBy: input.deployedBy,
        deployedAt: now,
        notes: input.notes || `Promoted to ${input.environment}`,
      };
      if (db && isDbConnected()) {
        const [row] = await db
          .insert(schema.deployments)
          .values({
            endpointId: rec.endpointId,
            endpointVersionId: rec.endpointVersionId,
            endpointName: rec.endpointName,
            collectionName: rec.collectionName,
            environment: rec.environment,
            versionTag: rec.versionTag,
            deployedBy: rec.deployedBy,
            notes: rec.notes,
          })
          .returning();
        rec.id = row.id;
      }
      this.deployments.unshift(rec);
      created.push(rec);
    }
    return created;
  }

  // Alerts & Environments
  async createAlert(input: Omit<AlertConfig, 'id'>): Promise<AlertConfig> {
    const db = getDb();
    let id = this.nextId(this.alertConfigs);
    if (db && isDbConnected()) {
      const [row] = await db.insert(schema.alertConfigs).values(input).returning();
      id = row.id;
    }
    const alert: AlertConfig = { id, ...input };
    this.alertConfigs.push(alert);
    return alert;
  }

  async updateEnvironment(id: number, patch: Partial<EnvironmentConfig>): Promise<EnvironmentConfig | null> {
    const idx = this.environments.findIndex((e) => e.id === id);
    if (idx === -1) return null;
    const updated = { ...this.environments[idx], ...patch, updatedAt: new Date().toISOString() };
    this.environments[idx] = updated;
    const db = getDb();
    if (db && isDbConnected()) {
      await db
        .update(schema.environments)
        .set({
          baseUrl: updated.baseUrl,
          gatewayHost: updated.gatewayHost,
          tlsEnabled: updated.tlsEnabled,
          autoPromote: updated.autoPromote,
          updatedAt: new Date(),
        })
        .where(eq(schema.environments.id, id));
    }
    return updated;
  }

  purgeCacheForVersion(versionId: number): number {
    let cleared = 0;
    for (const key of this.responseCache.keys()) {
      if (key.startsWith(`${versionId}:`)) {
        this.responseCache.delete(key);
        cleared++;
      }
    }
    return cleared;
  }

  resetCircuitForVersion(versionId: number): void {
    this.circuitStates.delete(versionId);
  }

  async testDatasourceConnection(id: number): Promise<{ ok: boolean; latencyMs: number; message: string }> {
    const ds = this.datasources.find((d) => d.id === id);
    if (!ds) {
      return { ok: false, latencyMs: 0, message: 'Datasource not found' };
    }
    const pool = getPgPool();
    if (pool && isDbConnected() && ds.engine === 'postgresql' && ds.host === process.env.DB_HOST?.trim()) {
      const start = performance.now();
      await pool.query('SELECT 1');
      const latencyMs = Math.max(1, Math.round(performance.now() - start));
      return {
        ok: true,
        latencyMs,
        message: `Live PostgreSQL handshake succeeded on ${ds.host}:${ds.port}/${ds.databaseName}`,
      };
    }
    if (ds.engine === 'postgresql' && process.env.DB_PASSWORD && ds.host === process.env.DB_HOST?.trim()) {
      const testPool = new pg.Pool({
        host: ds.host,
        port: ds.port,
        database: ds.databaseName,
        user: ds.username,
        password: process.env.DB_PASSWORD,
        ssl: ds.sslMode === 'disable' ? false : { rejectUnauthorized: false },
        connectionTimeoutMillis: 5000,
      });
      try {
        const start = performance.now();
        await testPool.query('SELECT 1');
        const latencyMs = Math.max(1, Math.round(performance.now() - start));
        return { ok: true, latencyMs, message: `PostgreSQL connection verified (${ds.host})` };
      } catch (err) {
        return {
          ok: false,
          latencyMs: 0,
          message: err instanceof Error ? err.message : 'Connection failed',
        };
      } finally {
        await testPool.end().catch(() => {});
      }
    }
    return {
      ok: false,
      latencyMs: 0,
      message: isDbConnected()
        ? `External datasource "${ds.name}" (${ds.host}:${ds.port}) has no live runtime credentials configured`
        : 'PostgreSQL environment variables (DB_HOST, DB_NAME, DB_USER, DB_PASSWORD) are not configured yet',
    };
  }

  // Request Logs Query (reads directly from PostgreSQL when connected)
  async getRequestLogs(filters?: {
    category?: string;
    errorOnly?: boolean;
    authConfigId?: number;
    authKeySearch?: string;
    versionId?: number;
    pathSearch?: string;
    minDuration?: number;
    maxDuration?: number;
    startInstant?: string;
    endInstant?: string;
  }): Promise<RequestLog[]> {
    const db = getDb();
    if (db && isDbConnected()) {
      const conds = [];
      if (filters?.category === 'rate_limiter') {
        conds.push(or(eq(schema.requestLogs.logCategory, 'rate_limiter'), eq(schema.requestLogs.statusCode, 429)));
      } else if (filters?.category === 'circuit_breaker') {
        conds.push(or(eq(schema.requestLogs.logCategory, 'circuit_breaker'), eq(schema.requestLogs.statusCode, 503)));
      }
      if (filters?.errorOnly) {
        conds.push(gte(schema.requestLogs.statusCode, 400));
      }
      if (filters?.authConfigId) {
        conds.push(eq(schema.requestLogs.authConfigId, filters.authConfigId));
      }
      if (filters?.authKeySearch) {
        conds.push(ilike(schema.requestLogs.authIdentifierLabel, `%${filters.authKeySearch}%`));
      }
      if (filters?.versionId) {
        conds.push(eq(schema.requestLogs.endpointVersionId, filters.versionId));
      }
      if (filters?.pathSearch) {
        conds.push(ilike(schema.requestLogs.path, `%${filters.pathSearch}%`));
      }
      if (typeof filters?.minDuration === 'number' && !Number.isNaN(filters.minDuration)) {
        conds.push(gte(schema.requestLogs.durationMs, filters.minDuration));
      }
      if (typeof filters?.maxDuration === 'number' && !Number.isNaN(filters.maxDuration)) {
        conds.push(lte(schema.requestLogs.durationMs, filters.maxDuration));
      }
      if (filters?.startInstant) {
        const startD = new Date(filters.startInstant.replace(' ', 'T'));
        if (!Number.isNaN(startD.getTime())) {
          conds.push(gte(schema.requestLogs.createdAt, startD));
        }
      }
      if (filters?.endInstant) {
        const endD = new Date(filters.endInstant.replace(' ', 'T'));
        if (!Number.isNaN(endD.getTime())) {
          conds.push(lte(schema.requestLogs.createdAt, endD));
        }
      }

      const rows = await db
        .select()
        .from(schema.requestLogs)
        .where(conds.length > 0 ? and(...conds) : undefined)
        .orderBy(desc(schema.requestLogs.createdAt), desc(schema.requestLogs.id))
        .limit(150);

      return rows.map((l) => ({
        id: l.id,
        requestKey: l.requestKey,
        collectionId: l.collectionId,
        collectionName: l.collectionName,
        endpointId: l.endpointId,
        endpointName: l.endpointName,
        endpointVersionId: l.endpointVersionId,
        versionLabel: l.versionLabel,
        datasourceId: l.datasourceId,
        datasourceName: l.datasourceName,
        datasourceEngine: l.datasourceEngine as Datasource['engine'],
        authConfigId: l.authConfigId,
        authSourceLabel: l.authSourceLabel,
        authIdentifierLabel: l.authIdentifierLabel,
        method: l.method as HttpMethod,
        path: l.path,
        statusCode: l.statusCode,
        statusMessage: l.statusMessage,
        durationMs: l.durationMs,
        requestHeaders: l.requestHeadersJson,
        requestBody: l.requestBodyJson,
        responseBody: l.responseBodyJson,
        profilerSteps: l.profilerStepsJson,
        errorStack: l.errorStack,
        logCategory: l.logCategory as RequestLog['logCategory'],
        createdAt: l.createdAt.toISOString(),
      }));
    }

    let logs = this.requestLogs;
    if (filters?.category && filters.category !== 'all') {
      if (filters.category === 'rate_limiter') {
        logs = logs.filter((l) => l.logCategory === 'rate_limiter' || l.statusCode === 429);
      } else if (filters.category === 'circuit_breaker') {
        logs = logs.filter((l) => l.logCategory === 'circuit_breaker' || l.statusCode === 503);
      }
    }
    if (filters?.errorOnly) {
      logs = logs.filter((l) => l.statusCode >= 400);
    }
    if (filters?.authConfigId) {
      logs = logs.filter((l) => l.authConfigId === filters.authConfigId);
    }
    if (filters?.authKeySearch) {
      const q = filters.authKeySearch.toLowerCase();
      logs = logs.filter((l) => l.authIdentifierLabel.toLowerCase().includes(q));
    }
    if (filters?.versionId) {
      logs = logs.filter((l) => l.endpointVersionId === filters.versionId);
    }
    if (filters?.pathSearch) {
      const q = filters.pathSearch.toLowerCase();
      logs = logs.filter((l) => l.path.toLowerCase().includes(q));
    }
    if (typeof filters?.minDuration === 'number' && !Number.isNaN(filters.minDuration)) {
      logs = logs.filter((l) => l.durationMs >= filters.minDuration!);
    }
    if (typeof filters?.maxDuration === 'number' && !Number.isNaN(filters.maxDuration)) {
      logs = logs.filter((l) => l.durationMs <= filters.maxDuration!);
    }
    if (filters?.startInstant) {
      const startMs = new Date(filters.startInstant.replace(' ', 'T')).getTime();
      if (!Number.isNaN(startMs)) {
        logs = logs.filter((l) => new Date(l.createdAt).getTime() >= startMs);
      }
    }
    if (filters?.endInstant) {
      const endMs = new Date(filters.endInstant.replace(' ', 'T')).getTime();
      if (!Number.isNaN(endMs)) {
        logs = logs.filter((l) => new Date(l.createdAt).getTime() <= endMs);
      }
    }
    return [...logs]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 150);
  }

  // Live API Execution Gateway (Test Runner & Runtime API)
  async executeRuntimeRequest(input: {
    versionId: number;
    headers: Record<string, string>;
    body: Record<string, unknown> | null;
    queryParams: Record<string, string>;
    pathParamValues: Record<string, string>;
    clientIp: string;
    simulateUpstreamError?: boolean;
  }): Promise<RequestLog> {
    const ver = this.endpointVersions.find((v) => v.id === input.versionId);
    if (!ver) {
      throw new Error('Endpoint version not found');
    }
    const ep = this.endpoints.find((e) => e.id === ver.endpointId)!;
    const col = this.collections.find((c) => c.id === ep.collectionId)!;
    const ds = this.datasources.find((d) => d.id === ep.datasourceId)!;
    const authCfg = col.authConfigId
      ? this.authConfigs.find((a) => a.id === col.authConfigId) || null
      : null;

    const resolvedSegments = ver.pathSegments.map((seg) => {
      if (seg.startsWith('{') && seg.endsWith('}')) {
        const paramKey = seg.slice(1, -1);
        return input.pathParamValues[paramKey] || seg;
      }
      return seg;
    });
    const fullPath = `/${ver.versionLabel.toLowerCase().replace('.', '')}/${resolvedSegments.join('/')}`;

    const steps: ProfilerStep[] = [
      { stage: 'Start', durationMs: 0, instantOffsetMs: 0, action: 'Start Request Pipeline', espace: 'Gateway', iconType: 'start' },
    ];
    let offset = 0;
    const addStep = (
      stage: string,
      durationMs: number,
      action: string,
      espace: string,
      iconType: ProfilerStep['iconType']
    ) => {
      steps.push({ stage, durationMs, instantOffsetMs: offset, action, espace, iconType });
      offset += durationMs;
    };

    const recordAndReturn = async (
      statusCode: number,
      statusMessage: string,
      responseBody: unknown,
      authIdentifierLabel: string,
      errorStack: string | null,
      logCategory: RequestLog['logCategory']
    ): Promise<RequestLog> => {
      const durationMs = Math.max(offset, 6);
      const log: RequestLog = {
        id: this.nextId(this.requestLogs),
        requestKey: crypto.randomUUID(),
        collectionId: col.id,
        collectionName: col.name,
        endpointId: ep.id,
        endpointName: ep.name,
        endpointVersionId: ver.id,
        versionLabel: ver.versionLabel,
        datasourceId: ds.id,
        datasourceName: ds.name,
        datasourceEngine: ds.engine,
        authConfigId: authCfg?.id || null,
        authSourceLabel: authCfg ? `[${authCfg.providerType}] ${authCfg.name}` : 'Public (No Auth)',
        authIdentifierLabel,
        method: ver.method,
        path: fullPath,
        statusCode,
        statusMessage,
        durationMs,
        requestHeaders: input.headers,
        requestBody: input.body,
        responseBody,
        profilerSteps: steps,
        errorStack,
        logCategory,
        createdAt: new Date().toISOString(),
      };

      const db = getDb();
      if (db && isDbConnected()) {
        const [inserted] = await db
          .insert(schema.requestLogs)
          .values({
            requestKey: log.requestKey,
            collectionId: log.collectionId,
            collectionName: log.collectionName,
            endpointId: log.endpointId,
            endpointName: log.endpointName,
            endpointVersionId: log.endpointVersionId,
            versionLabel: log.versionLabel,
            datasourceId: log.datasourceId,
            datasourceName: log.datasourceName,
            datasourceEngine: log.datasourceEngine,
            authConfigId: log.authConfigId,
            authSourceLabel: log.authSourceLabel,
            authIdentifierLabel: log.authIdentifierLabel,
            method: log.method,
            path: log.path,
            statusCode: log.statusCode,
            statusMessage: log.statusMessage,
            durationMs: log.durationMs,
            requestHeadersJson: log.requestHeaders,
            requestBodyJson: log.requestBody,
            responseBodyJson: log.responseBody,
            profilerStepsJson: log.profilerSteps,
            errorStack: log.errorStack,
            logCategory: log.logCategory,
          })
          .returning();
        log.id = inserted.id;
      }

      this.requestLogs.unshift(log);
      return log;
    };

    // 1. ValidateRequest (real timing)
    const tValidateStart = performance.now();
    const isInactive = !ver.active || !ep.active || !col.active;
    const validateMs = Math.max(1, Math.round(performance.now() - tValidateStart));
    addStep('ValidateRequest(...)', validateMs, 'ValidateRequest', 'REST API', 'validate');

    if (isInactive) {
      return recordAndReturn(
        404,
        '[404] Endpoint Inactive',
        { status: 404, message: 'Endpoint or collection is currently inactive' },
        'Anonymous',
        'EndpointInactiveException: Target version is disabled',
        'request'
      );
    }

    // 2. ValidateAuthentication (Collection-Level Auth, real timing)
    const tAuthStart = performance.now();
    let authIdentifierLabel = 'Anonymous';
    if (authCfg && authCfg.active) {
      const providedKey =
        input.headers[authCfg.headerKeyName] ||
        input.headers[authCfg.headerKeyName.toLowerCase()] ||
        '';
      const providedSecret =
        input.headers[authCfg.headerSecretName] ||
        input.headers[authCfg.headerSecretName.toLowerCase()] ||
        '';

      const validIdent = this.authIdentifiers.find(
        (ident) =>
          ident.authConfigId === authCfg.id &&
          ident.active &&
          !ident.locked &&
          ident.apiKey === providedKey &&
          (!authCfg.headerSecretName || providedSecret.length > 0)
      );

      const authMs = Math.max(1, Math.round(performance.now() - tAuthStart));
      if (!validIdent) {
        addStep('ValidateAuthentication(...)', authMs, 'ValidateAuthentication (401)', authCfg.providerType, 'error');
        return recordAndReturn(
          401,
          '[401] Unauthorized',
          {
            status: 401,
            message: `Invalid or missing ${authCfg.headerKeyName} / ${authCfg.headerSecretName} credentials for Collection "${col.name}"`,
          },
          providedKey || 'Missing Auth Key',
          `AuthenticationException: Failed ${authCfg.providerType} verification on Collection "${col.name}"`,
          'request'
        );
      }

      if (ver.scopes.length > 0 && !validIdent.scopes.includes('Read All')) {
        const hasScope = ver.scopes.some((s) => validIdent.scopes.includes(s));
        if (!hasScope) {
          addStep('ValidateAuthentication(...)', authMs, 'Scope Check Failed (403)', authCfg.providerType, 'error');
          return recordAndReturn(
            403,
            '[403] Forbidden (Insufficient Scope)',
            { status: 403, message: `Client "${validIdent.name}" lacks required endpoint scope: ${ver.scopes.join(', ')}` },
            `${validIdent.name} (${validIdent.apiKey})`,
            `AuthorizationException: Missing scope ${ver.scopes.join(', ')}`,
            'request'
          );
        }
      }

      authIdentifierLabel = `${validIdent.name} (${validIdent.apiKey})`;
      addStep('ValidateAuthentication(...)', authMs, 'ValidateAuthentication', authCfg.providerType, 'auth');
    } else {
      addStep('ValidateAuthentication(...)', 1, 'No Auth Required', 'Gateway', 'auth');
    }

    // 3. CheckRateLimiter (real timing)
    const tRlStart = performance.now();
    if (ver.rateLimiterEnabled) {
      const windowMs =
        ver.rateLimiterWindow === '1h' ? 3600_000 : ver.rateLimiterWindow === '5m' ? 300_000 : 60_000;
      const rlKey = `${ver.id}:${ver.rateLimiterBy === 'By IP' ? input.clientIp : authIdentifierLabel}`;
      const nowMs = Date.now();
      const bucket = this.rateLimitBuckets.get(rlKey);
      if (!bucket || nowMs - bucket.windowStart > windowMs) {
        this.rateLimitBuckets.set(rlKey, { count: 1, windowStart: nowMs });
      } else {
        bucket.count += 1;
        if (bucket.count > ver.rateLimiterMaxReq) {
          const rlMs = Math.max(1, Math.round(performance.now() - tRlStart));
          addStep('CheckRateLimiter(...)', rlMs, 'CheckRateLimiter (429)', 'Resilience', 'error');
          return recordAndReturn(
            429,
            '[429] Too Many Requests',
            {
              status: 429,
              message: `Rate limit exceeded (${ver.rateLimiterMaxReq} req / ${ver.rateLimiterWindow} ${ver.rateLimiterBy})`,
            },
            authIdentifierLabel,
            `RateLimiterException: Quota ${ver.rateLimiterMaxReq}/${ver.rateLimiterWindow} exceeded for ${rlKey}`,
            'rate_limiter'
          );
        }
      }
      const rlMs = Math.max(1, Math.round(performance.now() - tRlStart));
      addStep('CheckRateLimiter(...)', rlMs, 'CheckRateLimiter', 'Resilience', 'ratelimit');
    } else {
      addStep('CheckRateLimiter(...)', 0, 'RateLimiter Disabled', 'Resilience', 'ratelimit');
    }

    // 4. CheckCircuitBreaker (real timing)
    const tCbStart = performance.now();
    if (ver.circuitBreakerEnabled) {
      const state = this.circuitStates.get(ver.id);
      if (state && Date.now() < state.openUntil) {
        const cbMs = Math.max(1, Math.round(performance.now() - tCbStart));
        addStep('CheckCircuitBreaker(...)', cbMs, 'CheckCircuitBreaker (OPEN)', 'Resilience', 'error');
        return recordAndReturn(
          503,
          '[503] Circuit Open',
          ver.circuitBreakerFallbackJson,
          authIdentifierLabel,
          `CircuitBreakerOpenException: Circuit open for ${ver.circuitBreakerTimeoutSec}s`,
          'circuit_breaker'
        );
      }
      const cbMs = Math.max(1, Math.round(performance.now() - tCbStart));
      addStep('CheckCircuitBreaker(...)', cbMs, 'CheckCircuitBreaker', 'Resilience', 'circuit');
    }

    // 5. CheckCache
    const cacheKey = `${ver.id}:${ver.cacheKeyStrategy}:${JSON.stringify(input.queryParams)}:${JSON.stringify(input.body)}`;
    if ((ver.cacheEnabled && ver.method === 'GET') || (ver.cacheEnabled && ver.crudOperation === 'execute_rpc')) {
      const cached = this.responseCache.get(cacheKey);
      if (cached && Date.now() < cached.expiresAt) {
        addStep('CheckCache(...)', 1, `Cache Hit (TTL ${ver.cacheTtlSec}s)`, 'Cache Layer', 'cache');
        const payload = ver.useDefaultResponseFormat
          ? { status: 200, message: 'Success', cached: true, data: cached.value }
          : cached.value;
        return recordAndReturn(200, '[200] OK (Cache Hit)', payload, authIdentifierLabel, null, 'request');
      }
    }

    // Simulate upstream DB failure if explicitly toggled in Test Console
    if (input.simulateUpstreamError) {
      addStep('RunDataExecutor(...)', 5, 'RunDataExecutor (DB Fault)', ds.engine.toUpperCase(), 'error');
      if (ver.circuitBreakerEnabled) {
        const cur = this.circuitStates.get(ver.id) || { failures: 0, openUntil: 0 };
        cur.failures += 1;
        if (cur.failures >= 2) {
          cur.openUntil = Date.now() + ver.circuitBreakerTimeoutSec * 1000;
        }
        this.circuitStates.set(ver.id, cur);
      }
      return recordAndReturn(
        500,
        '[500] Upstream Database Error',
        { status: 500, message: `Upstream execution error on ${ds.name} (${ver.dbSchema}.${ver.dbObjectName})` },
        authIdentifierLabel,
        `DataExecutorException: Connection timeout on ${ds.host}:${ds.port}/${ds.databaseName}`,
        'request'
      );
    }

    // 6. BuildDataExecutorParameter & RunDataExecutor (live PostgreSQL execution when connected)
    addStep('BuildDataExecutorParameter(...)', 1, 'BuildDataExecutorParameter', 'Data Executor', 'build');
    const tExecStart = performance.now();
    const safeIdent = (s: string) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s);

    const pgPool = getPgPool();
    let resultData: unknown = [];

    if (pgPool && isDbConnected() && safeIdent(ver.dbSchema) && safeIdent(ver.dbObjectName)) {
      const qualified = `"${ver.dbSchema}"."${ver.dbObjectName}"`;
      try {
        if (ver.dbObjectType === 'table') {
          if (ver.crudOperation === 'select') {
            const limit = Math.min(
              ver.paginationConfig.maxLimit || 200,
              Math.max(1, Number(input.queryParams[ver.paginationConfig.limitParam] || ver.paginationConfig.defaultLimit || 25))
            );
            const offset = Math.max(0, Number(input.queryParams[ver.paginationConfig.offsetParam] || 0));
            const res = await pgPool.query(`SELECT * FROM ${qualified} LIMIT $1 OFFSET $2`, [limit, offset]);
            resultData = res.rows;
          } else if (ver.crudOperation === 'select_by_id') {
            const paramKey = ver.pathParams[0]?.paramName || 'id';
            const val = input.pathParamValues[paramKey] || input.queryParams[paramKey];
            const colName = ver.pathParams[0]?.mappedColumn || 'id';
            if (!safeIdent(colName)) throw new Error('Invalid mapped column name');
            const res = await pgPool.query(`SELECT * FROM ${qualified} WHERE "${colName}"::text = $1`, [String(val ?? '')]);
            resultData = res.rows;
          } else if (ver.crudOperation === 'insert') {
            const entries = Object.entries(input.body || {}).filter(([k]) => safeIdent(k));
            if (entries.length === 0) throw new Error('At least one valid column value is required for insert');
            const colsSql = entries.map(([k]) => `"${k}"`).join(', ');
            const valsSql = entries.map((_, i) => `$${i + 1}`).join(', ');
            const res = await pgPool.query(
              `INSERT INTO ${qualified} (${colsSql}) VALUES (${valsSql}) RETURNING *`,
              entries.map(([, v]) => v)
            );
            resultData = res.rows[0];
          } else if (ver.crudOperation === 'update') {
            const paramKey = ver.pathParams[0]?.paramName || 'id';
            const val = input.pathParamValues[paramKey] || (input.body?.[paramKey] as string);
            const colName = ver.pathParams[0]?.mappedColumn || 'id';
            if (!safeIdent(colName)) throw new Error('Invalid mapped column name');
            const entries = Object.entries(input.body || {}).filter(([k]) => safeIdent(k) && k !== colName);
            if (entries.length === 0) throw new Error('At least one valid column value is required for update');
            const setSql = entries.map(([k], i) => `"${k}" = $${i + 1}`).join(', ');
            const res = await pgPool.query(
              `UPDATE ${qualified} SET ${setSql} WHERE "${colName}"::text = $${entries.length + 1} RETURNING *`,
              [...entries.map(([, v]) => v), String(val ?? '')]
            );
            resultData = res.rows[0] || { updated: 0 };
          } else if (ver.crudOperation === 'delete') {
            const paramKey = ver.pathParams[0]?.paramName || 'id';
            const val = input.pathParamValues[paramKey] || input.queryParams[paramKey];
            const colName = ver.pathParams[0]?.mappedColumn || 'id';
            if (!safeIdent(colName)) throw new Error('Invalid mapped column name');
            const res = await pgPool.query(`DELETE FROM ${qualified} WHERE "${colName}"::text = $1`, [String(val ?? '')]);
            resultData = { deleted: res.rowCount || 0 };
          }
        } else if (ver.dbObjectType === 'view') {
          const limit = Math.min(
            ver.paginationConfig.maxLimit || 200,
            Math.max(1, Number(input.queryParams[ver.paginationConfig.limitParam] || ver.paginationConfig.defaultLimit || 25))
          );
          const offset = Math.max(0, Number(input.queryParams[ver.paginationConfig.offsetParam] || 0));
          const res = await pgPool.query(`SELECT * FROM ${qualified} LIMIT $1 OFFSET $2`, [limit, offset]);
          resultData = res.rows;
        } else {
          // Live PostgreSQL function / stored procedure invocation
          if (ver.dbObjectName === 'sp_master_location_select') {
            const res = await pgPool.query(
              `SELECT * FROM network_management.sp_master_location_select($1, $2, $3)`,
              [
                input.body?.var_location_type ?? null,
                input.body?.var_parent_location_code ?? null,
                input.body?.var_location_name ?? null,
              ]
            );
            resultData = res.rows;
          } else if (ver.dbObjectName === 'fn_resolve_service_coverage') {
            const res = await pgPool.query(
              `SELECT * FROM network_management.fn_resolve_service_coverage($1, $2, $3)`,
              [
                String(input.body?.origin_district || '31.74.01'),
                String(input.body?.dest_district || '32.73.02'),
                String(input.body?.service_tier || 'NEXT_DAY'),
              ]
            );
            resultData = res.rows[0] || null;
          } else if (ver.dbObjectName === 'sp_get_user_permission') {
            const res = await pgPool.query(
              `SELECT * FROM secure_access.sp_get_user_permission($1, $2)`,
              [
                String(input.body?.var_user_id || 'USR-10042'),
                input.body?.var_app_code ? String(input.body.var_app_code) : null,
              ]
            );
            resultData = res.rows;
          } else {
            const paramValues = ver.bodyFields.map((f) => input.body?.[f.name] ?? null);
            const placeholders = paramValues.map((_, i) => `$${i + 1}`).join(', ');
            const res = await pgPool.query(`SELECT * FROM ${qualified}(${placeholders})`, paramValues);
            resultData = res.rows;
          }
        }
      } catch (sqlErr) {
        const execMs = Math.max(1, Math.round(performance.now() - tExecStart));
        addStep('RunDataExecutor(...)', execMs, `RunDataExecutor (SQL Error)`, ds.engine.toUpperCase(), 'error');
        return recordAndReturn(
          500,
          '[500] Database Query Error',
          { status: 500, message: sqlErr instanceof Error ? sqlErr.message : 'Database execution error' },
          authIdentifierLabel,
          sqlErr instanceof Error ? sqlErr.stack || sqlErr.message : 'SQL execution failed',
          'request'
        );
      }
    } else {
      // Fallback store execution when DB env vars are not configured yet
      const tableKey = `${ver.dbSchema}.${ver.dbObjectName}`;
      if (ver.dbObjectType === 'table') {
        const rows = this.virtualTables[tableKey] || [];
        if (ver.crudOperation === 'select') {
          const limit = Number(input.queryParams[ver.paginationConfig.limitParam] || ver.paginationConfig.defaultLimit || 25);
          const offset = Number(input.queryParams[ver.paginationConfig.offsetParam] || 0);
          resultData = rows.slice(offset, offset + limit);
        } else if (ver.crudOperation === 'select_by_id') {
          const paramKey = ver.pathParams[0]?.paramName || 'id';
          const val = input.pathParamValues[paramKey] || input.queryParams[paramKey];
          const colName = ver.pathParams[0]?.mappedColumn || 'id';
          resultData = rows.filter((r) => String(r[colName]) === String(val));
        } else if (ver.crudOperation === 'insert') {
          const newRow = { id: rows.length + 1, ...(input.body || {}) };
          if (!this.virtualTables[tableKey]) this.virtualTables[tableKey] = [];
          this.virtualTables[tableKey].push(newRow);
          resultData = newRow;
        } else if (ver.crudOperation === 'update') {
          const paramKey = ver.pathParams[0]?.paramName || 'id';
          const val = input.pathParamValues[paramKey] || (input.body?.[paramKey] as string);
          const colName = ver.pathParams[0]?.mappedColumn || 'id';
          const idx = rows.findIndex((r) => String(r[colName]) === String(val));
          if (idx !== -1) {
            rows[idx] = { ...rows[idx], ...(input.body || {}) };
            resultData = rows[idx];
          } else {
            resultData = { updated: 0 };
          }
        } else if (ver.crudOperation === 'delete') {
          const paramKey = ver.pathParams[0]?.paramName || 'id';
          const val = input.pathParamValues[paramKey] || input.queryParams[paramKey];
          const colName = ver.pathParams[0]?.mappedColumn || 'id';
          const prevLen = rows.length;
          this.virtualTables[tableKey] = rows.filter((r) => String(r[colName]) !== String(val));
          resultData = { deleted: prevLen - this.virtualTables[tableKey].length };
        }
      } else if (ver.dbObjectType === 'view') {
        const baseRows = this.virtualTables['network_management.master_locations'] || [];
        resultData = baseRows
          .filter((r) => r.location_type === 'DISTRICT')
          .map((r) => ({
            district_code: r.location_code,
            district_name: r.location_name,
            city_name: 'JAKARTA SELATAN',
            province_name: 'DKI JAKARTA',
            hub_code: 'CGK-TBT01',
          }));
      } else if (ver.dbObjectName === 'sp_master_location_select') {
        const all = this.virtualTables['network_management.master_locations'] || [];
        const fType = input.body?.var_location_type ? String(input.body.var_location_type).toUpperCase() : null;
        const fParent = input.body?.var_parent_location_code ? String(input.body.var_parent_location_code) : null;
        const fName = input.body?.var_location_name ? String(input.body.var_location_name).toUpperCase() : null;
        resultData = all.filter(
          (r) =>
            (!fType || String(r.location_type).toUpperCase() === fType) &&
            (!fParent || String(r.parent_location_code) === fParent) &&
            (!fName || String(r.location_name).toUpperCase().includes(fName))
        );
      } else if (ver.dbObjectName === 'fn_resolve_service_coverage') {
        resultData = {
          origin_district: input.body?.origin_district || '31.74.01',
          dest_district: input.body?.dest_district || '32.73.02',
          service_tier: input.body?.service_tier || 'NEXT_DAY',
          sla_hours: 24,
          is_covered: true,
        };
      } else if (ver.dbObjectName === 'sp_get_user_permission') {
        resultData = [
          { role_code: 'PLATFORM_ADMIN', permission_key: 'ENDPOINT_DEPLOY' },
          { role_code: 'OPS_SUPERVISOR', permission_key: 'COD_VIEW' },
        ];
      } else {
        resultData = [];
      }
    }

    const execMs = Math.max(1, Math.round(performance.now() - tExecStart));
    addStep('RunDataExecutor(...)', execMs, `RunDataExecutor (${ver.dbObjectType})`, ds.engine.toUpperCase(), 'execute');

    // 7. BuildPagination (real timing)
    const tPageStart = performance.now();
    if (ver.paginationConfig.enabled) {
      const pageMs = Math.max(1, Math.round(performance.now() - tPageStart));
      addStep('BuildPagination(...)', pageMs, 'BuildPagination', 'REST API', 'pagination');
    }

    if (ver.cacheEnabled) {
      this.responseCache.set(cacheKey, {
        value: resultData,
        expiresAt: Date.now() + ver.cacheTtlSec * 1000,
      });
    }

    const finalBody = ver.useDefaultResponseFormat
      ? {
          status: 200,
          message: 'Success',
          data: resultData,
          ...(ver.paginationConfig.enabled
            ? {
                pagination: {
                  limit: ver.paginationConfig.defaultLimit,
                  offset: Number(input.queryParams[ver.paginationConfig.offsetParam] || 0),
                  total: Array.isArray(resultData) ? resultData.length : 1,
                },
              }
            : {}),
        }
      : resultData;

    return recordAndReturn(200, '[200] OK', finalBody, authIdentifierLabel, null, 'request');
  }

  async getDashboardAnalytics(options?: {
    range?: 'today' | '1w' | 'custom';
    startDate?: string;
    endDate?: string;
    authKey?: string;
    endpointPath?: string;
  }): Promise<DashboardAnalytics> {
    if (isDbConnected()) {
      await this.syncFromDb();
    }

    const range = options?.range || 'today';
    const todayStr = new Date().toISOString().slice(0, 10);
    const weekAgoStr = new Date(Date.now() - 6 * 86400_000).toISOString().slice(0, 10);

    const startDate =
      range === 'today'
        ? options?.startDate || todayStr
        : range === '1w'
        ? weekAgoStr
        : options?.startDate || weekAgoStr;
    const endDate =
      range === 'today'
        ? options?.endDate || todayStr
        : range === '1w'
        ? todayStr
        : options?.endDate || todayStr;

    const startMs = new Date(`${startDate}T00:00:00`).getTime();
    const endMs = new Date(`${endDate}T23:59:59.999`).getTime();
    const safeStart = Number.isNaN(startMs) ? Date.now() - 86400_000 : startMs;
    const safeEnd = Number.isNaN(endMs) || endMs < safeStart ? safeStart + 86400_000 : endMs;
    const daySpan = Math.max(1, Math.round((safeEnd - safeStart) / 86400_000));

    const authKey = options?.authKey?.trim() || '';
    const endpointPath = options?.endpointPath?.trim() || '';

    // 100% real aggregation from persisted request logs in PostgreSQL
    const db = getDb();
    let logsInWindow: RequestLog[];
    if (db && isDbConnected()) {
      const conds = [
        gte(schema.requestLogs.createdAt, new Date(safeStart)),
        lte(schema.requestLogs.createdAt, new Date(safeEnd)),
      ];
      if (authKey) {
        conds.push(ilike(schema.requestLogs.authIdentifierLabel, `%${authKey}%`));
      }
      if (endpointPath) {
        conds.push(ilike(schema.requestLogs.path, `%${endpointPath}%`));
      }
      const rows = await db
        .select()
        .from(schema.requestLogs)
        .where(and(...conds))
        .orderBy(desc(schema.requestLogs.createdAt));

      logsInWindow = rows.map((l) => ({
        id: l.id,
        requestKey: l.requestKey,
        collectionId: l.collectionId,
        collectionName: l.collectionName,
        endpointId: l.endpointId,
        endpointName: l.endpointName,
        endpointVersionId: l.endpointVersionId,
        versionLabel: l.versionLabel,
        datasourceId: l.datasourceId,
        datasourceName: l.datasourceName,
        datasourceEngine: l.datasourceEngine as Datasource['engine'],
        authConfigId: l.authConfigId,
        authSourceLabel: l.authSourceLabel,
        authIdentifierLabel: l.authIdentifierLabel,
        method: l.method as HttpMethod,
        path: l.path,
        statusCode: l.statusCode,
        statusMessage: l.statusMessage,
        durationMs: l.durationMs,
        requestHeaders: l.requestHeadersJson,
        requestBody: l.requestBodyJson,
        responseBody: l.responseBodyJson,
        profilerSteps: l.profilerStepsJson,
        errorStack: l.errorStack,
        logCategory: l.logCategory as RequestLog['logCategory'],
        createdAt: l.createdAt.toISOString(),
      }));
    } else {
      logsInWindow = this.requestLogs.filter((l) => {
        const t = new Date(l.createdAt).getTime();
        if (t < safeStart || t > safeEnd) return false;
        if (authKey && !l.authIdentifierLabel.toLowerCase().includes(authKey.toLowerCase())) return false;
        if (endpointPath && !l.path.toLowerCase().includes(endpointPath.toLowerCase())) return false;
        return true;
      });
    }

    const bucketCount = daySpan <= 1 ? 12 : Math.min(18, daySpan * 2);
    const totalWindowMs = Math.max(3600_000, safeEnd - safeStart + 1);
    const stepMs = Math.max(1, Math.floor(totalWindowMs / bucketCount));

    const fmtRange = (ms: number) => {
      const d = new Date(ms);
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    const fmtLabel = (ms: number) => {
      const d = new Date(ms);
      const pad = (n: number) => String(n).padStart(2, '0');
      if (daySpan <= 1) {
        return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
      }
      return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:00`;
    };

    const series = Array.from({ length: bucketCount }, (_, i) => {
      const bStart = safeStart + i * stepMs;
      const bEnd = i === bucketCount - 1 ? safeEnd : Math.min(safeEnd, bStart + stepMs - 1);
      const bucketLogs = logsInWindow.filter((l) => {
        const t = new Date(l.createdAt).getTime();
        return t >= bStart && t <= bEnd;
      });
      const reqs = bucketLogs.length;
      const errs = bucketLogs.filter((l) => l.statusCode >= 400).length;
      const avgLat =
        reqs > 0 ? Math.round(bucketLogs.reduce((a, b) => a + b.durationMs, 0) / reqs) : 0;
      return {
        label: fmtLabel(bStart),
        rangeStart: fmtRange(bStart),
        rangeEnd: fmtRange(bEnd),
        requests: reqs,
        errors: errs,
        avgLatencyMs: avgLat,
      };
    });

    const totalRequests = logsInWindow.length;
    const totalErrors = logsInWindow.filter((l) => l.statusCode >= 400).length;
    const peakReqBar = series.reduce((best, cur) => (cur.requests > best.requests ? cur : best), series[0]);
    const peakErrBar = series.reduce((best, cur) => (cur.errors > best.errors ? cur : best), series[0]);
    const avgDurationMs =
      totalRequests > 0
        ? Math.round(logsInWindow.reduce((a, b) => a + b.durationMs, 0) / totalRequests)
        : 0;

    // Top 10 Auth Identifiers aggregated strictly from database logs in window
    let logsForLeaderboards = logsInWindow;
    if (authKey || endpointPath) {
      if (db && isDbConnected()) {
        const allWindowRows = await db
          .select()
          .from(schema.requestLogs)
          .where(
            and(
              gte(schema.requestLogs.createdAt, new Date(safeStart)),
              lte(schema.requestLogs.createdAt, new Date(safeEnd))
            )
          )
          .orderBy(desc(schema.requestLogs.createdAt));
        logsForLeaderboards = allWindowRows.map((l) => ({
          id: l.id,
          requestKey: l.requestKey,
          collectionId: l.collectionId,
          collectionName: l.collectionName,
          endpointId: l.endpointId,
          endpointName: l.endpointName,
          endpointVersionId: l.endpointVersionId,
          versionLabel: l.versionLabel,
          datasourceId: l.datasourceId,
          datasourceName: l.datasourceName,
          datasourceEngine: l.datasourceEngine as Datasource['engine'],
          authConfigId: l.authConfigId,
          authSourceLabel: l.authSourceLabel,
          authIdentifierLabel: l.authIdentifierLabel,
          method: l.method as HttpMethod,
          path: l.path,
          statusCode: l.statusCode,
          statusMessage: l.statusMessage,
          durationMs: l.durationMs,
          requestHeaders: l.requestHeadersJson,
          requestBody: l.requestBodyJson,
          responseBody: l.responseBodyJson,
          profilerSteps: l.profilerStepsJson,
          errorStack: l.errorStack,
          logCategory: l.logCategory as RequestLog['logCategory'],
          createdAt: l.createdAt.toISOString(),
        }));
      } else {
        logsForLeaderboards = this.requestLogs.filter((l) => {
          const t = new Date(l.createdAt).getTime();
          return t >= safeStart && t <= safeEnd;
        });
      }
    }

    const authAgg = new Map<
      string,
      { label: string; subtitle: string; requests: number; errors: number; keyName: string; apiKey: string }
    >();
    for (const l of logsForLeaderboards) {
      const rawLabel = l.authIdentifierLabel || 'Anonymous';
      const existing = authAgg.get(rawLabel);
      if (existing) {
        existing.requests += 1;
        if (l.statusCode >= 400) existing.errors += 1;
      } else {
        const matchedIdent = this.authIdentifiers.find(
          (ai) =>
            rawLabel.includes(ai.name) || (ai.apiKey && rawLabel.includes(ai.apiKey))
        );
        const matchedCfg = this.authConfigs.find((ac) => ac.id === l.authConfigId);
        const keyName = matchedIdent?.name || rawLabel.split(' (')[0].trim();
        const apiKey = matchedIdent?.apiKey || '';
        authAgg.set(rawLabel, {
          keyName,
          apiKey,
          label: `Key : ${rawLabel}`,
          subtitle: matchedCfg ? `${matchedCfg.providerType} / ${matchedCfg.name}` : l.authSourceLabel,
          requests: 1,
          errors: l.statusCode >= 400 ? 1 : 0,
        });
      }
    }
    const topAuthIdentifiers = Array.from(authAgg.values())
      .sort((a, b) => b.requests - a.requests || b.errors - a.errors)
      .slice(0, 10);

    // Top 10 Endpoints aggregated strictly from database logs in window
    const epAgg = new Map<
      string,
      {
        endpointId: number;
        path: string;
        subtitle: string;
        requests: number;
        errors: number;
        timestamps: number[];
      }
    >();
    for (const l of logsForLeaderboards) {
      const key = `${l.endpointId}:${l.path}`;
      const existing = epAgg.get(key);
      const ts = new Date(l.createdAt).getTime();
      if (existing) {
        existing.requests += 1;
        if (l.statusCode >= 400) existing.errors += 1;
        existing.timestamps.push(ts);
      } else {
        epAgg.set(key, {
          endpointId: l.endpointId,
          path: l.path,
          subtitle: `${l.collectionName} / ${l.endpointName}`,
          requests: 1,
          errors: l.statusCode >= 400 ? 1 : 0,
          timestamps: [ts],
        });
      }
    }
    const topEndpoints = Array.from(epAgg.values())
      .sort((a, b) => b.requests - a.requests || b.errors - a.errors)
      .slice(0, 10)
      .map((ep) => {
        const sparkSlots = 12;
        const slotStep = Math.max(1, Math.floor(totalWindowMs / sparkSlots));
        const sparkline = Array.from({ length: sparkSlots }, (_, idx) => {
          const s0 = safeStart + idx * slotStep;
          const s1 = idx === sparkSlots - 1 ? safeEnd : s0 + slotStep - 1;
          return ep.timestamps.filter((t) => t >= s0 && t <= s1).length;
        });
        return {
          endpointId: ep.endpointId,
          path: ep.path,
          subtitle: ep.subtitle,
          requests: ep.requests,
          errors: ep.errors,
          sparkline,
        };
      });

    return {
      kpis: {
        workspaces: this.workspaces.length,
        teams: this.teams.length,
        developers: this.developers.length,
        collections: this.collections.length,
        endpoints: this.endpoints.length,
        versions: this.endpointVersions.length,
        datasources: this.datasources.length,
        authConfigs: this.authConfigs.length,
        authIds: this.authIdentifiers.length,
      },
      startDate,
      endDate,
      filterContext: authKey
        ? { type: 'authKey', label: `Auth Key: ${authKey}`, value: authKey }
        : endpointPath
        ? { type: 'endpoint', label: `Endpoint: ${endpointPath}`, value: endpointPath }
        : null,
      totalRequests,
      avgReqPerHour: Number((totalRequests / Math.max(daySpan * 24, 1)).toFixed(1)),
      peakReqCount: peakReqBar?.requests || 0,
      peakReqAt: peakReqBar && peakReqBar.requests > 0 ? peakReqBar.rangeStart : startDate,
      totalErrors,
      avgErrPerHour: Number((totalErrors / Math.max(daySpan * 24, 1)).toFixed(1)),
      peakErrCount: peakErrBar?.errors || 0,
      peakErrAt: peakErrBar && peakErrBar.errors > 0 ? peakErrBar.rangeStart : startDate,
      avgDurationMs,
      series,
      topAuthIdentifiers,
      topEndpoints,
    };
  }
}

export const repository = new Repository();
