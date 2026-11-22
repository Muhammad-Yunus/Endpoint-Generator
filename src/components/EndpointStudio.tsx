import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus,
  Search,
  ChevronRight,
  ChevronDown,
  MoreVertical,
  Pencil,
  ExternalLink,
  Settings,
  Save,
  Trash2,
  Play,
  Info,
  RefreshCw,
  FileText,
  Download,
  Lock,
  HardDrive,
  CheckCircle2,
  AlertTriangle,
  X,
} from 'lucide-react';
import { apiFetch, buildEndpointUrl, formatDisplayDate, formatRelativeTime } from '../lib/api';
import { MethodBadge, ToggleSwitch, EngineBadge } from './ui/MethodBadge';
import type {
  AuthConfig,
  AuthIdentifier,
  Collection,
  Datasource,
  DatasourceObject,
  Endpoint,
  EndpointVersion,
  HttpMethod,
  CrudOperation,
  DbObjectType,
  RequestLog,
  VersionStatus,
} from '../types/domain';

type OpenTab =
  | { kind: 'endpoint'; id: number; title: string }
  | { kind: 'collection'; id: number; title: string };

type SubTab = 'paths' | 'headers' | 'body' | 'data' | 'test' | 'pagination' | 'settings';

const AVAILABLE_SCOPES = ['Read All', 'network:read', 'location:write', 'secureaccess:read', 'cod:read', 'waybill:read'];

