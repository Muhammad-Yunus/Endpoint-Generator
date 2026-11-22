import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Search,
  ChevronDown,
  ChevronRight,
  Briefcase,
  Pencil,
  Maximize2,
  Minimize2,
  Home,
  LayoutGrid,
  Moon,
  Sun,
  UserCheck,
  LogOut,
  LogIn,
  Menu,
  X,
} from 'lucide-react';
import { apiFetch, registerAuthRequiredHandler, setAuthToken } from './lib/api';
import { Dashboard, type DashboardFilterChange } from './components/Dashboard';
import { EndpointStudio } from './components/EndpointStudio';
import { EndpointWizard } from './components/EndpointWizard';
import { ApiDocumentation } from './components/ApiDocumentation';
import { RequestMonitor, type RequestLogNavFilters } from './components/RequestMonitor';
import { LogProfilerDrawer } from './components/LogProfilerDrawer';
import { DeploymentManager } from './components/DeploymentManager';
import { ConfigurationManager } from './components/ConfigurationManager';
import { WorkspaceManagement } from './components/WorkspaceManagement';
import { AuthModal, HelpModal } from './components/AuthModal';
import type {
  AuthSessionUser,
  BootstrapPayload,
  DashboardAnalytics,
  RequestLog,
} from './types/domain';

type PageId =
  | 'dashboard'
  | 'workspaces'
  | 'teams'
  | 'developers'
  | 'auth_configuration'
  | 'data_configuration'
  | 'alert_configuration'
  | 'collections'
  | 'documentation'
  | 'request_log'
  | 'report'
  | 'endpoint_deployment'
  | 'deployment_history'
  | 'environment';

interface NavGroup {
  id: string;
  label: string;
  items: Array<{ id: PageId; label: string }>;
}

const NAV_GROUPS: NavGroup[] = [
  {
    id: 'workspace_management',
    label: 'Workspace Management',
    items: [
      { id: 'workspaces', label: 'Workspaces' },
      { id: 'teams', label: 'Teams' },
      { id: 'developers', label: 'Developers' },
    ],
  },
  {
    id: 'configuration',
    label: 'Configuration',
    items: [
      { id: 'auth_configuration', label: 'Auth Configuration' },
      { id: 'data_configuration', label: 'Data Configuration' },
      { id: 'alert_configuration', label: 'Alert Configuration' },
    ],
  },
  {
    id: 'my_workspace',
    label: 'My Workspace',
    items: [
      { id: 'collections', label: 'Collections' },
      { id: 'documentation', label: 'Documentation' },
    ],
  },
  {
    id: 'monitor',
    label: 'Monitor',
    items: [
      { id: 'request_log', label: 'Request Log' },
      { id: 'report', label: 'Report' },
    ],
  },
  {
    id: 'deployment',
    label: 'Deployment',
    items: [
      { id: 'endpoint_deployment', label: 'Endpoint Deployment' },
      { id: 'deployment_history', label: 'Deployment History' },
      { id: 'environment', label: 'Environment' },
    ],
  },
];

