import React, { useState, useMemo } from 'react';
import { Search, Copy, Check, Minus, Plus, ChevronRight, ChevronDown } from 'lucide-react';
import { buildEndpointUrl, generateCurlCommand } from '../lib/api';
import { MethodBadge } from './ui/MethodBadge';
import type {
  AuthConfig,
  AuthIdentifier,
  Collection,
  Endpoint,
  EndpointVersion,
  EnvironmentConfig,
} from '../types/domain';

export function ApiDocumentation({
  workspaceId,
  collections,
  endpoints,
  endpointVersions,
  authConfigs,
  authIdentifiers,
  environments,
  initialEndpointId,
}: {
  workspaceId: number;
  collections: Collection[];
  endpoints: Endpoint[];
  endpointVersions: EndpointVersion[];
  authConfigs: AuthConfig[];
  authIdentifiers: AuthIdentifier[];
  environments: EnvironmentConfig[];
  initialEndpointId: number | null;
}) {
  const wsCollections = useMemo(
    () => collections.filter((c) => c.workspaceId === workspaceId),
    [collections, workspaceId]
  );

  const [search, setSearch] = useState('');
  const [selectedEndpointId, setSelectedEndpointId] = useState<number>(
    initialEndpointId ||
      endpoints.find((e) => wsCollections.some((c) => c.id === e.collectionId))?.id ||
      endpoints[0]?.id ||
      1
  );
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null);
  const [expandedMap, setExpandedMap] = useState<Record<number, boolean>>(() => {
    const m: Record<number, boolean> = {};
    collections.forEach((c) => (m[c.id] = true));
    return m;
  });
  const [collapsedBody, setCollapsedBody] = useState(false);
  const [copied, setCopied] = useState(false);
  const [envBase, setEnvBase] = useState<'PROD' | 'SIT'>('PROD');

  const endpoint = endpoints.find((e) => e.id === selectedEndpointId) || endpoints[0];
  const collection = endpoint ? collections.find((c) => c.id === endpoint.collectionId) || null : null;
  const versions = endpoint
    ? endpointVersions.filter((v) => v.endpointId === endpoint.id).sort((a, b) => a.versionNumber - b.versionNumber)
    : [];
  const version = versions.find((v) => v.id === selectedVersionId) || versions[0] || null;
  const authConfig = collection?.authConfigId
    ? authConfigs.find((a) => a.id === collection.authConfigId) || null
    : null;
  const sampleIdent = authConfig
    ? authIdentifiers.find((i) => i.authConfigId === authConfig.id && i.active) || null
    : null;

  const baseUrl =
    environments.find((e) => e.name === envBase)?.baseUrl ||
    'https://apps.demo.com/Dynamic/rest/api/service';

  const fullUrl = version ? buildEndpointUrl(baseUrl, version) : '';
  const curlText = version
    ? generateCurlCommand({ baseUrl, version, authConfig, sampleIdentifier: sampleIdent })
    : '';

  const requestHeadersList = useMemo(() => {
    if (!version) return [];
    const list: Array<{ name: string; dataType: string; length: string; mandatory: string; description: string }> = [];
    if (authConfig) {
      list.push({
        name: authConfig.headerKeyName,
        dataType: 'text',
        length: '',
        mandatory: '',
        description: `${authConfig.providerType} Key`,
      });
      if (authConfig.headerSecretName) {
        list.push({
          name: authConfig.headerSecretName,
          dataType: 'text',
          length: '',
          mandatory: '',
          description: `${authConfig.providerType} Secret`,
        });
      }
    }
    version.headers
      .filter((h) => !h.inheritedFromAuth)
      .forEach((h) => {
        list.push({
          name: h.name,
          dataType: h.dataType,
          length: h.length,
          mandatory: h.mandatory ? 'Yes' : 'No',
          description: h.description,
        });
      });
    return list;
  }, [version, authConfig]);

  const bodySampleObj = useMemo(() => {
    if (!version) return {};
    return Object.fromEntries(
      version.bodyFields.map((f) => [f.name, f.sampleValue !== undefined ? f.sampleValue : null])
    );
  }, [version]);

  const handleCopyCurl = () => {
    navigator.clipboard.writeText(curlText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-108px)] min-h-[600px] bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
      {/* Left Navigation */}
      <div className="w-full lg:w-[260px] shrink-0 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800 p-3 space-y-3 overflow-y-auto">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search endpoint"
            className="w-full pl-8 pr-2.5 py-1.5 text-xs rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:border-[#5C6FA8]"
          />
        </div>

        <div className="space-y-1">
          {wsCollections.map((col) => {
            const colEps = endpoints.filter(
              (ep) =>
                ep.collectionId === col.id &&
                (!search || ep.name.toLowerCase().includes(search.toLowerCase()))
            );
            const isActiveCol = collection?.id === col.id;
            const isOpen = !!expandedMap[col.id];
            return (
              <div key={col.id}>
                <button
                  type="button"
                  onClick={() => setExpandedMap((p) => ({ ...p, [col.id]: !isOpen }))}
                  className={`w-full px-3 py-2 text-left text-xs font-medium rounded flex items-center justify-between transition-colors ${
                    isActiveCol
                      ? 'bg-[#EEF1F9] dark:bg-indigo-950/40 text-[#4A5B8C] dark:text-[#A5B7EB]'
                      : 'text-[#4A5B8C] dark:text-[#9BAEE5] hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <span className="truncate">{col.name}</span>
                  {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                </button>
                {isOpen && (
                  <div className="mt-0.5 space-y-0.5 pl-2">
                    {colEps.map((ep) => {
                      const ver = endpointVersions.find((v) => v.endpointId === ep.id);
                      const isSel = endpoint?.id === ep.id;
                      return (
                        <button
                          key={ep.id}
                          type="button"
                          onClick={() => {
                            setSelectedEndpointId(ep.id);
                            setSelectedVersionId(null);
                          }}
                          className={`w-full px-2.5 py-1.5 rounded text-left text-xs flex items-center gap-2 ${
                            isSel
                              ? 'bg-slate-100 dark:bg-slate-800 font-semibold text-slate-900 dark:text-slate-100'
                              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                          }`}
                        >
                          {ver && <MethodBadge method={ver.method} size="xs" />}
                          <span className="truncate">{ep.name}</span>
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

      {/* Main Documentation Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {endpoint && version ? (
          <div className="max-w-5xl space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-4 pb-3 border-b border-[#C6D0EB] dark:border-indigo-800/60">
              <div>
                <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">{endpoint.name}</h1>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {endpoint.name} Endpoint, Deployed by Endpoint Generator Deployment
                </p>
              </div>
              <div className="flex items-center gap-2">
                {versions.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setSelectedVersionId(v.id)}
                    className={`px-2.5 py-1 rounded text-xs font-semibold ${
                      version.id === v.id
                        ? 'bg-[#6883B8] text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {v.versionLabel}
                  </button>
                ))}
                <select
                  value={envBase}
                  onChange={(e) => setEnvBase(e.target.value as 'PROD' | 'SIT')}
                  className="px-2.5 py-1 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                >
                  <option value="PROD">PROD Host</option>
                  <option value="SIT">SIT Host</option>
                </select>
              </div>
            </div>

            {/* Soft Slate-Blue Method + URL Container */}
            <div className="border-2 border-[#94ADD7] dark:border-sky-800/70 rounded overflow-hidden">
              <div className="flex items-center justify-between gap-3 px-3 py-2 bg-[#EEF2FA]/80 dark:bg-indigo-950/30">
                <div className="flex items-center gap-3 min-w-0">
                  <MethodBadge method={version.method} size="md" />
                  <span className="text-xs font-mono text-slate-800 dark:text-slate-200 truncate">
                    {fullUrl}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setCollapsedBody((v) => !v)}
                  className="p-1 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                >
                  {collapsedBody ? <Plus className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
                </button>
              </div>

              {!collapsedBody && (
                <div className="p-4 space-y-5 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                  <div className="text-xs text-slate-600 dark:text-slate-300">{version.description}</div>

                  {/* Request Header Table */}
                  <div className="space-y-2">
                    <h3 className="text-xs font-bold text-slate-800 dark:text-slate-100">Request Header</h3>
                    <div className="border border-slate-200 dark:border-slate-800 rounded overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                          <tr>
                            <th className="text-left px-3 py-2 font-semibold">Name</th>
                            <th className="text-left px-3 py-2 font-semibold">Data Type</th>
                            <th className="text-left px-3 py-2 font-semibold">Length</th>
                            <th className="text-left px-3 py-2 font-semibold">Mandatory</th>
                            <th className="text-left px-3 py-2 font-semibold">Description</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {requestHeadersList.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="px-3 py-3 text-slate-400">
                                No authentication headers required
                              </td>
                            </tr>
                          ) : (
                            requestHeadersList.map((h) => (
                              <tr key={h.name}>
                                <td className="px-3 py-2 font-mono text-slate-800 dark:text-slate-200">{h.name}</td>
                                <td className="px-3 py-2 font-mono text-slate-600 dark:text-slate-400">{h.dataType}</td>
                                <td className="px-3 py-2 font-mono text-slate-500">{h.length}</td>
                                <td className="px-3 py-2 text-slate-500">{h.mandatory}</td>
                                <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{h.description}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Request Body JSON */}
                  {version.method !== 'GET' && version.method !== 'DELETE' && (
                    <div className="space-y-2">
                      <h3 className="text-xs font-bold text-slate-800 dark:text-slate-100">Request Body</h3>
                      <pre className="p-4 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs font-mono text-slate-800 dark:text-slate-200 overflow-x-auto">
                        {JSON.stringify(bodySampleObj, null, 2)}
                      </pre>
                    </div>
                  )}

                  {/* CURL Code Block */}
                  <div className="space-y-2">
                    <h3 className="text-xs font-bold text-slate-800 dark:text-slate-100">CURL</h3>
                    <div className="relative rounded border border-slate-200 dark:border-slate-800 bg-[#F1F3F5] dark:bg-slate-950 p-4">
                      <pre className="text-xs font-mono text-slate-700 dark:text-slate-200 overflow-x-auto pr-20 whitespace-pre-wrap break-all">
                        {curlText}
                      </pre>
                      <button
                        type="button"
                        onClick={handleCopyCurl}
                        className="absolute bottom-3 right-3 px-2.5 py-1 rounded border border-[#C6D0EB] dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] font-semibold text-[#4A5B8C] dark:text-[#A5B7EB] hover:bg-[#EEF1F9] dark:hover:bg-slate-700 flex items-center gap-1"
                      >
                        {copied ? <Check className="w-3 h-3 text-[#4B826E] dark:text-emerald-300" /> : <Copy className="w-3 h-3" />}
                        <span>{copied ? 'COPIED' : 'COPY'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="text-xs text-slate-400">Select an endpoint to inspect live documentation.</div>
        )}
      </div>
    </div>
  );
}
