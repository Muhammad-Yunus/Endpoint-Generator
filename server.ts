import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { createServer as createViteServer } from 'vite';
import { initDatabase, isDbConnected } from './src/db/index.ts';
import {
  repository,
  signSessionToken,
  verifySessionToken,
} from './src/db/repository.ts';
import type { AuthSessionUser } from './src/types/domain.ts';

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthSessionUser | null;
    }
  }
}

function extractBearer(req: Request): AuthSessionUser | null {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  if (!token) return null;
  return verifySessionToken(token);
}

function attachUser(req: Request, _res: Response, next: NextFunction) {
  req.authUser = extractBearer(req);
  next();
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.authUser) {
    res.status(401).json({
      error: 'Authentication required. Please sign in or claim your Admin account.',
      code: 'AUTH_REQUIRED',
    });
    return;
  }
  next();
}

async function startServer() {
  const dbStatus = await initDatabase();
  if (dbStatus.connected) {
    console.log('[Endpoint Generator] Connected to PostgreSQL via Drizzle ORM');
  } else {
    console.log('[Endpoint Generator] Store mode:', dbStatus.error);
  }
  await repository.hydrateOrSeed();

  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use(attachUser);

  // Health
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, dbConnected: isDbConnected() });
  });

  // Auth Routes
  app.get('/api/auth/me', (req, res) => {
    res.json({
      user: req.authUser || null,
      needsAdminClaim: repository.needsAdminClaim(),
    });
  });

  app.post('/api/auth/claim', async (req, res) => {
    try {
      const { name, email, password } = req.body || {};
      if (!name || !email || !password || String(password).length < 6) {
        res.status(400).json({ error: 'Name, valid email, and password (min 6 chars) are required' });
        return;
      }
      if (!repository.needsAdminClaim() && !req.authUser) {
        res.status(403).json({ error: 'Admin account is already claimed. Please sign in.' });
        return;
      }
      const user = await repository.claimOrRegisterAdmin(
        String(name).trim(),
        String(email).trim(),
        String(password)
      );
      const token = signSessionToken(user);
      res.json({ user, token });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Claim failed' });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body || {};
      if (!password) {
        res.status(400).json({ error: 'Email and password are required' });
        return;
      }
      const user = await repository.login(String(email || ''), String(password));
      if (!user) {
        res.status(401).json({ error: 'Invalid credentials' });
        return;
      }
      const token = signSessionToken(user);
      res.json({ user, token });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Login error' });
    }
  });

  // Read Routes
  app.get('/api/bootstrap', async (req, res) => {
    try {
      res.json(await repository.getBootstrap(req.authUser || null));
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load bootstrap data' });
    }
  });

  app.get('/api/analytics', async (req, res) => {
    try {
      const rangeParam = req.query.range;
      const range = rangeParam === '1w' || rangeParam === 'custom' ? rangeParam : 'today';
      const analytics = await repository.getDashboardAnalytics({
        range,
        startDate: typeof req.query.startDate === 'string' ? req.query.startDate : undefined,
        endDate: typeof req.query.endDate === 'string' ? req.query.endDate : undefined,
        authKey: typeof req.query.authKey === 'string' ? req.query.authKey : undefined,
        endpointPath: typeof req.query.endpointPath === 'string' ? req.query.endpointPath : undefined,
      });
      res.json(analytics);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load analytics' });
    }
  });

  app.get('/api/logs', async (req, res) => {
    try {
      const logs = await repository.getRequestLogs({
        category: typeof req.query.category === 'string' ? req.query.category : undefined,
        errorOnly: req.query.errorOnly === 'true',
        authConfigId: req.query.authConfigId ? Number(req.query.authConfigId) : undefined,
        authKeySearch: typeof req.query.authKeySearch === 'string' ? req.query.authKeySearch : undefined,
        versionId: req.query.versionId ? Number(req.query.versionId) : undefined,
        pathSearch: typeof req.query.pathSearch === 'string' ? req.query.pathSearch : undefined,
        minDuration: req.query.minDuration ? Number(req.query.minDuration) : undefined,
        maxDuration: req.query.maxDuration ? Number(req.query.maxDuration) : undefined,
        startInstant: typeof req.query.startInstant === 'string' ? req.query.startInstant : undefined,
        endInstant: typeof req.query.endInstant === 'string' ? req.query.endInstant : undefined,
      });
      res.json({ logs });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load request logs' });
    }
  });

  // Protected CRUD Routes
  app.post('/api/workspaces', requireAuth, async (req, res) => {
    const { name, code, description } = req.body || {};
    if (!name || !code) {
      res.status(400).json({ error: 'Workspace name and code are required' });
      return;
    }
    const created = await repository.createWorkspace({
      name: String(name),
      code: String(code),
      description: String(description || ''),
    });
    res.status(201).json(created);
  });

  app.post('/api/teams', requireAuth, async (req, res) => {
    const { workspaceId, name, description, leadEmail } = req.body || {};
    if (!workspaceId || !name) {
      res.status(400).json({ error: 'workspaceId and name are required' });
      return;
    }
    const created = await repository.createTeam({
      workspaceId: Number(workspaceId),
      name: String(name),
      description: String(description || ''),
      leadEmail: String(leadEmail || ''),
    });
    res.status(201).json(created);
  });

  app.post('/api/developers', requireAuth, async (req, res) => {
    const { workspaceId, teamId, name, email, role } = req.body || {};
    if (!workspaceId || !teamId || !name || !email) {
      res.status(400).json({ error: 'workspaceId, teamId, name, and email are required' });
      return;
    }
    const created = await repository.createDeveloper({
      workspaceId: Number(workspaceId),
      teamId: Number(teamId),
      name: String(name),
      email: String(email),
      role: role || 'Developer',
    });
    res.status(201).json(created);
  });

  app.post('/api/datasources', requireAuth, async (req, res) => {
    const body = req.body || {};
    if (!body.workspaceId || !body.name || !body.host || !body.databaseName) {
      res.status(400).json({ error: 'workspaceId, name, host, and databaseName are required' });
      return;
    }
    const created = await repository.createDatasource({
      workspaceId: Number(body.workspaceId),
      teamId: body.teamId ? Number(body.teamId) : null,
      name: String(body.name),
      engine: body.engine || 'postgresql',
      host: String(body.host),
      port: Number(body.port || 5432),
      databaseName: String(body.databaseName),
      username: String(body.username || 'postgres'),
      sslMode: String(body.sslMode || 'require'),
      active: body.active !== false,
      createdBy: req.authUser?.name || 'Alex Morgan',
    });
    res.status(201).json(created);
  });

  app.patch('/api/datasources/:id', requireAuth, async (req, res) => {
    const updated = await repository.updateDatasource(Number(req.params.id), req.body || {});
    if (!updated) {
      res.status(404).json({ error: 'Datasource not found' });
      return;
    }
    res.json(updated);
  });

  app.delete('/api/datasources/:id', requireAuth, async (req, res) => {
    const ok = await repository.deleteDatasource(Number(req.params.id));
    res.json({ deleted: ok });
  });

  app.post('/api/datasources/:id/test', requireAuth, async (req, res) => {
    try {
      const result = await repository.testDatasourceConnection(Number(req.params.id));
      res.json(result);
    } catch (err) {
      res.status(500).json({
        ok: false,
        latencyMs: 0,
        message: err instanceof Error ? err.message : 'Connection test failed',
      });
    }
  });

  app.post('/api/auth-configs', requireAuth, async (req, res) => {
    const b = req.body || {};
    if (!b.workspaceId || !b.name) {
      res.status(400).json({ error: 'workspaceId and name are required' });
      return;
    }
    const created = await repository.createAuthConfig({
      workspaceId: Number(b.workspaceId),
      name: String(b.name),
      providerType: b.providerType || 'Common Auth',
      headerKeyName: String(b.headerKeyName || 'X-CommonAuth-Key'),
      headerSecretName: String(b.headerSecretName || 'X-CommonAuth-Secret'),
      defaultExpiredMinutes: Number(b.defaultExpiredMinutes || 0),
      description: String(b.description || ''),
      active: true,
    });
    res.status(201).json(created);
  });

  app.post('/api/auth-identifiers', requireAuth, async (req, res) => {
    const b = req.body || {};
    if (!b.authConfigId || !b.name || !b.apiKey || !b.secretRaw) {
      res.status(400).json({ error: 'authConfigId, name, apiKey, and secretRaw are required' });
      return;
    }
    const created = await repository.createAuthIdentifier({
      authConfigId: Number(b.authConfigId),
      name: String(b.name),
      apiKey: String(b.apiKey),
      secretRaw: String(b.secretRaw),
      usePlainSecret: Boolean(b.usePlainSecret),
      customExpiredMinutes: b.customExpiredMinutes ? Number(b.customExpiredMinutes) : null,
      scopes: Array.isArray(b.scopes) ? b.scopes : ['Read All'],
    });
    res.status(201).json(created);
  });

  app.patch('/api/auth-identifiers/:id', requireAuth, async (req, res) => {
    const updated = await repository.updateAuthIdentifier(Number(req.params.id), req.body || {});
    if (!updated) {
      res.status(404).json({ error: 'Auth identifier not found' });
      return;
    }
    res.json(updated);
  });

  app.delete('/api/auth-identifiers/:id', requireAuth, async (req, res) => {
    const ok = await repository.deleteAuthIdentifier(Number(req.params.id));
    res.json({ deleted: ok });
  });

  app.post('/api/collections', requireAuth, async (req, res) => {
    const b = req.body || {};
    if (!b.workspaceId || !b.name) {
      res.status(400).json({ error: 'workspaceId and name are required' });
      return;
    }
    const created = await repository.createCollection({
      workspaceId: Number(b.workspaceId),
      name: String(b.name),
      description: String(b.description || ''),
      authConfigId: b.authConfigId ? Number(b.authConfigId) : null,
      createdBy: req.authUser?.name || 'Alex Morgan',
    });
    res.status(201).json(created);
  });

  app.patch('/api/collections/:id', requireAuth, async (req, res) => {
    const updated = await repository.updateCollection(Number(req.params.id), req.body || {});
    if (!updated) {
      res.status(404).json({ error: 'Collection not found' });
      return;
    }
    res.json(updated);
  });

  app.delete('/api/collections/:id', requireAuth, async (req, res) => {
    const ok = await repository.deleteCollection(Number(req.params.id));
    res.json({ deleted: ok });
  });

  app.post('/api/endpoints', requireAuth, async (req, res) => {
    const b = req.body || {};
    if (!b.collectionId || !b.name || !b.datasourceId || !b.version) {
      res.status(400).json({ error: 'collectionId, name, datasourceId, and version payload are required' });
      return;
    }
    const result = await repository.createEndpointWithVersion({
      collectionId: Number(b.collectionId),
      name: String(b.name),
      datasourceId: Number(b.datasourceId),
      createdBy: req.authUser?.name || 'Alex Morgan',
      version: {
        ...b.version,
        createdBy: req.authUser?.name || 'Alex Morgan',
      },
    });
    res.status(201).json(result);
  });

  app.patch('/api/endpoints/:id', requireAuth, async (req, res) => {
    const updated = await repository.updateEndpoint(Number(req.params.id), req.body || {});
    if (!updated) {
      res.status(404).json({ error: 'Endpoint not found' });
      return;
    }
    res.json(updated);
  });

  app.post('/api/endpoints/:id/versions', requireAuth, async (req, res) => {
    const created = await repository.createEndpointVersion(Number(req.params.id), {
      ...req.body,
      createdBy: req.authUser?.name || 'Alex Morgan',
    });
    res.status(201).json(created);
  });

  app.patch('/api/versions/:id', requireAuth, async (req, res) => {
    const updated = await repository.updateEndpointVersion(Number(req.params.id), req.body || {});
    if (!updated) {
      res.status(404).json({ error: 'Endpoint version not found' });
      return;
    }
    res.json(updated);
  });

  app.delete('/api/versions/:id', requireAuth, async (req, res) => {
    const ok = await repository.deleteEndpointVersion(Number(req.params.id));
    res.json({ deleted: ok });
  });

  app.post('/api/versions/:id/purge-cache', requireAuth, (req, res) => {
    const cleared = repository.purgeCacheForVersion(Number(req.params.id));
    res.json({ cleared });
  });

  app.post('/api/versions/:id/reset-circuit', requireAuth, (req, res) => {
    repository.resetCircuitForVersion(Number(req.params.id));
    res.json({ reset: true });
  });

  app.post('/api/deployments', requireAuth, async (req, res) => {
    const { versionIds, environment, notes } = req.body || {};
    if (!Array.isArray(versionIds) || versionIds.length === 0 || (environment !== 'SIT' && environment !== 'PROD')) {
      res.status(400).json({ error: 'versionIds and valid environment (SIT | PROD) are required' });
      return;
    }
    const created = await repository.deployVersions({
      versionIds: versionIds.map(Number),
      environment,
      deployedBy: req.authUser?.name || 'Alex Morgan',
      notes: String(notes || ''),
    });
    res.status(201).json({ deployments: created });
  });

  app.post('/api/alerts', requireAuth, async (req, res) => {
    const b = req.body || {};
    const created = await repository.createAlert({
      workspaceId: Number(b.workspaceId || 1),
      name: String(b.name || 'API Alert'),
      channel: b.channel || 'Email',
      thresholdErrorRate: Number(b.thresholdErrorRate || 5),
      thresholdLatencyMs: Number(b.thresholdLatencyMs || 500),
      target: String(b.target || ''),
      active: true,
    });
    res.status(201).json(created);
  });

  app.patch('/api/environments/:id', requireAuth, async (req, res) => {
    const updated = await repository.updateEnvironment(Number(req.params.id), req.body || {});
    if (!updated) {
      res.status(404).json({ error: 'Environment not found' });
      return;
    }
    res.json(updated);
  });

  // Live Runtime API Execution Engine (accessible from Test Console)
  app.post('/api/runtime/execute', async (req, res) => {
    try {
      const b = req.body || {};
      if (!b.versionId) {
        res.status(400).json({ error: 'versionId is required' });
        return;
      }
      const log = await repository.executeRuntimeRequest({
        versionId: Number(b.versionId),
        headers: b.headers && typeof b.headers === 'object' ? b.headers : {},
        body: b.body && typeof b.body === 'object' ? b.body : null,
        queryParams: b.queryParams && typeof b.queryParams === 'object' ? b.queryParams : {},
        pathParamValues: b.pathParamValues && typeof b.pathParamValues === 'object' ? b.pathParamValues : {},
        clientIp: req.ip || '10.24.18.105',
        simulateUpstreamError: Boolean(b.simulateUpstreamError),
      });
      res.json({ log });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Execution error' });
    }
  });

  // Vite / Static Middleware
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  const PORT = 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Endpoint Generator] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