export default function App() {
  const [dark, setDark] = useState(false);
  const [page, setPage] = useState<PageId>('dashboard');
  const [menuSearch, setMenuSearch] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    my_workspace: true,
    configuration: false,
    monitor: false,
    deployment: false,
    workspace_management: false,
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [data, setData] = useState<BootstrapPayload | null>(null);
  const [analytics, setAnalytics] = useState<DashboardAnalytics | null>(null);
  const [analyticsFilter, setAnalyticsFilter] = useState<DashboardFilterChange>({
    range: 'today',
    startDate: todayIso,
    endDate: todayIso,
    drilldown: null,
  });
  const [logNavFilters, setLogNavFilters] = useState<RequestLogNavFilters | null>(null);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<number>(1);
  const [selectedEndpointId, setSelectedEndpointId] = useState<number | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardColId, setWizardColId] = useState<number>(2);
  const [inspectedLog, setInspectedLog] = useState<RequestLog | null>(null);

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [helpModalOpen, setHelpModalOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<AuthSessionUser | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  useEffect(() => {
    registerAuthRequiredHandler(() => setAuthModalOpen(true));
  }, []);

  const loadBootstrap = useCallback(async () => {
    const res = await apiFetch<BootstrapPayload>('/api/bootstrap');
    setData(res);
    if (res.user) {
      setCurrentUser(res.user);
    }
    if (!res.workspaces.some((w) => w.id === activeWorkspaceId) && res.workspaces[0]) {
      setActiveWorkspaceId(res.workspaces[0].id);
    }
  }, [activeWorkspaceId]);

  const loadAnalytics = useCallback(async (filter: DashboardFilterChange) => {
    const qs = new URLSearchParams({ range: filter.range });
    if (filter.startDate) qs.set('startDate', filter.startDate);
    if (filter.endDate) qs.set('endDate', filter.endDate);
    if (filter.drilldown?.type === 'authKey') {
      qs.set('authKey', filter.drilldown.value);
    } else if (filter.drilldown?.type === 'endpoint') {
      qs.set('endpointPath', filter.drilldown.value);
    }
    const res = await apiFetch<DashboardAnalytics>(`/api/analytics?${qs.toString()}`);
    setAnalytics(res);
  }, []);

  useEffect(() => {
    loadBootstrap();
  }, [loadBootstrap]);

  useEffect(() => {
    loadAnalytics(analyticsFilter);
  }, [analyticsFilter, loadAnalytics]);

  const handleRefreshAll = async () => {
    await Promise.all([loadBootstrap(), loadAnalytics(analyticsFilter)]);
  };

  const navigateTo = (target: PageId, opts?: { preserveLogFilters?: boolean }) => {
    if (target === 'request_log' && !opts?.preserveLogFilters) {
      setLogNavFilters(null);
    }
    setPage(target);
    setMobileMenuOpen(false);
    const parent = NAV_GROUPS.find((g) => g.items.some((i) => i.id === target));
    if (parent) {
      setExpandedGroups((prev) => ({ ...prev, [parent.id]: true }));
    }
  };

  const activeGroup = NAV_GROUPS.find((g) => g.items.some((i) => i.id === page));
  const activeItem = activeGroup?.items.find((i) => i.id === page);

  const filteredGroups = useMemo(() => {
    const q = menuSearch.trim().toLowerCase();
    if (!q) return NAV_GROUPS;
    return NAV_GROUPS.map((g) => ({
      ...g,
      items: g.items.filter(
        (i) => i.label.toLowerCase().includes(q) || g.label.toLowerCase().includes(q)
      ),
    })).filter((g) => g.items.length > 0);
  }, [menuSearch]);

  const activeWorkspace =
    data?.workspaces.find((w) => w.id === activeWorkspaceId) || data?.workspaces[0] || null;

  return (
    <div className="min-h-screen flex flex-col bg-[#F5F7FA] dark:bg-slate-950 text-slate-800 dark:text-slate-100">
      {/* Top Header Bar */}
      <header className="h-14 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 flex items-center justify-between gap-4 shrink-0 z-30">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMobileMenuOpen((v) => !v)}
            className="lg:hidden p-1.5 rounded text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Toggle Menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          <button
            type="button"
            onClick={() => navigateTo('dashboard')}
            className="flex items-center gap-2.5 text-left whitespace-nowrap shrink-0"
          >
            <svg viewBox="0 0 36 36" className="w-8 h-8 shrink-0" aria-hidden="true">
              <defs>
                <linearGradient id="egBrandGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#8EB8D8" />
                  <stop offset="50%" stopColor="#6D82BC" />
                  <stop offset="100%" stopColor="#7BB39F" />
                </linearGradient>
              </defs>
              <circle cx="18" cy="18" r="15" fill="none" stroke="url(#egBrandGrad)" strokeWidth="4.5" strokeDasharray="70 25" strokeLinecap="round" />
              <path d="M12 18h10m0 0-3.5-3.5M22 18l-3.5 3.5" fill="none" stroke="#5C6FA8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="text-base font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Endpoint Generator
            </span>
          </button>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setHelpModalOpen(true)}
            className="px-3.5 py-1 rounded-full border border-[#C6D0EB] dark:border-indigo-700/60 bg-[#EEF1F9]/60 dark:bg-indigo-950/30 text-[#4A5B8C] dark:text-[#A5B7EB] text-xs font-semibold hover:bg-[#E4E9F6] dark:hover:bg-indigo-950/60 whitespace-nowrap transition-colors"
          >
            Help ?
          </button>

          {currentUser ? (
            <div className="flex items-center gap-2">
              <div className="hidden sm:flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">
                <UserCheck className="w-4 h-4 text-[#5C6FA8] dark:text-[#9BAEE5]" />
                <span>{currentUser.name}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setAuthToken(null);
                  setCurrentUser(null);
                }}
                title="Sign Out"
                className="p-1.5 rounded text-[#5C6FA8] dark:text-[#9BAEE5] hover:bg-[#EEF1F9] dark:hover:bg-indigo-950/40"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAuthModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-[#5C6FA8] hover:text-[#4A5B8C] dark:hover:text-[#A5B7EB] whitespace-nowrap transition-colors"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>{data?.needsAdminClaim ? 'Claim Admin' : 'Sign In'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setDark((d) => !d)}
            className="px-3 py-1 rounded-full border border-[#C6D0EB] dark:border-indigo-700/60 bg-[#EEF1F9]/60 dark:bg-indigo-950/30 text-[#4A5B8C] dark:text-[#A5B7EB] text-xs font-semibold hover:bg-[#E4E9F6] dark:hover:bg-indigo-950/60 flex items-center gap-1.5 whitespace-nowrap transition-colors"
          >
            <span>{dark ? 'Light' : 'Dark'}</span>
            {dark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          </button>
        </div>
      </header>

      {/* Body Layout: Sidebar + Main Viewport */}
      <div className="flex-1 flex min-h-0 relative">
        {/* Left Sidebar */}
        {!fullscreen && (
          <aside
            className={`${
              mobileMenuOpen ? 'fixed inset-y-14 left-0 z-40 block' : 'hidden lg:block'
            } w-[225px] shrink-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 overflow-y-auto p-3 space-y-3`}
          >
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={menuSearch}
                onChange={(e) => setMenuSearch(e.target.value)}
                placeholder="Search All Menus"
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-[#5C6FA8]"
              />
            </div>

            <button
              type="button"
              onClick={() => navigateTo('dashboard')}
              className={`w-full px-3 py-2 rounded-md text-xs font-semibold flex items-center gap-2 transition-colors ${
                page === 'dashboard'
                  ? 'bg-[#5C6FA8] text-white shadow-2xs'
                  : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Dashboard</span>
            </button>

            <nav className="space-y-1">
              {filteredGroups.map((group) => {
                const isGroupActive = group.items.some((i) => i.id === page);
                const isOpen = !!expandedGroups[group.id] || menuSearch.trim().length > 0;
                return (
                  <div key={group.id} className="space-y-0.5">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedGroups((prev) => ({ ...prev, [group.id]: !isOpen }))
                      }
                      className={`w-full px-3 py-2 rounded-md text-xs font-semibold flex items-center justify-between transition-colors ${
                        isGroupActive
                          ? 'bg-[#5C6FA8] text-white shadow-2xs'
                          : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      <span className="truncate">{group.label}</span>
                      {isOpen ? (
                        <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                      )}
                    </button>

                    {isOpen && (
                      <div className="space-y-0.5 pt-0.5">
                        {group.items.map((item) => {
                          const active = page === item.id;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => navigateTo(item.id)}
                              className={`w-full pl-5 pr-3 py-2 rounded text-left text-xs flex items-center gap-2 transition-colors ${
                                active
                                  ? 'bg-[#EEF1F9] dark:bg-indigo-950/50 text-[#4A5B8C] dark:text-[#A5B7EB] font-semibold'
                                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full border ${
                                  active ? 'border-[#5C6FA8] bg-[#5C6FA8]' : 'border-slate-400'
                                }`}
                              />
                              <span className="truncate">{item.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </nav>
          </aside>
        )}

        {/* Main Content Column */}
        <main className="flex-1 flex flex-col min-w-0 overflow-x-hidden">
          {/* Context Workspace & Breadcrumb Bar */}
          <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 lg:px-5 py-2.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-slate-700 dark:text-slate-300" />
                <select
                  value={activeWorkspaceId}
                  onChange={(e) => setActiveWorkspaceId(Number(e.target.value))}
                  className="text-sm font-semibold text-slate-800 dark:text-slate-100 bg-transparent focus:outline-none cursor-pointer"
                >
                  {(data?.workspaces || []).map((ws) => (
                    <option key={ws.id} value={ws.id} className="bg-white dark:bg-slate-900">
                      {ws.name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={() => navigateTo('workspaces')}
                title="Manage Workspaces"
                className="text-[#5C6FA8] dark:text-[#9BAEE5] hover:opacity-80"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setFullscreen((v) => !v)}
                title={fullscreen ? 'Show Sidebar' : 'Expand Workspace'}
                className="text-[#5C6FA8] dark:text-[#9BAEE5] hover:opacity-80 hidden lg:inline-flex"
              >
                {fullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>
            </div>

            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <button
                type="button"
                onClick={() => navigateTo('dashboard')}
                className="text-[#4A5B8C] dark:text-[#9BAEE5] hover:underline flex items-center gap-1"
              >
                <Home className="w-3.5 h-3.5" />
                <span>Home</span>
              </button>
              <span>&gt;</span>
              <span className="text-[#4A5B8C] dark:text-[#9BAEE5]">Endpoint Generator</span>
              {activeGroup && (
                <>
                  <span>&gt;</span>
                  <span>{activeGroup.label}</span>
                </>
              )}
              {activeItem && (
                <>
                  <span>&gt;</span>
                  <span className="font-medium text-slate-700 dark:text-slate-200">{activeItem.label}</span>
                </>
              )}
            </div>
          </div>

          {/* Page Views */}
          <div className="flex-1">
            {page === 'dashboard' && (
              <Dashboard
                analytics={analytics}
                range={analyticsFilter.range}
                startDate={analyticsFilter.startDate}
                endDate={analyticsFilter.endDate}
                drilldownFilter={analyticsFilter.drilldown}
                onFilterChange={setAnalyticsFilter}
                onBarClick={(bar) => {
                  setLogNavFilters({
                    dateRange: `${bar.rangeStart} - ${bar.rangeEnd}`,
                    startInstant: bar.rangeStart,
                    endInstant: bar.rangeEnd,
                    authKeySearch:
                      analyticsFilter.drilldown?.type === 'authKey'
                        ? analyticsFilter.drilldown.value
                        : undefined,
                    pathSearch:
                      analyticsFilter.drilldown?.type === 'endpoint'
                        ? analyticsFilter.drilldown.value
                        : undefined,
                    nonce: Date.now(),
                  });
                  navigateTo('request_log', { preserveLogFilters: true });
                }}
                onNavigate={(p) => {
                  if (p === 'request_log' && analyticsFilter.drilldown?.type === 'endpoint') {
                    setLogNavFilters({
                      pathSearch: analyticsFilter.drilldown.value,
                      nonce: Date.now(),
                    });
                    navigateTo('request_log', { preserveLogFilters: true });
                    return;
                  }
                  navigateTo(p as PageId);
                }}
              />
            )}

            {page === 'collections' && data && (
              <EndpointStudio
                workspaceId={activeWorkspace?.id || 1}
                collections={data.collections}
                endpoints={data.endpoints}
                endpointVersions={data.endpointVersions}
                datasources={data.datasources}
                datasourceObjects={data.datasourceObjects}
                authConfigs={data.authConfigs}
                authIdentifiers={data.authIdentifiers}
                selectedEndpointId={selectedEndpointId}
                onSelectEndpoint={setSelectedEndpointId}
                onRefreshData={handleRefreshAll}
                onOpenWizard={(colId) => {
                  setWizardColId(colId);
                  setWizardOpen(true);
                }}
                onNavigateDoc={(epId) => {
                  setSelectedEndpointId(epId);
                  navigateTo('documentation');
                }}
                onNavigateConfig={(cfgPage) => navigateTo(cfgPage)}
                onInspectLog={(log) => setInspectedLog(log)}
              />
            )}

            {page === 'documentation' && data && (
              <ApiDocumentation
                workspaceId={activeWorkspace?.id || 1}
                collections={data.collections}
                endpoints={data.endpoints}
                endpointVersions={data.endpointVersions}
                authConfigs={data.authConfigs}
                authIdentifiers={data.authIdentifiers}
                environments={data.environments}
                initialEndpointId={selectedEndpointId}
              />
            )}

            {(page === 'request_log' || page === 'report') && data && (
              <RequestMonitor
                mode={page}
                authConfigs={data.authConfigs}
                endpointVersions={data.endpointVersions}
                initialFilters={logNavFilters}
                onSelectLog={(log) => setInspectedLog(log)}
              />
            )}

            {(page === 'endpoint_deployment' ||
              page === 'deployment_history' ||
              page === 'environment') &&
              data && (
                <DeploymentManager
                  tab={page}
                  collections={data.collections}
                  endpoints={data.endpoints}
                  endpointVersions={data.endpointVersions}
                  deployments={data.deployments}
                  environments={data.environments}
                  onRefreshData={handleRefreshAll}
                  onSelectEndpoint={(epId) => {
                    setSelectedEndpointId(epId);
                    navigateTo('collections');
                  }}
                />
              )}

            {(page === 'auth_configuration' ||
              page === 'data_configuration' ||
              page === 'alert_configuration') &&
              data && (
                <ConfigurationManager
                  page={page}
                  workspaceId={activeWorkspace?.id || 1}
                  teams={data.teams}
                  datasources={data.datasources}
                  authConfigs={data.authConfigs}
                  authIdentifiers={data.authIdentifiers}
                  endpoints={data.endpoints}
                  endpointVersions={data.endpointVersions}
                  alertConfigs={data.alertConfigs}
                  onRefreshData={handleRefreshAll}
                  onNavigateEndpoint={(epId) => {
                    setSelectedEndpointId(epId);
                    navigateTo('collections');
                  }}
                />
              )}

            {(page === 'workspaces' || page === 'teams' || page === 'developers') && data && (
              <WorkspaceManagement
                page={page}
                workspaceId={activeWorkspace?.id || 1}
                workspaces={data.workspaces}
                teams={data.teams}
                developers={data.developers}
                onSelectWorkspace={(id) => {
                  setActiveWorkspaceId(id);
                  navigateTo('collections');
                }}
                onRefreshData={handleRefreshAll}
              />
            )}
          </div>
        </main>
      </div>

      {/* Modals & Drawers */}
      {data && (
        <EndpointWizard
          isOpen={wizardOpen}
          collections={data.collections.filter((c) => c.workspaceId === (activeWorkspace?.id || 1))}
          datasources={data.datasources}
          datasourceObjects={data.datasourceObjects}
          defaultCollectionId={wizardColId}
          onClose={() => setWizardOpen(false)}
          onManualCreate={async (colId, dsId) => {
            const res = await apiFetch<{ endpoint: { id: number } }>('/api/endpoints', {
              method: 'POST',
              body: JSON.stringify({
                collectionId: colId,
                name: 'New Custom Endpoint',
                datasourceId: dsId,
                version: {
                  versionNumber: 1,
                  versionLabel: 'Ver.1',
                  method: 'GET',
                  pathSegments: ['public', 'custom_endpoint'],
                  pathParams: [],
                  headers: [],
                  bodyFields: [],
                  dbSchema: 'public',
                  dbObjectName: 'master_locations',
                  dbObjectType: 'table',
                  crudOperation: 'select',
                  sqlMapping: {
                    selectedColumns: ['id', 'location_code', 'location_name'],
                    whereColumns: [],
                    orderBy: 'id',
                    orderDir: 'ASC',
                    customSqlPreview: 'SELECT * FROM public.master_locations;',
                  },
                  paginationConfig: {
                    enabled: true,
                    mode: 'offset',
                    defaultLimit: 25,
                    maxLimit: 200,
                    limitParam: 'limit',
                    offsetParam: 'offset',
                  },
                  status: 'Draft',
                  active: true,
                  scopes: ['Read All'],
                  description: 'Manual endpoint',
                  globalProfiling: false,
                  endpointProfiling: true,
                  rateLimiterEnabled: false,
                  rateLimiterBy: 'By IP',
                  rateLimiterMaxReq: 60,
                  rateLimiterWindow: '1m',
                  rateLimiterMaxConcurrency: 10,
                  circuitBreakerEnabled: false,
                  circuitBreakerFailureThreshold: 50,
                  circuitBreakerTimeoutSec: 30,
                  circuitBreakerFallbackJson: { status: 503, message: 'Unavailable' },
                  cacheEnabled: false,
                  cacheTtlSec: 60,
                  cacheKeyStrategy: 'path+query',
                  useDefaultResponseFormat: true,
                  sitVersionTag: null,
                  sitDeployedAt: null,
                  sitDeployedBy: null,
                  prodVersionTag: null,
                  prodDeployedAt: null,
                  prodDeployedBy: null,
                },
              }),
            });
            await handleRefreshAll();
            setSelectedEndpointId(res.endpoint.id);
          }}
          onCreated={async (created) => {
            await handleRefreshAll();
            if (created[0]) {
              setSelectedEndpointId(created[0].endpoint.id);
            }
          }}
        />
      )}

      <LogProfilerDrawer
        log={inspectedLog}
        onClose={() => setInspectedLog(null)}
        onNavigateEndpoint={(epId) => {
          setSelectedEndpointId(epId);
          navigateTo('collections');
        }}
        onNavigateConfig={(cfgPage) => navigateTo(cfgPage)}
      />

      <AuthModal
        isOpen={authModalOpen}
        needsAdminClaim={data?.needsAdminClaim ?? true}
        onClose={() => setAuthModalOpen(false)}
        onAuthenticated={(user) => {
          setCurrentUser(user);
          handleRefreshAll();
        }}
      />

      <HelpModal isOpen={helpModalOpen} onClose={() => setHelpModalOpen(false)} />
    </div>
  );
}