export function EndpointStudio({
  workspaceId,
  collections,
  endpoints,
  endpointVersions,
  datasources,
  datasourceObjects,
  authConfigs,
  authIdentifiers,
  selectedEndpointId,
  onSelectEndpoint,
  onRefreshData,
  onOpenWizard,
  onNavigateDoc,
  onNavigateConfig,
  onInspectLog,
}: {
  workspaceId: number;
  collections: Collection[];
  endpoints: Endpoint[];
  endpointVersions: EndpointVersion[];
  datasources: Datasource[];
  datasourceObjects: DatasourceObject[];
  authConfigs: AuthConfig[];
  authIdentifiers: AuthIdentifier[];
  selectedEndpointId: number | null;
  onSelectEndpoint: (id: number | null) => void;
  onRefreshData: () => Promise<void>;
  onOpenWizard: (collectionId: number) => void;
  onNavigateDoc: (endpointId: number) => void;
  onNavigateConfig: (page: 'auth_configuration' | 'data_configuration') => void;
  onInspectLog: (log: RequestLog) => void;
}) {
  const wsCollections = useMemo(
    () => collections.filter((c) => c.workspaceId === workspaceId),
    [collections, workspaceId]
  );

  const [treeSearch, setTreeSearch] = useState('');
  const [expandedCols, setExpandedCols] = useState<Record<number, boolean>>(() => {
    const map: Record<number, boolean> = {};
    collections.forEach((c) => {
      map[c.id] = true;
    });
    return map;
  });
  const [colMenuId, setColMenuId] = useState<number | null>(null);
  const [showNewMenu, setShowNewMenu] = useState(false);
  const [newColModal, setNewColModal] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [newColAuthId, setNewColAuthId] = useState<number | ''>(authConfigs[0]?.id || '');

  const [openTabs, setOpenTabs] = useState<OpenTab[]>(() => {
    const firstEp = selectedEndpointId
      ? endpoints.find((e) => e.id === selectedEndpointId)
      : endpoints.find((e) => wsCollections.some((c) => c.id === e.collectionId)) || endpoints[0];
    return firstEp ? [{ kind: 'endpoint', id: firstEp.id, title: firstEp.name }] : [];
  });
  const [activeTab, setActiveTab] = useState<OpenTab | null>(openTabs[0] || null);
  const [subTab, setSubTab] = useState<SubTab>('settings');

  // Selected version & draft state
  const currentEndpoint = useMemo(
    () => (activeTab?.kind === 'endpoint' ? endpoints.find((e) => e.id === activeTab.id) || null : null),
    [activeTab, endpoints]
  );
  const versionsForEndpoint = useMemo(
    () =>
      currentEndpoint
        ? endpointVersions
            .filter((v) => v.endpointId === currentEndpoint.id)
            .sort((a, b) => a.versionNumber - b.versionNumber)
        : [],
    [currentEndpoint, endpointVersions]
  );

  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null);
  const activeVersion = useMemo(
    () =>
      versionsForEndpoint.find((v) => v.id === selectedVersionId) || versionsForEndpoint[0] || null,
    [versionsForEndpoint, selectedVersionId]
  );

  const [draftVersion, setDraftVersion] = useState<EndpointVersion | null>(null);
  const [draftEndpointName, setDraftEndpointName] = useState('');
  const [renamingEndpoint, setRenamingEndpoint] = useState(false);
  const [newSegmentText, setNewSegmentText] = useState('');
  const [addingSegment, setAddingSegment] = useState(false);
  const [selectedPathIndex, setSelectedPathIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveDropdownOpen, setSaveDropdownOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Collection detail draft
  const currentCollection = useMemo(
    () => (activeTab?.kind === 'collection' ? collections.find((c) => c.id === activeTab.id) || null : null),
    [activeTab, collections]
  );
  const [colDraft, setColDraft] = useState<{ name: string; description: string; authConfigId: number | null; active: boolean } | null>(null);

  // Test Console state
  const [testBodyJson, setTestBodyJson] = useState('{}');
  const [testPathParams, setTestPathParams] = useState<Record<string, string>>({});
  const [testLimit, setTestLimit] = useState('25');
  const [testOffset, setTestOffset] = useState('0');
  const [testAuthIdentifierId, setTestAuthIdentifierId] = useState<number | ''>('');
  const [simulateUpstreamError, setSimulateUpstreamError] = useState(false);
  const [testRunning, setTestRunning] = useState(false);
  const [lastTestLog, setLastTestLog] = useState<RequestLog | null>(null);

  useEffect(() => {
    if (selectedEndpointId) {
      const ep = endpoints.find((e) => e.id === selectedEndpointId);
      if (ep) {
        setOpenTabs((prev) =>
          prev.some((t) => t.kind === 'endpoint' && t.id === ep.id)
            ? prev
            : [...prev, { kind: 'endpoint', id: ep.id, title: ep.name }]
        );
        setActiveTab({ kind: 'endpoint', id: ep.id, title: ep.name });
      }
    }
  }, [selectedEndpointId, endpoints]);

  useEffect(() => {
    if (activeVersion) {
      setDraftVersion(structuredClone(activeVersion));
      setSelectedPathIndex(null);
      const sampleBody: Record<string, unknown> = {};
      activeVersion.bodyFields.forEach((f) => {
        sampleBody[f.name] = f.sampleValue !== undefined ? f.sampleValue : null;
      });
      setTestBodyJson(JSON.stringify(sampleBody, null, 2));
      const pMap: Record<string, string> = {};
      activeVersion.pathParams.forEach((p) => {
        pMap[p.paramName] = p.paramName === 'location_code' ? '31.74.01' : '1';
      });
      setTestPathParams(pMap);
      setLastTestLog(null);
    } else {
      setDraftVersion(null);
    }
  }, [activeVersion?.id]);

  useEffect(() => {
    if (currentEndpoint) {
      setDraftEndpointName(currentEndpoint.name);
      setRenamingEndpoint(false);
    }
  }, [currentEndpoint?.id]);

  useEffect(() => {
    if (currentCollection) {
      setColDraft({
        name: currentCollection.name,
        description: currentCollection.description,
        authConfigId: currentCollection.authConfigId,
        active: currentCollection.active,
      });
    }
  }, [currentCollection?.id]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const openCollectionTab = (col: Collection) => {
    const tab: OpenTab = { kind: 'collection', id: col.id, title: `Detail` };
    setOpenTabs((prev) =>
      prev.some((t) => t.kind === 'collection' && t.id === col.id) ? prev : [...prev, tab]
    );
    setActiveTab(tab);
    setColMenuId(null);
  };

  const openEndpointTab = (ep: Endpoint) => {
    const tab: OpenTab = { kind: 'endpoint', id: ep.id, title: ep.name };
    setOpenTabs((prev) =>
      prev.some((t) => t.kind === 'endpoint' && t.id === ep.id) ? prev : [...prev, tab]
    );
    setActiveTab(tab);
    onSelectEndpoint(ep.id);
    setSelectedVersionId(null);
  };

  const closeTab = (tab: OpenTab) => {
    const next = openTabs.filter((t) => !(t.kind === tab.kind && t.id === tab.id));
    setOpenTabs(next);
    if (activeTab?.kind === tab.kind && activeTab?.id === tab.id) {
      setActiveTab(next[next.length - 1] || null);
    }
  };

  const handleSaveEndpoint = async (publishNow = false) => {
    if (!currentEndpoint || !draftVersion) return;
    setSaving(true);
    try {
      if (draftEndpointName.trim() && draftEndpointName !== currentEndpoint.name) {
        await apiFetch(`/api/endpoints/${currentEndpoint.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ name: draftEndpointName.trim() }),
        });
      }
      const payload = publishNow ? { ...draftVersion, status: 'Published' as VersionStatus } : draftVersion;
      await apiFetch(`/api/versions/${draftVersion.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      await onRefreshData();
      showToast(publishNow ? `${draftVersion.versionLabel} saved & published` : `${draftVersion.versionLabel} saved`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
      setSaveDropdownOpen(false);
    }
  };

  const handleCreateNewVersion = async () => {
    if (!currentEndpoint || !draftVersion) return;
    const nextNum = Math.max(...versionsForEndpoint.map((v) => v.versionNumber), 0) + 1;
    try {
      const created = await apiFetch<EndpointVersion>(`/api/endpoints/${currentEndpoint.id}/versions`, {
        method: 'POST',
        body: JSON.stringify({
          ...draftVersion,
          versionNumber: nextNum,
          versionLabel: `Ver.${nextNum}`,
          status: 'Draft',
          description: `Version ${nextNum} (shares datasource with parent endpoint)`,
        }),
      });
      await onRefreshData();
      setSelectedVersionId(created.id);
      showToast(`Created Ver.${nextNum} sharing the same Datasource`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to create version');
    }
  };

  const handleDeleteVersion = async () => {
    if (!draftVersion) return;
    try {
      await apiFetch(`/api/versions/${draftVersion.id}`, { method: 'DELETE' });
      await onRefreshData();
      showToast(`Deleted ${draftVersion.versionLabel}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const handleSaveCollection = async () => {
    if (!currentCollection || !colDraft) return;
    setSaving(true);
    try {
      await apiFetch(`/api/collections/${currentCollection.id}`, {
        method: 'PATCH',
        body: JSON.stringify(colDraft),
      });
      await onRefreshData();
      showToast(`Collection "${colDraft.name}" updated`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadPostman = (col: Collection) => {
    const colEps = endpoints.filter((e) => e.collectionId === col.id);
    const authCfg = authConfigs.find((a) => a.id === col.authConfigId) || null;
    const postman = {
      info: {
        name: col.name,
        description: col.description,
        schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
      },
      item: colEps.map((ep) => {
        const ver = endpointVersions.find((v) => v.endpointId === ep.id);
        return {
          name: ep.name,
          request: {
            method: ver?.method || 'GET',
            header: authCfg
              ? [
                  { key: authCfg.headerKeyName, value: '[AUTH_KEY]' },
                  ...(authCfg.headerSecretName ? [{ key: authCfg.headerSecretName, value: '[AUTH_SECRET]' }] : []),
                ]
              : [],
            url: ver
              ? buildEndpointUrl('https://apps.demo.com/Dynamic/rest/api/service', ver)
              : '',
          },
        };
      }),
    };
    const blob = new Blob([JSON.stringify(postman, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${col.name.toLowerCase().replace(/\s+/g, '_')}_postman.json`;
    a.click();
  };

  const handleCreateCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newColName.trim()) return;
    try {
      const created = await apiFetch<Collection>('/api/collections', {
        method: 'POST',
        body: JSON.stringify({
          workspaceId,
          name: newColName.trim(),
          description: newColName.trim(),
          authConfigId: newColAuthId ? Number(newColAuthId) : null,
        }),
      });
      await onRefreshData();
      setExpandedCols((prev) => ({ ...prev, [created.id]: true }));
      setNewColModal(false);
      setNewColName('');
      showToast(`Collection "${created.name}" created`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to create collection');
    }
  };

  // Current endpoint's parent Collection & AuthConfig
  const parentCollection = currentEndpoint
    ? collections.find((c) => c.id === currentEndpoint.collectionId) || null
    : null;
  const inheritedAuthConfig = parentCollection?.authConfigId
    ? authConfigs.find((a) => a.id === parentCollection.authConfigId) || null
    : null;
  const availableIdents = inheritedAuthConfig
    ? authIdentifiers.filter((i) => i.authConfigId === inheritedAuthConfig.id && i.active)
    : [];
  const boundDatasource = currentEndpoint
    ? datasources.find((d) => d.id === currentEndpoint.datasourceId) || null
    : null;
  const dsObjects = boundDatasource
    ? datasourceObjects.filter((o) => o.datasourceId === boundDatasource.id)
    : [];

  const handleExecuteTest = async () => {
    if (!draftVersion) return;
    setTestRunning(true);
    try {
      let parsedBody: Record<string, unknown> | null = null;
      if (draftVersion.method !== 'GET' && draftVersion.method !== 'DELETE') {
        parsedBody = JSON.parse(testBodyJson || '{}');
      }
      const headers: Record<string, string> = {};
      if (inheritedAuthConfig) {
        const chosenIdent =
          availableIdents.find((i) => i.id === Number(testAuthIdentifierId)) || availableIdents[0];
        if (chosenIdent) {
          headers[inheritedAuthConfig.headerKeyName] = chosenIdent.apiKey;
          if (inheritedAuthConfig.headerSecretName) {
            headers[inheritedAuthConfig.headerSecretName] = chosenIdent.secretMasked;
          }
        }
      }
      const res = await apiFetch<{ log: RequestLog }>('/api/runtime/execute', {
        method: 'POST',
        body: JSON.stringify({
          versionId: draftVersion.id,
          headers,
          body: parsedBody,
          queryParams: {
            [draftVersion.paginationConfig.limitParam]: testLimit,
            [draftVersion.paginationConfig.offsetParam]: testOffset,
          },
          pathParamValues: testPathParams,
          simulateUpstreamError,
        }),
      });
      setLastTestLog(res.log);
      showToast(`Executed ${res.log.statusMessage} in ${res.log.durationMs}ms`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Test execution failed');
    } finally {
      setTestRunning(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-108px)] min-h-[600px] bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 relative">
      {toastMsg && (
        <div className="fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-md bg-[#2B3445] text-white text-xs font-medium shadow-lg flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-[#7EB09D]" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Left Explorer Tree */}
      <div className="w-full lg:w-[270px] shrink-0 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800 flex flex-col bg-white dark:bg-slate-900">
        <div className="p-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 relative">
          <button
            type="button"
            onClick={() => setShowNewMenu((v) => !v)}
            title="Create Collection or Endpoint"
            className="w-7 h-7 rounded bg-[#EEF1F9] dark:bg-indigo-950/40 text-[#4A5B8C] dark:text-[#A5B7EB] hover:bg-[#5C6FA8] hover:text-white flex items-center justify-center transition-colors shrink-0"
          >
            <Plus className="w-4 h-4" />
          </button>
          {showNewMenu && (
            <div className="absolute top-11 left-2.5 z-30 w-48 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md shadow-lg py-1 text-xs">
              <button
                type="button"
                onClick={() => {
                  setShowNewMenu(false);
                  onOpenWizard(wsCollections[0]?.id || 1);
                }}
                className="w-full px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium"
              >
                + New Endpoint (Wizard)
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowNewMenu(false);
                  setNewColModal(true);
                }}
                className="w-full px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium"
              >
                + New Collection
              </button>
            </div>
          )}

          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={treeSearch}
              onChange={(e) => setTreeSearch(e.target.value)}
              placeholder="search endpoint"
              className="w-full pl-7 pr-2 py-1.5 text-xs rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-[#5C6FA8]"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-1.5">
          {wsCollections.map((col) => {
            const isOpen = !!expandedCols[col.id];
            const colEndpoints = endpoints.filter(
              (ep) =>
                ep.collectionId === col.id &&
                (!treeSearch || ep.name.toLowerCase().includes(treeSearch.toLowerCase()))
            );
            const isColActive =
              (activeTab?.kind === 'collection' && activeTab.id === col.id) ||
              (currentEndpoint?.collectionId === col.id);

            return (
              <div key={col.id} className="select-none">
                <div
                  className={`group px-3 py-2 flex items-center justify-between cursor-pointer transition-colors relative ${
                    isColActive
                      ? 'bg-[#EEF1F9] dark:bg-indigo-950/40 text-[#4A5B8C] dark:text-[#A5B7EB]'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/60 text-[#4A5B8C] dark:text-[#9BAEE5]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setExpandedCols((prev) => ({ ...prev, [col.id]: !isOpen }))}
                    className="flex items-center gap-1.5 min-w-0 flex-1 text-left"
                  >
                    {isOpen ? (
                      <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                    )}
                    <span className="text-xs font-medium truncate">{col.name}</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setColMenuId(colMenuId === col.id ? null : col.id);
                    }}
                    className="p-1 rounded hover:bg-[#DCE3F5] dark:hover:bg-indigo-900/40 text-[#4A5B8C] dark:text-[#9BAEE5]"
                  >
                    <MoreVertical className="w-3.5 h-3.5" />
                  </button>

                  {colMenuId === col.id && (
                    <div className="absolute right-2 top-8 z-30 w-40 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md shadow-lg py-1 text-xs">
                      <button
                        type="button"
                        onClick={() => openCollectionTab(col)}
                        className="w-full px-3 py-2 text-left text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
                      >
                        Detail
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setColMenuId(null);
                          onOpenWizard(col.id);
                        }}
                        className="w-full px-3 py-2 text-left text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
                      >
                        + Add Endpoint
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setColMenuId(null);
                          if (colEndpoints[0]) onNavigateDoc(colEndpoints[0].id);
                        }}
                        className="w-full px-3 py-2 text-left text-[#4A5B8C] dark:text-[#A5B7EB] hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center justify-between"
                      >
                        <span>Documentation</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>

                {isOpen && (
                  <div className="space-y-0.5">
                    {colEndpoints.map((ep) => {
                      const primaryVer = endpointVersions.find((v) => v.endpointId === ep.id);
                      const isEpSelected = activeTab?.kind === 'endpoint' && activeTab.id === ep.id;
                      return (
                        <button
                          key={ep.id}
                          type="button"
                          onClick={() => openEndpointTab(ep)}
                          className={`w-full pl-6 pr-3 py-2 flex items-center gap-2 text-left transition-colors ${
                            isEpSelected
                              ? 'bg-[#F4EFE2] dark:bg-amber-950/30 text-slate-900 dark:text-amber-100 font-medium'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {primaryVer && <MethodBadge method={primaryVer.method} size="xs" />}
                          <span className="text-xs truncate">{ep.name}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Right Multi-Tab Editor */}
      <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-slate-900">
        {/* Top Browser Tabs */}
        <div className="flex items-center border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 px-2 pt-1.5 gap-1 overflow-x-auto">
          {openTabs.map((tab) => {
            const isAct = activeTab?.kind === tab.kind && activeTab?.id === tab.id;
            return (
              <div
                key={`${tab.kind}-${tab.id}`}
                onClick={() => setActiveTab(tab)}
                className={`group flex items-center gap-2 px-3 py-1.5 text-xs rounded-t-md cursor-pointer border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                  isAct
                    ? 'bg-white dark:bg-slate-900 border-[#5C6FA8] text-slate-900 dark:text-slate-100 font-semibold'
                    : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <FileText className="w-3.5 h-3.5 text-slate-400" />
                <span className="max-w-[140px] truncate">{tab.title}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab);
                  }}
                  className="text-slate-400 hover:text-[#5C6FA8]"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => onOpenWizard(currentEndpoint?.collectionId || wsCollections[0]?.id || 1)}
            title="New Endpoint Wizard"
            className="p-1.5 text-[#5C6FA8] dark:text-[#9BAEE5] hover:bg-[#EEF1F9] dark:hover:bg-indigo-950/30 rounded"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Content */}
        {!activeTab && (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400">
            <HardDrive className="w-10 h-10 mb-3 opacity-50" />
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
              Select an endpoint from the Collection tree or launch the Endpoint Wizard
            </p>
            <button
              type="button"
              onClick={() => onOpenWizard(wsCollections[0]?.id || 1)}
              className="mt-4 px-4 py-2 rounded bg-[#5C6FA8] text-white text-xs font-semibold hover:bg-[#4B5D93]"
            >
              + Create Endpoint with Wizard
            </button>
          </div>
        )}

        {/* COLLECTION DETAIL VIEW (Ref: Image 12) */}
        {activeTab?.kind === 'collection' && currentCollection && colDraft && (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 max-w-5xl">
              <div className="lg:col-span-7 space-y-5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={colDraft.name}
                    onChange={(e) => setColDraft({ ...colDraft, name: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Auth Configuration (Inherited by all Endpoints in Collection)
                  </label>
                  <div className="flex items-center gap-2">
                    <select
                      value={colDraft.authConfigId || ''}
                      onChange={(e) =>
                        setColDraft({
                          ...colDraft,
                          authConfigId: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                      className="flex-1 px-3 py-2 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                    >
                      <option value="">No Authentication (Public)</option>
                      {authConfigs.map((ac) => (
                        <option key={ac.id} value={ac.id}>
                          {ac.name} ({ac.providerType})
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => onNavigateConfig('auth_configuration')}
                      title="Open Auth Configuration"
                      className="p-2 rounded bg-[#6883B8] text-white hover:bg-[#556FA3]"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Active
                  </label>
                  <ToggleSwitch
                    checked={colDraft.active}
                    onChange={(v) => setColDraft({ ...colDraft, active: v })}
                    label="Collection Active"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Description <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    rows={3}
                    value={colDraft.description}
                    onChange={(e) => setColDraft({ ...colDraft, description: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                  />
                </div>

                <div className="space-y-3 pt-2 text-xs text-slate-500 dark:text-slate-400">
                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-[#5C6FA8] text-white flex items-center justify-center text-[10px] shrink-0">
                      C
                    </span>
                    <div>
                      <div>
                        create on {formatDisplayDate(currentCollection.createdAt)} ({formatRelativeTime(currentCollection.createdAt)})
                      </div>
                      <div className="text-slate-700 dark:text-slate-300">by {currentCollection.createdBy}</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-[#5C6FA8] text-white flex items-center justify-center text-[10px] shrink-0">
                      U
                    </span>
                    <div>
                      <div>
                        update on {formatDisplayDate(currentCollection.updatedAt)} ({formatRelativeTime(currentCollection.updatedAt)})
                      </div>
                      <div className="text-slate-700 dark:text-slate-300">by {currentCollection.createdBy}</div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={handleSaveCollection}
                    className="px-4 py-2 rounded bg-[#558B78] text-white text-xs font-semibold hover:bg-[#467665] flex items-center gap-1.5"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Save</span>
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await apiFetch(`/api/collections/${currentCollection.id}`, { method: 'DELETE' });
                      closeTab(activeTab);
                      await onRefreshData();
                      showToast('Collection deleted');
                    }}
                    className="px-4 py-2 rounded bg-[#C46A72] text-white text-xs font-semibold hover:bg-[#AD575F] flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                </div>
              </div>

              <div className="lg:col-span-5 border-t lg:border-t-0 lg:border-l border-slate-200 dark:border-slate-800 pt-6 lg:pt-0 lg:pl-8 flex flex-col items-center justify-start gap-4">
                <button
                  type="button"
                  onClick={() => handleDownloadPostman(currentCollection)}
                  className="flex flex-col items-center gap-2 group"
                >
                  <div className="w-14 h-14 rounded-full bg-[#E69D84] text-white flex items-center justify-center shadow group-hover:scale-105 transition-transform">
                    <Download className="w-6 h-6" />
                  </div>
                  <span className="text-xs font-medium text-[#4A5B8C] dark:text-[#A5B7EB] group-hover:underline">
                    download postman collection
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const firstEp = endpoints.find((e) => e.collectionId === currentCollection.id);
                    if (firstEp) onNavigateDoc(firstEp.id);
                  }}
                  className="px-4 py-2 rounded bg-[#558B78] text-white text-xs font-semibold hover:bg-[#467665] flex items-center gap-1.5"
                >
                  <span>View Documentation</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ENDPOINT EDITOR VIEW (Ref: Images 2, 3, 13) */}
        {activeTab?.kind === 'endpoint' && currentEndpoint && draftVersion && (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* Endpoint Header Controls */}
            <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 space-y-2.5 bg-white dark:bg-slate-900">
              {/* Row 1: Breadcrumb Name + Active + Save */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    {parentCollection?.name} /
                  </span>
                  {renamingEndpoint ? (
                    <input
                      type="text"
                      value={draftEndpointName}
                      onChange={(e) => setDraftEndpointName(e.target.value)}
                      onBlur={() => setRenamingEndpoint(false)}
                      autoFocus
                      className="px-2 py-0.5 text-xs font-semibold border border-[#5C6FA8] rounded bg-white dark:bg-slate-800"
                    />
                  ) : (
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">
                      {draftEndpointName}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setRenamingEndpoint((v) => !v)}
                    className="text-slate-400 hover:text-[#5C6FA8]"
                    title="Rename Endpoint"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  {inheritedAuthConfig && (
                    <span className="hidden md:inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 ml-2">
                      <Lock className="w-3 h-3 text-[#5C6FA8] dark:text-[#9BAEE5]" />
                      <span>Collection Auth: {inheritedAuthConfig.name}</span>
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3 relative">
                  <ToggleSwitch
                    checked={draftVersion.active}
                    onChange={(v) => setDraftVersion({ ...draftVersion, active: v })}
                    label="Endpoint Version Active"
                  />
                  <div className="inline-flex rounded overflow-hidden shadow-2xs">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => handleSaveEndpoint(false)}
                      className="px-3.5 py-1.5 bg-[#558B78] hover:bg-[#467665] text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-60"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>{saving ? 'Saving...' : 'Save'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSaveDropdownOpen((v) => !v)}
                      className="px-2 py-1.5 bg-[#467665] hover:bg-[#3A6354] text-white border-l border-[#669B89]"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {saveDropdownOpen && (
                    <div className="absolute right-0 top-9 z-30 w-44 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md shadow-lg py-1 text-xs">
                      <button
                        type="button"
                        onClick={() => handleSaveEndpoint(true)}
                        className="w-full px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"
                      >
                        Save & Publish
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSaveDropdownOpen(false);
                          handleCreateNewVersion();
                        }}
                        className="w-full px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-700 text-[#476B9E] dark:text-sky-300 font-medium"
                      >
                        + Clone as New Version
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Row 2: Method + Bound Datasource Selector */}
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={draftVersion.method}
                  onChange={(e) => setDraftVersion({ ...draftVersion, method: e.target.value as HttpMethod })}
                  className="px-3 py-1.5 text-xs font-semibold rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                >
                  {(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as HttpMethod[]).map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>

                <div className="flex-1 min-w-[260px] flex items-center gap-2 border border-slate-300 dark:border-slate-700 rounded px-3 py-1.5 bg-white dark:bg-slate-800">
                  {boundDatasource && <EngineBadge engine={boundDatasource.engine} />}
                  <span className="text-xs text-slate-400">to</span>
                  <select
                    value={currentEndpoint.datasourceId}
                    onChange={async (e) => {
                      const nextDs = Number(e.target.value);
                      await apiFetch(`/api/endpoints/${currentEndpoint.id}`, {
                        method: 'PATCH',
                        body: JSON.stringify({ datasourceId: nextDs }),
                      });
                      await onRefreshData();
                      showToast('Endpoint datasource updated for all versions');
                    }}
                    title="Bound at Endpoint level — shared across all versions"
                    className="flex-1 text-xs font-semibold text-slate-800 dark:text-slate-100 bg-transparent focus:outline-none"
                  >
                    {datasources.map((ds) => (
                      <option key={ds.id} value={ds.id}>
                        {ds.name}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  onClick={() => onNavigateConfig('data_configuration')}
                  title="Inspect Datasource Connection"
                  className="p-2 rounded bg-[#6883B8] text-white hover:bg-[#556FA3]"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Row 3: Version Selector + URL Path Segments */}
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={draftVersion.id}
                  onChange={(e) => {
                    if (e.target.value === '__new__') {
                      handleCreateNewVersion();
                    } else {
                      setSelectedVersionId(Number(e.target.value));
                    }
                  }}
                  className="px-3 py-1 rounded bg-[#6883B8] text-white text-xs font-semibold focus:outline-none cursor-pointer"
                >
                  {versionsForEndpoint.map((v) => (
                    <option key={v.id} value={v.id} className="bg-white text-slate-900">
                      {v.versionLabel}
                    </option>
                  ))}
                  <option value="__new__" className="bg-white text-[#476B9E] font-semibold">
                    + New Version (Same DB)
                  </option>
                </select>

                {draftVersion.pathSegments.map((seg, idx) => (
                  <React.Fragment key={`${seg}-${idx}`}>
                    <span className="text-slate-400 text-xs font-mono">/</span>
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono text-slate-800 dark:text-slate-200">
                      <span>{seg}</span>
                      <button
                        type="button"
                        onClick={() => {
                          const next = draftVersion.pathSegments.filter((_, i) => i !== idx);
                          setDraftVersion({ ...draftVersion, pathSegments: next });
                        }}
                        className="text-slate-400 hover:text-rose-600"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </React.Fragment>
                ))}

                {addingSegment ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (newSegmentText.trim()) {
                        setDraftVersion({
                          ...draftVersion,
                          pathSegments: [...draftVersion.pathSegments, newSegmentText.trim()],
                        });
                      }
                      setNewSegmentText('');
                      setAddingSegment(false);
                    }}
                    className="inline-flex items-center gap-1"
                  >
                    <input
                      type="text"
                      autoFocus
                      value={newSegmentText}
                      onChange={(e) => setNewSegmentText(e.target.value)}
                      placeholder="segment or {id}"
                      className="px-2 py-1 text-xs font-mono border border-[#5C6FA8] rounded w-32 bg-white dark:bg-slate-800"
                    />
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAddingSegment(true)}
                    className="p-1 text-[#5C6FA8] dark:text-[#9BAEE5] hover:bg-[#EEF1F9] dark:hover:bg-indigo-950/30 rounded"
                    title="Add URL Segment"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Sub-Tabs Strip */}
            <div className="px-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900">
              <div className="flex items-center gap-5 overflow-x-auto">
                {(
                  [
                    { id: 'paths', label: 'Paths' },
                    { id: 'headers', label: 'Headers' },
                    { id: 'body', label: 'Body' },
                    { id: 'data', label: 'Data' },
                    { id: 'test', label: 'Test' },
                    { id: 'pagination', label: 'Pagination' },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSubTab(t.id)}
                    className={`py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                      subTab === t.id
                        ? 'border-[#5C6FA8] text-slate-900 dark:text-slate-100 font-semibold'
                        : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setSubTab('settings')}
                  title="Settings & Resilience Policies"
                  className={`py-2.5 px-1 border-b-2 transition-colors ${
                    subTab === 'settings'
                      ? 'border-[#5C6FA8] text-[#5C6FA8] dark:text-[#9BAEE5]'
                      : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  <Settings className="w-4 h-4" />
                </button>
              </div>

              <button
                type="button"
                onClick={() => onNavigateDoc(currentEndpoint.id)}
                className="text-xs font-medium text-[#4A5B8C] dark:text-[#A5B7EB] hover:underline flex items-center gap-1 whitespace-nowrap shrink-0 ml-4"
              >
                <span>Documentation</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Sub-Tab Panels */}
            <div className="flex-1 overflow-y-auto p-5">
              {/* PATHS TAB (Ref: Image 13) */}
              {subTab === 'paths' && (
                <div className="border border-slate-200 dark:border-slate-800 rounded grid grid-cols-1 md:grid-cols-12 min-h-[280px]">
                  <div className="md:col-span-4 border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-800 p-3 space-y-2">
                    {draftVersion.pathSegments.map((seg, idx) => (
                      <button
                        key={`${seg}-${idx}`}
                        type="button"
                        onClick={() => setSelectedPathIndex(idx)}
                        className={`w-full px-3 py-2 text-left text-xs font-mono rounded border transition-colors ${
                          selectedPathIndex === idx
                            ? 'border-[#5C6FA8] bg-[#EEF1F9]/80 dark:bg-indigo-950/30 text-[#4A5B8C] dark:text-[#A5B7EB]'
                            : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        {seg}
                      </button>
                    ))}
                  </div>
                  <div className="md:col-span-8 p-6 flex items-center justify-center">
                    {selectedPathIndex === null ? (
                      <div className="text-center text-slate-400 space-y-2">
                        <HardDrive className="w-8 h-8 mx-auto opacity-50" />
                        <p className="text-xs">Please select path to edit!</p>
                      </div>
                    ) : (
                      <div className="w-full max-w-md space-y-4">
                        <div className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                          Edit Path Segment #{selectedPathIndex + 1}
                        </div>
                        <div>
                          <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">
                            Segment Value (use {'{param}'} for path parameter)
                          </label>
                          <input
                            type="text"
                            value={draftVersion.pathSegments[selectedPathIndex] || ''}
                            onChange={(e) => {
                              const next = [...draftVersion.pathSegments];
                              next[selectedPathIndex] = e.target.value;
                              const isP = e.target.value.startsWith('{') && e.target.value.endsWith('}');
                              let nextParams = draftVersion.pathParams.filter(
                                (p) => p.segmentIndex !== selectedPathIndex
                              );
                              if (isP) {
                                nextParams.push({
                                  segmentIndex: selectedPathIndex,
                                  segmentName: e.target.value,
                                  isParam: true,
                                  paramName: e.target.value.slice(1, -1),
                                  dataType: 'string',
                                  mappedColumn: e.target.value.slice(1, -1),
                                  description: 'Dynamic path parameter',
                                });
                              }
                              setDraftVersion({ ...draftVersion, pathSegments: next, pathParams: nextParams });
                            }}
                            className="w-full px-3 py-2 text-xs font-mono rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* HEADERS TAB */}
              {subTab === 'headers' && (
                <div className="space-y-4 max-w-4xl">
                  <div className="p-3 rounded bg-[#EEF2FA] dark:bg-indigo-950/40 border border-[#D4DDF0] dark:border-indigo-800/60 text-[#3B4E7A] dark:text-indigo-200 text-xs flex items-center gap-2">
                    <Info className="w-4 h-4 shrink-0 text-[#5C6FA8] dark:text-[#9BAEE5]" />
                    <span>
                      Auth headers from Collection <strong>{parentCollection?.name}</strong> (
                      {inheritedAuthConfig ? inheritedAuthConfig.name : 'Public'}) are automatically inherited.
                    </span>
                  </div>

                  <div className="border border-slate-200 dark:border-slate-800 rounded overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        <tr>
                          <th className="text-left px-3 py-2 font-semibold">Header Name</th>
                          <th className="text-left px-3 py-2 font-semibold">Data Type</th>
                          <th className="text-left px-3 py-2 font-semibold">Mandatory</th>
                          <th className="text-left px-3 py-2 font-semibold">Source / Description</th>
                          <th className="px-3 py-2" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {inheritedAuthConfig && (
                          <>
                            <tr className="bg-[#EEF1F9]/50 dark:bg-indigo-950/15">
                              <td className="px-3 py-2 font-mono font-semibold text-slate-800 dark:text-slate-100">
                                {inheritedAuthConfig.headerKeyName}
                              </td>
                              <td className="px-3 py-2 font-mono">text</td>
                              <td className="px-3 py-2">Required</td>
                              <td className="px-3 py-2 text-slate-500">Inherited from Collection Auth</td>
                              <td className="px-3 py-2 text-right text-[11px] text-[#4A5B8C] dark:text-[#A5B7EB]">Inherited</td>
                            </tr>
                            {inheritedAuthConfig.headerSecretName && (
                              <tr className="bg-[#EEF1F9]/50 dark:bg-indigo-950/15">
                                <td className="px-3 py-2 font-mono font-semibold text-slate-800 dark:text-slate-100">
                                  {inheritedAuthConfig.headerSecretName}
                                </td>
                                <td className="px-3 py-2 font-mono">text</td>
                                <td className="px-3 py-2">Required</td>
                                <td className="px-3 py-2 text-slate-500">Inherited from Collection Auth</td>
                                <td className="px-3 py-2 text-right text-[11px] text-[#4A5B8C] dark:text-[#A5B7EB]">Inherited</td>
                              </tr>
                            )}
                          </>
                        )}
                        {draftVersion.headers
                          .filter((h) => !h.inheritedFromAuth)
                          .map((h, i) => (
                            <tr key={i}>
                              <td className="px-3 py-2 font-mono">{h.name}</td>
                              <td className="px-3 py-2 font-mono">{h.dataType}</td>
                              <td className="px-3 py-2">{h.mandatory ? 'Yes' : 'No'}</td>
                              <td className="px-3 py-2 text-slate-500">{h.description}</td>
                              <td className="px-3 py-2 text-right">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setDraftVersion({
                                      ...draftVersion,
                                      headers: draftVersion.headers.filter((x) => x.name !== h.name),
                                    })
                                  }
                                  className="text-[#B35C68] dark:text-rose-300 hover:underline"
                                >
                                  Remove
                                </button>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setDraftVersion({
                        ...draftVersion,
                        headers: [
                          ...draftVersion.headers,
                          {
                            name: `X-Custom-Header-${draftVersion.headers.length + 1}`,
                            dataType: 'text',
                            length: '64',
                            mandatory: false,
                            description: 'Custom request header',
                          },
                        ],
                      })
                    }
                    className="px-3 py-1.5 rounded border border-[#5C6FA8] text-[#4A5B8C] dark:text-[#A5B7EB] text-xs font-semibold hover:bg-[#EEF1F9] dark:hover:bg-indigo-950/30"
                  >
                    + Add Custom Header
                  </button>
                </div>
              )}

              {/* BODY TAB */}
              {subTab === 'body' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 max-w-5xl">
                  <div className="lg:col-span-7 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                        Request Body Field Mapping ({draftVersion.dbSchema}.{draftVersion.dbObjectName})
                      </h3>
                      <button
                        type="button"
                        onClick={() =>
                          setDraftVersion({
                            ...draftVersion,
                            bodyFields: [
                              ...draftVersion.bodyFields,
                              {
                                name: `var_param_${draftVersion.bodyFields.length + 1}`,
                                dataType: 'string',
                                mandatory: false,
                                mappedColumn: `var_param_${draftVersion.bodyFields.length + 1}`,
                                sampleValue: null,
                                description: 'Parameter mapping',
                              },
                            ],
                          })
                        }
                        className="px-2.5 py-1 rounded border border-[#5C6FA8] text-[#4A5B8C] dark:text-[#A5B7EB] hover:bg-[#EEF1F9] dark:hover:bg-indigo-950/30 text-xs font-semibold"
                      >
                        + Add Field
                      </button>
                    </div>
                    <div className="border border-slate-200 dark:border-slate-800 rounded overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500">
                          <tr>
                            <th className="text-left px-3 py-2">JSON Field</th>
                            <th className="text-left px-3 py-2">Type</th>
                            <th className="text-left px-3 py-2">Mapped Column / Arg</th>
                            <th className="px-2 py-2" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {draftVersion.bodyFields.map((f, idx) => (
                            <tr key={idx}>
                              <td className="px-3 py-1.5">
                                <input
                                  type="text"
                                  value={f.name}
                                  onChange={(e) => {
                                    const next = [...draftVersion.bodyFields];
                                    next[idx] = { ...f, name: e.target.value };
                                    setDraftVersion({ ...draftVersion, bodyFields: next });
                                  }}
                                  className="w-full px-2 py-1 font-mono text-xs border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800"
                                />
                              </td>
                              <td className="px-3 py-1.5 font-mono text-slate-500">{f.dataType}</td>
                              <td className="px-3 py-1.5">
                                <input
                                  type="text"
                                  value={f.mappedColumn}
                                  onChange={(e) => {
                                    const next = [...draftVersion.bodyFields];
                                    next[idx] = { ...f, mappedColumn: e.target.value };
                                    setDraftVersion({ ...draftVersion, bodyFields: next });
                                  }}
                                  className="w-full px-2 py-1 font-mono text-xs border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800"
                                />
                              </td>
                              <td className="px-2 py-1.5 text-right">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setDraftVersion({
                                      ...draftVersion,
                                      bodyFields: draftVersion.bodyFields.filter((_, i) => i !== idx),
                                    })
                                  }
                                  className="text-rose-500 text-[11px] hover:underline"
                                >
                                  Del
                                </button>
                              </td>
                            </tr>
                          ))}
                          {draftVersion.bodyFields.length === 0 && (
                            <tr>
                              <td colSpan={4} className="px-3 py-6 text-center text-slate-400">
                                No body fields configured (typical for GET/DELETE or click + Add Field)
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div className="lg:col-span-5 space-y-2">
                    <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      JSON Payload Preview (Auto-synced to Documentation)
                    </div>
                    <pre className="p-4 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-800 dark:text-slate-200 overflow-x-auto">
                      {JSON.stringify(
                        Object.fromEntries(
                          draftVersion.bodyFields.map((f) => [f.name, f.sampleValue ?? null])
                        ),
                        null,
                        2
                      )}
                    </pre>
                  </div>
                </div>
              )}

              {/* DATA TAB (Object binding per version, sharing Endpoint Datasource) */}
              {subTab === 'data' && (
                <div className="space-y-4 max-w-4xl">
                  <div className="p-3 rounded bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 flex items-center justify-between">
                    <span>
                      Bound Datasource (locked at Endpoint level):{' '}
                      <strong className="text-slate-900 dark:text-slate-100">{boundDatasource?.name}</strong>
                    </span>
                    <span className="font-mono text-[11px] text-[#476B9E] dark:text-sky-300">
                      {draftVersion.versionLabel} object can differ from other versions
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                        Database Object ({dsObjects.length} available)
                      </label>
                      <select
                        value={`${draftVersion.dbSchema}.${draftVersion.dbObjectName}`}
                        onChange={(e) => {
                          const found = dsObjects.find(
                            (o) => `${o.schemaName}.${o.objectName}` === e.target.value
                          );
                          if (found) {
                            setDraftVersion({
                              ...draftVersion,
                              dbSchema: found.schemaName,
                              dbObjectName: found.objectName,
                              dbObjectType: found.objectType,
                              crudOperation:
                                found.objectType === 'function' || found.objectType === 'stored_procedure'
                                  ? 'execute_rpc'
                                  : 'select',
                              sqlMapping: {
                                ...draftVersion.sqlMapping,
                                selectedColumns: found.columns
                                  .filter((c) => c.direction !== 'IN')
                                  .map((c) => c.name),
                                customSqlPreview: `SELECT * FROM ${found.schemaName}.${found.objectName};`,
                              },
                            });
                          }
                        }}
                        className="w-full px-3 py-2 text-xs font-mono rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                      >
                        {dsObjects.map((o) => (
                          <option key={o.id} value={`${o.schemaName}.${o.objectName}`}>
                            {o.schemaName}.{o.objectName} ({o.objectType})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                        Object Type
                      </label>
                      <select
                        value={draftVersion.dbObjectType}
                        onChange={(e) =>
                          setDraftVersion({ ...draftVersion, dbObjectType: e.target.value as DbObjectType })
                        }
                        className="w-full px-3 py-2 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                      >
                        <option value="table">Table</option>
                        <option value="view">View</option>
                        <option value="function">Function</option>
                        <option value="stored_procedure">Stored Procedure</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                        CRUD / RPC Operation
                      </label>
                      <select
                        value={draftVersion.crudOperation}
                        onChange={(e) =>
                          setDraftVersion({ ...draftVersion, crudOperation: e.target.value as CrudOperation })
                        }
                        className="w-full px-3 py-2 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                      >
                        <option value="select">SELECT (List)</option>
                        <option value="select_by_id">SELECT BY ID</option>
                        <option value="insert">INSERT (Create)</option>
                        <option value="update">UPDATE</option>
                        <option value="delete">DELETE</option>
                        <option value="execute_rpc">EXECUTE RPC (Function / SP)</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Generated Parameterized SQL Statement
                    </label>
                    <textarea
                      rows={3}
                      value={draftVersion.sqlMapping.customSqlPreview}
                      onChange={(e) =>
                        setDraftVersion({
                          ...draftVersion,
                          sqlMapping: { ...draftVersion.sqlMapping, customSqlPreview: e.target.value },
                        })
                      }
                      className="w-full px-3 py-2 text-xs font-mono rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200"
                    />
                  </div>
                </div>
              )}

              {/* TEST TAB (Live Runtime Gateway Runner) */}
              {subTab === 'test' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 max-w-5xl">
                  <div className="lg:col-span-6 space-y-4">
                    <div className="p-3 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 space-y-2">
                      <div className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                        Live API Test Runner
                      </div>
                      <div className="text-[11px] font-mono text-slate-600 dark:text-slate-300 break-all">
                        {draftVersion.method}{' '}
                        {buildEndpointUrl(
                          'https://apps.demo.com/Dynamic/rest/api/service',
                          draftVersion,
                          testPathParams
                        )}
                      </div>
                    </div>

                    {inheritedAuthConfig && (
                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                          Auth Identifier ({inheritedAuthConfig.name})
                        </label>
                        <select
                          value={testAuthIdentifierId || availableIdents[0]?.id || ''}
                          onChange={(e) => setTestAuthIdentifierId(Number(e.target.value))}
                          className="w-full px-3 py-2 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                        >
                          {availableIdents.map((idnt) => (
                            <option key={idnt.id} value={idnt.id}>
                              {idnt.name} ({idnt.apiKey})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {draftVersion.pathParams.length > 0 && (
                      <div className="space-y-2">
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                          Path Parameters
                        </label>
                        {draftVersion.pathParams.map((p) => (
                          <div key={p.paramName} className="flex items-center gap-2">
                            <span className="text-xs font-mono w-28 text-slate-500">{`{${p.paramName}}`}</span>
                            <input
                              type="text"
                              value={testPathParams[p.paramName] || ''}
                              onChange={(e) =>
                                setTestPathParams({ ...testPathParams, [p.paramName]: e.target.value })
                              }
                              className="flex-1 px-2.5 py-1.5 text-xs font-mono rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                            />
                          </div>
                        ))}
                      </div>
                    )}

                    {draftVersion.paginationConfig.enabled && (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">
                            {draftVersion.paginationConfig.limitParam}
                          </label>
                          <input
                            type="number"
                            value={testLimit}
                            onChange={(e) => setTestLimit(e.target.value)}
                            className="w-full px-2.5 py-1.5 text-xs font-mono rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">
                            {draftVersion.paginationConfig.offsetParam}
                          </label>
                          <input
                            type="number"
                            value={testOffset}
                            onChange={(e) => setTestOffset(e.target.value)}
                            className="w-full px-2.5 py-1.5 text-xs font-mono rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                          />
                        </div>
                      </div>
                    )}

                    {draftVersion.method !== 'GET' && draftVersion.method !== 'DELETE' && (
                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                          Request Body (JSON)
                        </label>
                        <textarea
                          rows={6}
                          value={testBodyJson}
                          onChange={(e) => setTestBodyJson(e.target.value)}
                          className="w-full p-3 text-xs font-mono rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                        />
                      </div>
                    )}

                    <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={simulateUpstreamError}
                        onChange={(e) => setSimulateUpstreamError(e.target.checked)}
                        className="rounded border-slate-300"
                      />
                      <span>Simulate Upstream DB Timeout (tests Circuit Breaker & Error Log)</span>
                    </label>

                    <button
                      type="button"
                      disabled={testRunning}
                      onClick={handleExecuteTest}
                      className="px-4 py-2 rounded bg-[#5C6FA8] hover:bg-[#4B5D93] text-white text-xs font-semibold flex items-center gap-2 disabled:opacity-60"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>{testRunning ? 'Executing...' : 'Send Live Request'}</span>
                    </button>
                  </div>

                  <div className="lg:col-span-6 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                        Live Response & Profiler
                      </span>
                      {lastTestLog && (
                        <button
                          type="button"
                          onClick={() => onInspectLog(lastTestLog)}
                          className="text-xs text-[#476B9E] dark:text-sky-300 hover:underline flex items-center gap-1"
                        >
                          <span>Inspect Full Profiler</span>
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    {lastTestLog ? (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between px-3 py-2 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono">
                          <span
                            className={
                              lastTestLog.statusCode < 400
                                ? 'text-[#4B826E] dark:text-emerald-300 font-semibold'
                                : 'text-[#B35C68] dark:text-rose-300 font-semibold'
                            }
                          >
                            {lastTestLog.statusMessage}
                          </span>
                          <span className="text-slate-500 tabular-nums">{lastTestLog.durationMs} ms</span>
                        </div>
                        <pre className="p-3.5 rounded bg-[#1F2735] text-[#A6D8C2] text-xs font-mono overflow-x-auto max-h-72">
                          {JSON.stringify(lastTestLog.responseBody, null, 2)}
                        </pre>
                      </div>
                    ) : (
                      <div className="h-64 border border-dashed border-slate-300 dark:border-slate-700 rounded flex items-center justify-center text-xs text-slate-400">
                        Click "Send Live Request" to invoke the gateway and record a profiled Request Log.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* PAGINATION TAB */}
              {subTab === 'pagination' && (
                <div className="max-w-lg space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Enable Response Pagination
                    </span>
                    <ToggleSwitch
                      checked={draftVersion.paginationConfig.enabled}
                      onChange={(v) =>
                        setDraftVersion({
                          ...draftVersion,
                          paginationConfig: { ...draftVersion.paginationConfig, enabled: v },
                        })
                      }
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Mode</label>
                      <select
                        value={draftVersion.paginationConfig.mode}
                        onChange={(e) =>
                          setDraftVersion({
                            ...draftVersion,
                            paginationConfig: {
                              ...draftVersion.paginationConfig,
                              mode: e.target.value as 'offset' | 'cursor',
                            },
                          })
                        }
                        className="w-full px-3 py-2 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                      >
                        <option value="offset">Offset / Limit</option>
                        <option value="cursor">Keyset Cursor</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">
                        Default Page Size
                      </label>
                      <input
                        type="number"
                        value={draftVersion.paginationConfig.defaultLimit}
                        onChange={(e) =>
                          setDraftVersion({
                            ...draftVersion,
                            paginationConfig: {
                              ...draftVersion.paginationConfig,
                              defaultLimit: Number(e.target.value) || 25,
                            },
                          })
                        }
                        className="w-full px-3 py-2 text-xs font-mono rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* SETTINGS TAB (Exact 2-column layout from Images 2 & 3) */}
              {subTab === 'settings' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 max-w-5xl">
                  {/* Left Column */}
                  <div className="lg:col-span-7 space-y-5">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                        Endpoint {draftVersion.versionLabel} Status <span className="text-rose-500">*</span>
                      </label>
                      <div className="flex items-center gap-3">
                        <select
                          value={draftVersion.status}
                          onChange={(e) =>
                            setDraftVersion({ ...draftVersion, status: e.target.value as VersionStatus })
                          }
                          className="flex-1 px-3 py-2 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                        >
                          <option value="Draft">Draft</option>
                          <option value="Published">Published</option>
                          <option value="Deprecated">Deprecated</option>
                        </select>
                        <ToggleSwitch
                          checked={draftVersion.active}
                          onChange={(v) => setDraftVersion({ ...draftVersion, active: v })}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                        Set Endpoint Scope :
                      </label>
                      <div className="border border-slate-300 dark:border-slate-700 rounded p-2 space-y-2 bg-white dark:bg-slate-800">
                        <div className="flex flex-wrap gap-1.5">
                          {draftVersion.scopes.map((sc) => (
                            <span
                              key={sc}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200"
                            >
                              <span>{sc}</span>
                              <button
                                type="button"
                                onClick={() =>
                                  setDraftVersion({
                                    ...draftVersion,
                                    scopes: draftVersion.scopes.filter((x) => x !== sc),
                                  })
                                }
                                className="text-slate-400 hover:text-rose-600"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                        <select
                          value=""
                          onChange={(e) => {
                            if (e.target.value && !draftVersion.scopes.includes(e.target.value)) {
                              setDraftVersion({
                                ...draftVersion,
                                scopes: [...draftVersion.scopes, e.target.value],
                              });
                            }
                          }}
                          className="w-full text-xs text-slate-500 bg-transparent focus:outline-none"
                        >
                          <option value="">Select API Scope...</option>
                          {AVAILABLE_SCOPES.filter((s) => !draftVersion.scopes.includes(s)).map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Soft Slate-Blue Info Alert Callout */}
                      <div className="mt-2.5 p-3.5 rounded bg-[#EEF2FA] dark:bg-indigo-950/40 border border-[#D4DDF0] dark:border-indigo-800/60 text-[#3B4E7A] dark:text-indigo-200 text-xs leading-relaxed flex items-start gap-2.5">
                        <Info className="w-4 h-4 shrink-0 mt-0.5 text-[#5C6FA8] dark:text-[#9BAEE5]" />
                        <div>
                          The scope constrains the endpoints to which a client has access, and whether a client has{' '}
                          <strong>read</strong> or <strong>write</strong> access to an endpoint.
                          <br />
                          Scopes for each identity are defined in the <strong>Auth Configuration Screen</strong> and only available for{' '}
                          <strong>Common Auth</strong> and <strong>JV CAS</strong> Auth Provider.
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                        Description for {draftVersion.versionLabel} <span className="text-rose-500">*</span>
                      </label>
                      <textarea
                        rows={3}
                        value={draftVersion.description}
                        onChange={(e) => setDraftVersion({ ...draftVersion, description: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                      />
                    </div>

                    {/* Audit Trail */}
                    <div className="space-y-3 pt-1 text-xs text-slate-500 dark:text-slate-400">
                      <div className="flex items-start gap-2.5">
                        <span className="w-5 h-5 rounded-full bg-[#5C6FA8] text-white flex items-center justify-center text-[10px] shrink-0">
                          C
                        </span>
                        <div>
                          <div>
                            create on {formatDisplayDate(draftVersion.createdAt)} ({formatRelativeTime(draftVersion.createdAt)})
                          </div>
                          <div className="text-slate-700 dark:text-slate-300">by {draftVersion.createdBy}</div>
                        </div>
                      </div>
                      <div className="flex items-start gap-2.5">
                        <span className="w-5 h-5 rounded-full bg-[#5C6FA8] text-white flex items-center justify-center text-[10px] shrink-0">
                          U
                        </span>
                        <div>
                          <div>
                            update on {formatDisplayDate(draftVersion.updatedAt)} ({formatRelativeTime(draftVersion.updatedAt)})
                          </div>
                          <div className="text-slate-700 dark:text-slate-300">by {draftVersion.createdBy}</div>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleDeleteVersion}
                      className="px-4 py-2 rounded bg-[#C46A72] hover:bg-[#AD575F] text-white text-xs font-semibold flex items-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete {draftVersion.versionLabel}</span>
                    </button>
                  </div>

                  {/* Right Column (Resilience & Policies) */}
                  <div className="lg:col-span-5 border-t lg:border-t-0 lg:border-l border-slate-200 dark:border-slate-800 pt-5 lg:pt-0 lg:pl-7 space-y-5">
                    <div className="space-y-3">
                      <div>
                        <div className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                          <span>Global Profiling</span>
                          <ExternalLink className="w-3 h-3 text-[#5C6FA8] dark:text-[#9BAEE5]" />
                          <RefreshCw className="w-3 h-3 text-[#5C6FA8] dark:text-[#9BAEE5]" />
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setDraftVersion({ ...draftVersion, globalProfiling: !draftVersion.globalProfiling })
                          }
                          className={`mt-1 px-2.5 py-0.5 rounded text-[11px] font-semibold ${
                            draftVersion.globalProfiling
                              ? 'bg-[#558B78] text-white'
                              : 'bg-slate-400 text-white'
                          }`}
                        >
                          {draftVersion.globalProfiling ? 'Active' : 'Inactive'}
                        </button>
                      </div>

                      <div>
                        <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
                          Endpoint Profiling
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setDraftVersion({ ...draftVersion, endpointProfiling: !draftVersion.endpointProfiling })
                          }
                          className={`mt-1 px-2.5 py-0.5 rounded text-[11px] font-semibold ${
                            draftVersion.endpointProfiling
                              ? 'bg-[#558B78] text-white'
                              : 'bg-slate-400 text-white'
                          }`}
                        >
                          {draftVersion.endpointProfiling ? 'Active' : 'Inactive'}
                        </button>
                      </div>
                    </div>

                    {/* Enable Rate Limiter */}
                    <div className="space-y-2.5">
                      <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
                        Enable Rate Limiter
                      </div>
                      <ToggleSwitch
                        checked={draftVersion.rateLimiterEnabled}
                        onChange={(v) => setDraftVersion({ ...draftVersion, rateLimiterEnabled: v })}
                      />
                      {draftVersion.rateLimiterEnabled && (
                        <div className="space-y-2.5 pt-1">
                          <div>
                            <div className="text-[11px] text-slate-500 mb-1">Max Request (Rate Limiting)</div>
                            <div className="flex items-center gap-1.5">
                              <select
                                value={draftVersion.rateLimiterBy}
                                onChange={(e) =>
                                  setDraftVersion({
                                    ...draftVersion,
                                    rateLimiterBy: e.target.value as 'By IP' | 'By Auth Identifier',
                                  })
                                }
                                className="px-2 py-1.5 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                              >
                                <option value="By IP">By IP</option>
                                <option value="By Auth Identifier">By Auth Identifier</option>
                              </select>
                              <input
                                type="number"
                                value={draftVersion.rateLimiterMaxReq}
                                onChange={(e) =>
                                  setDraftVersion({
                                    ...draftVersion,
                                    rateLimiterMaxReq: Number(e.target.value) || 10,
                                  })
                                }
                                className="w-20 px-2 py-1.5 text-xs font-mono rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                              />
                              <span className="text-xs text-slate-400">/</span>
                              <select
                                value={draftVersion.rateLimiterWindow}
                                onChange={(e) =>
                                  setDraftVersion({
                                    ...draftVersion,
                                    rateLimiterWindow: e.target.value as '1m' | '5m' | '1h',
                                  })
                                }
                                className="px-2 py-1.5 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                              >
                                <option value="1m">1m</option>
                                <option value="5m">5m</option>
                                <option value="1h">1h</option>
                              </select>
                            </div>
                          </div>
                          <div>
                            <div className="text-[11px] text-slate-500 mb-1">Max Concurrence</div>
                            <input
                              type="number"
                              value={draftVersion.rateLimiterMaxConcurrency}
                              onChange={(e) =>
                                setDraftVersion({
                                  ...draftVersion,
                                  rateLimiterMaxConcurrency: Number(e.target.value) || 1,
                                })
                              }
                              className="w-24 px-2.5 py-1.5 text-xs font-mono rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                            />
                          </div>
                        </div>
                      )}
                      <div className="text-[11px] text-[#4A5B8C] dark:text-[#A5B7EB] flex items-center gap-1">
                        <Info className="w-3 h-3" />
                        <span>about Rate Limiter &gt;</span>
                      </div>
                    </div>

                    {/* Enable Circuit Breaker */}
                    <div className="space-y-2.5">
                      <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
                        Enable Circuit Breaker
                      </div>
                      <ToggleSwitch
                        checked={draftVersion.circuitBreakerEnabled}
                        onChange={(v) => setDraftVersion({ ...draftVersion, circuitBreakerEnabled: v })}
                      />
                      {draftVersion.circuitBreakerEnabled && (
                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <div>
                            <label className="block text-[11px] text-slate-500 mb-1">Failure %</label>
                            <input
                              type="number"
                              value={draftVersion.circuitBreakerFailureThreshold}
                              onChange={(e) =>
                                setDraftVersion({
                                  ...draftVersion,
                                  circuitBreakerFailureThreshold: Number(e.target.value) || 50,
                                })
                              }
                              className="w-full px-2 py-1 text-xs font-mono rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-slate-500 mb-1">Open Timeout (s)</label>
                            <input
                              type="number"
                              value={draftVersion.circuitBreakerTimeoutSec}
                              onChange={(e) =>
                                setDraftVersion({
                                  ...draftVersion,
                                  circuitBreakerTimeoutSec: Number(e.target.value) || 30,
                                })
                              }
                              className="w-full px-2 py-1 text-xs font-mono rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={async () => {
                              await apiFetch(`/api/versions/${draftVersion.id}/reset-circuit`, { method: 'POST' });
                              showToast('Circuit breaker state reset to CLOSED');
                            }}
                            className="col-span-2 px-2.5 py-1 text-[11px] font-medium rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                          >
                            Reset Circuit State
                          </button>
                        </div>
                      )}
                      <div className="text-[11px] text-[#4A5B8C] dark:text-[#A5B7EB] flex items-center gap-1">
                        <Info className="w-3 h-3" />
                        <span>about Circuit Breaker &gt;</span>
                      </div>
                    </div>

                    {/* Enable Cache Control */}
                    <div className="space-y-2.5">
                      <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
                        Enable Cache Control
                      </div>
                      <ToggleSwitch
                        checked={draftVersion.cacheEnabled}
                        onChange={(v) => setDraftVersion({ ...draftVersion, cacheEnabled: v })}
                      />
                      {draftVersion.cacheEnabled && (
                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <div>
                            <label className="block text-[11px] text-slate-500 mb-1">TTL (seconds)</label>
                            <input
                              type="number"
                              value={draftVersion.cacheTtlSec}
                              onChange={(e) =>
                                setDraftVersion({ ...draftVersion, cacheTtlSec: Number(e.target.value) || 60 })
                              }
                              className="w-full px-2 py-1 text-xs font-mono rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-slate-500 mb-1">Cache Key</label>
                            <select
                              value={draftVersion.cacheKeyStrategy}
                              onChange={(e) =>
                                setDraftVersion({
                                  ...draftVersion,
                                  cacheKeyStrategy: e.target.value as 'path+query' | 'path+body' | 'path+auth',
                                })
                              }
                              className="w-full px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                            >
                              <option value="path+body">path+body</option>
                              <option value="path+query">path+query</option>
                              <option value="path+auth">path+auth</option>
                            </select>
                          </div>
                          <button
                            type="button"
                            onClick={async () => {
                              const r = await apiFetch<{ cleared: number }>(
                                `/api/versions/${draftVersion.id}/purge-cache`,
                                { method: 'POST' }
                              );
                              showToast(`Purged ${r.cleared} cached entries`);
                            }}
                            className="col-span-2 px-2.5 py-1 text-[11px] font-medium rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                          >
                            Invalidate / Purge Cache
                          </button>
                        </div>
                      )}
                      <div className="text-[11px] text-[#4A5B8C] dark:text-[#A5B7EB] flex items-center gap-1">
                        <Info className="w-3 h-3" />
                        <span>about Cache Control &gt;</span>
                      </div>
                    </div>

                    {/* Response Format */}
                    <div className="space-y-2 pt-1">
                      <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
                        Response Format
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setDraftVersion({
                            ...draftVersion,
                            useDefaultResponseFormat: !draftVersion.useDefaultResponseFormat,
                          })
                        }
                        className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
                          draftVersion.useDefaultResponseFormat
                            ? 'bg-[#6883B8] text-white'
                            : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                        }`}
                      >
                        {draftVersion.useDefaultResponseFormat ? 'Use Response Default' : 'Raw JSON Output'}
                      </button>
                      <div className="text-[11px] font-mono text-slate-500">
                        Response Model{' '}
                        {draftVersion.useDefaultResponseFormat
                          ? '{ status, message, data }'
                          : '{ raw_rows[] }'}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* New Collection Modal */}
      {newColModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <form
            onSubmit={handleCreateCollection}
            className="w-full max-w-md rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-5 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                Create New Collection
              </h3>
              <button type="button" onClick={() => setNewColModal(false)}>
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Collection Name
              </label>
              <input
                type="text"
                required
                value={newColName}
                onChange={(e) => setNewColName(e.target.value)}
                placeholder="e.g., Waybill Tracking Service"
                className="w-full px-3 py-2 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Collection-Level Auth Provider
              </label>
              <select
                value={newColAuthId}
                onChange={(e) => setNewColAuthId(e.target.value ? Number(e.target.value) : '')}
                className="w-full px-3 py-2 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
              >
                <option value="">No Auth (Public)</option>
                {authConfigs.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.providerType})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNewColModal(false)}
                className="px-3 py-1.5 text-xs rounded border border-slate-300 dark:border-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 text-xs font-semibold rounded bg-[#5C6FA8] hover:bg-[#4B5D93] text-white"
              >
                Create Collection
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
