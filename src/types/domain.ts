export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type DbEngine = 'postgresql' | 'mysql' | 'mssql';
export type DbObjectType = 'table' | 'view' | 'function' | 'stored_procedure';
export type CrudOperation = 'select' | 'select_by_id' | 'insert' | 'update' | 'delete' | 'execute_rpc';
export type VersionStatus = 'Draft' | 'Published' | 'Deprecated';
export type AuthProviderType =
  | 'Common Auth'
  | 'JV CAS'
  | 'Bearer JWT'
  | 'OAuth2 / OIDC'
  | 'Basic Auth'
  | 'Custom Header';

export interface Workspace {
  id: number;
  name: string;
  code: string;
  description: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Team {
  id: number;
  workspaceId: number;
  name: string;
  description: string;
  leadEmail: string;
  createdAt: string;
}

export interface Developer {
  id: number;
  workspaceId: number;
  teamId: number;
  name: string;
  email: string;
  role: 'Admin' | 'Architect' | 'Developer' | 'Viewer';
  active: boolean;
  createdAt: string;
}

export interface DbColumnDef {
  name: string;
  dataType: string;
  nullable: boolean;
  isPrimaryKey?: boolean;
  direction?: 'COLUMN' | 'IN' | 'OUT';
  defaultValue?: string | null;
}

export interface DatasourceObject {
  id: number;
  datasourceId: number;
  schemaName: string;
  objectName: string;
  objectType: DbObjectType;
  columns: DbColumnDef[];
}

export interface Datasource {
  id: number;
  workspaceId: number;
  teamId: number | null;
  name: string;
  engine: DbEngine;
  host: string;
  port: number;
  databaseName: string;
  username: string;
  sslMode: string;
  active: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthConfig {
  id: number;
  workspaceId: number;
  name: string;
  providerType: AuthProviderType;
  headerKeyName: string;
  headerSecretName: string;
  defaultExpiredMinutes: number;
  description: string;
  active: boolean;
  createdAt: string;
}

export interface AuthIdentifier {
  id: number;
  authConfigId: number;
  name: string;
  apiKey: string;
  secretMasked: string;
  usePlainSecret: boolean;
  customExpiredMinutes: number | null;
  expiredAt: string | null;
  scopes: string[];
  active: boolean;
  locked: boolean;
  createdAt: string;
}

export interface Collection {
  id: number;
  workspaceId: number;
  name: string;
  description: string;
  authConfigId: number | null;
  active: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface PathParamDef {
  segmentIndex: number;
  segmentName: string;
  isParam: boolean;
  paramName: string;
  dataType: string;
  mappedColumn: string;
  description: string;
}

export interface HeaderDef {
  name: string;
  dataType: string;
  length: string;
  mandatory: boolean;
  description: string;
  inheritedFromAuth?: boolean;
  defaultValue?: string;
}

export interface BodyFieldDef {
  name: string;
  dataType: string;
  mandatory: boolean;
  mappedColumn: string;
  sampleValue: string | number | boolean | null;
  description: string;
}

export interface SqlMappingConfig {
  selectedColumns: string[];
  whereColumns: string[];
  orderBy: string;
  orderDir: 'ASC' | 'DESC';
  customSqlPreview: string;
}

export interface PaginationConfig {
  enabled: boolean;
  mode: 'offset' | 'cursor';
  defaultLimit: number;
  maxLimit: number;
  limitParam: string;
  offsetParam: string;
}

export interface Endpoint {
  id: number;
  collectionId: number;
  name: string;
  datasourceId: number;
  active: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface EndpointVersion {
  id: number;
  endpointId: number;
  versionNumber: number;
  versionLabel: string;
  method: HttpMethod;
  pathSegments: string[];
  pathParams: PathParamDef[];
  headers: HeaderDef[];
  bodyFields: BodyFieldDef[];
  dbSchema: string;
  dbObjectName: string;
  dbObjectType: DbObjectType;
  crudOperation: CrudOperation;
  sqlMapping: SqlMappingConfig;
  paginationConfig: PaginationConfig;
  status: VersionStatus;
  active: boolean;
  scopes: string[];
  description: string;
  globalProfiling: boolean;
  endpointProfiling: boolean;
  rateLimiterEnabled: boolean;
  rateLimiterBy: 'By IP' | 'By Auth Identifier';
  rateLimiterMaxReq: number;
  rateLimiterWindow: '1m' | '5m' | '1h';
  rateLimiterMaxConcurrency: number;
  circuitBreakerEnabled: boolean;
  circuitBreakerFailureThreshold: number;
  circuitBreakerTimeoutSec: number;
  circuitBreakerFallbackJson: Record<string, unknown>;
  cacheEnabled: boolean;
  cacheTtlSec: number;
  cacheKeyStrategy: 'path+query' | 'path+body' | 'path+auth';
  useDefaultResponseFormat: boolean;
  sitVersionTag: string | null;
  sitDeployedAt: string | null;
  sitDeployedBy: string | null;
  prodVersionTag: string | null;
  prodDeployedAt: string | null;
  prodDeployedBy: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface DeploymentRecord {
  id: number;
  endpointId: number;
  endpointVersionId: number;
  endpointName: string;
  collectionName: string;
  environment: 'SIT' | 'PROD';
  versionTag: string;
  deployedBy: string;
  deployedAt: string;
  notes: string;
}

export interface ProfilerStep {
  stage: string;
  durationMs: number;
  instantOffsetMs: number;
  action: string;
  espace: string;
  iconType: 'start' | 'validate' | 'auth' | 'ratelimit' | 'circuit' | 'cache' | 'build' | 'execute' | 'pagination' | 'error';
}

export interface RequestLog {
  id: number;
  requestKey: string;
  collectionId: number;
  collectionName: string;
  endpointId: number;
  endpointName: string;
  endpointVersionId: number;
  versionLabel: string;
  datasourceId: number;
  datasourceName: string;
  datasourceEngine: DbEngine;
  authConfigId: number | null;
  authSourceLabel: string;
  authIdentifierLabel: string;
  method: HttpMethod;
  path: string;
  statusCode: number;
  statusMessage: string;
  durationMs: number;
  requestHeaders: Record<string, string>;
  requestBody: unknown;
  responseBody: unknown;
  profilerSteps: ProfilerStep[];
  errorStack: string | null;
  logCategory: 'request' | 'rate_limiter' | 'circuit_breaker';
  createdAt: string;
}

export interface AlertConfig {
  id: number;
  workspaceId: number;
  name: string;
  channel: 'Email' | 'Slack' | 'Webhook';
  thresholdErrorRate: number;
  thresholdLatencyMs: number;
  target: string;
  active: boolean;
}

export interface EnvironmentConfig {
  id: number;
  name: 'SIT' | 'PROD';
  baseUrl: string;
  gatewayHost: string;
  tlsEnabled: boolean;
  autoPromote: boolean;
  updatedAt: string;
}

export interface AuthSessionUser {
  id: number;
  name: string;
  email: string;
  role: string;
}

export interface DashboardAnalytics {
  kpis: {
    workspaces: number;
    teams: number;
    developers: number;
    collections: number;
    endpoints: number;
    versions: number;
    datasources: number;
    authConfigs: number;
    authIds: number;
  };
  startDate: string;
  endDate: string;
  filterContext?: {
    type: 'authKey' | 'endpoint';
    label: string;
    value: string;
  } | null;
  totalRequests: number;
  avgReqPerHour: number;
  peakReqCount: number;
  peakReqAt: string;
  totalErrors: number;
  avgErrPerHour: number;
  peakErrCount: number;
  peakErrAt: string;
  avgDurationMs: number;
  series: Array<{
    label: string;
    rangeStart: string;
    rangeEnd: string;
    requests: number;
    errors: number;
    avgLatencyMs: number;
  }>;
  topAuthIdentifiers: Array<{
    keyName: string;
    apiKey: string;
    label: string;
    subtitle: string;
    requests: number;
    errors: number;
  }>;
  topEndpoints: Array<{
    endpointId: number;
    path: string;
    subtitle: string;
    requests: number;
    errors: number;
    sparkline: number[];
  }>;
}

export interface BootstrapPayload {
  workspaces: Workspace[];
  teams: Team[];
  developers: Developer[];
  datasources: Datasource[];
  datasourceObjects: DatasourceObject[];
  authConfigs: AuthConfig[];
  authIdentifiers: AuthIdentifier[];
  collections: Collection[];
  endpoints: Endpoint[];
  endpointVersions: EndpointVersion[];
  deployments: DeploymentRecord[];
  alertConfigs: AlertConfig[];
  environments: EnvironmentConfig[];
  dbConnected: boolean;
  authRequired: boolean;
  needsAdminClaim: boolean;
  user: AuthSessionUser | null;
}
