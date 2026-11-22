import React, { useState, useMemo } from 'react';
import { Search, RefreshCw, Plug, CheckCircle2, ArrowRight, Globe, Shield } from 'lucide-react';
import { apiFetch, formatRelativeTime } from '../lib/api';
import { ToggleSwitch } from './ui/MethodBadge';
import type {
  Collection,
  DeploymentRecord,
  Endpoint,
  EndpointVersion,
  EnvironmentConfig,
} from '../types/domain';

export function DeploymentManager({
  tab,
  collections,
  endpoints,
  endpointVersions,
  deployments,
  environments,
  onRefreshData,
  onSelectEndpoint,
}: {
  tab: 'endpoint_deployment' | 'deployment_history' | 'environment';
  collections: Collection[];
  endpoints: Endpoint[];
  endpointVersions: EndpointVersion[];
  deployments: DeploymentRecord[];
  environments: EnvironmentConfig[];
  onRefreshData: () => Promise<void>;
  onSelectEndpoint: (epId: number) => void;
}) {
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [checkedVersionIds, setCheckedVersionIds] = useState<number[]>([]);
  const [deployEnv, setDeployEnv] = useState<'PROD' | 'SIT'>('PROD');
  const [deploying, setDeploying] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const filteredVersions = useMemo(() => {
    const q = search.trim().toLowerCase();
    return endpointVersions
      .map((v) => {
        const ep = endpoints.find((e) => e.id === v.endpointId);
        const col = ep ? collections.find((c) => c.id === ep.collectionId) : null;
        return { version: v, endpoint: ep, collection: col };
      })
      .filter((row) => row.endpoint && row.collection)
      .filter(
        (row) =>
          selectedCollectionId === 'all' || row.collection!.id === Number(selectedCollectionId)
      )
      .filter(
        (row) =>
          !q ||
          row.endpoint!.name.toLowerCase().includes(q) ||
          row.collection!.name.toLowerCase().includes(q)
      );
  }, [endpointVersions, endpoints, collections, selectedCollectionId, search]);

  const toggleCheck = (vid: number) => {
    setCheckedVersionIds((prev) =>
      prev.includes(vid) ? prev.filter((id) => id !== vid) : [...prev, vid]
    );
  };

  const handleDeploy = async () => {
    if (checkedVersionIds.length === 0) return;
    setDeploying(true);
    try {
      await apiFetch('/api/deployments', {
        method: 'POST',
        body: JSON.stringify({
          versionIds: checkedVersionIds,
          environment: deployEnv,
          notes: `Batch deployment (${checkedVersionIds.length} endpoints) to ${deployEnv}`,
        }),
      });
      await onRefreshData();
      setToast(`Deployed ${checkedVersionIds.length} endpoint(s) to ${deployEnv}`);
      setCheckedVersionIds([]);
      setTimeout(() => setToast(null), 3000);
    } finally {
      setDeploying(false);
    }
  };

  if (tab === 'deployment_history') {
    return (
      <div className="p-4 lg:p-5 space-y-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">Deployment History</h2>
            <span className="text-xs text-slate-500 tabular-nums">{deployments.length} records</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="text-left px-4 py-2.5">Environment</th>
                  <th className="text-left px-4 py-2.5">Collection / Endpoint</th>
                  <th className="text-left px-4 py-2.5">Version Tag</th>
                  <th className="text-left px-4 py-2.5">Deployed By</th>
                  <th className="text-left px-4 py-2.5">Deployed At</th>
                  <th className="text-left px-4 py-2.5">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {deployments.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-2.5">
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                          d.environment === 'PROD'
                            ? 'bg-[#558B78] text-white'
                            : 'bg-[#6883B8] text-white'
                        }`}
                      >
                        {d.environment}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-[#4A5B8C] dark:text-[#A5B7EB]">{d.endpointName}</div>
                      <div className="text-[11px] text-slate-500">{d.collectionName}</div>
                    </td>
                    <td className="px-4 py-2.5 font-mono font-semibold">{d.versionTag}</td>
                    <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">{d.deployedBy}</td>
                    <td className="px-4 py-2.5 font-mono text-slate-500">
                      {new Date(d.deployedAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">{d.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  if (tab === 'environment') {
    return (
      <div className="p-4 lg:p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        {environments.map((env) => (
          <div
            key={env.id}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md p-5 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-[#6883B8] dark:text-sky-300" />
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                  {env.name} Environment
                </h3>
              </div>
              <span className="text-[11px] font-mono text-slate-500">{env.gatewayHost}</span>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-500 mb-1">Gateway Base URL</label>
                <input
                  type="text"
                  defaultValue={env.baseUrl}
                  onBlur={async (e) => {
                    await apiFetch(`/api/environments/${env.id}`, {
                      method: 'PATCH',
                      body: JSON.stringify({ baseUrl: e.target.value }),
                    });
                    await onRefreshData();
                  }}
                  className="w-full px-3 py-2 font-mono rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                  <Shield className="w-3.5 h-3.5 text-[#558B78] dark:text-emerald-300" />
                  <span>TLS 1.3 Mutual Enforcement</span>
                </span>
                <ToggleSwitch
                  checked={env.tlsEnabled}
                  onChange={async (v) => {
                    await apiFetch(`/api/environments/${env.id}`, {
                      method: 'PATCH',
                      body: JSON.stringify({ tlsEnabled: v }),
                    });
                    await onRefreshData();
                  }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ENDPOINT DEPLOYMENT MATRIX (Ref: Image 4)
  return (
    <div className="p-4 lg:p-5 space-y-4">
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded bg-[#2B3445] text-white text-xs font-medium shadow-lg flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-[#7EB09D]" />
          <span>{toast}</span>
        </div>
      )}

      {/* Top Collection Selector */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <select
          value={selectedCollectionId}
          onChange={(e) => setSelectedCollectionId(e.target.value)}
          className="w-72 px-3 py-2 text-xs font-medium rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
        >
          <option value="all">All Collections</option>
          {collections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500">Target Promotion:</span>
          <select
            value={deployEnv}
            onChange={(e) => setDeployEnv(e.target.value as 'PROD' | 'SIT')}
            className="px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-semibold"
          >
            <option value="PROD">SIT → Prod Environment</option>
            <option value="SIT">Draft → SIT Environment</option>
          </select>
        </div>
      </div>

      {/* Side-by-Side Matrix */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden">
        <div className="grid grid-cols-12 items-stretch">
          {/* Header Row */}
          <div className="col-span-5 p-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search Endpoint Name"
                className="w-full pl-8 pr-2.5 py-1.5 text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>
            <button
              type="button"
              onClick={onRefreshData}
              className="p-1.5 rounded border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-800"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="col-span-3 bg-[#3E4C63] dark:bg-slate-800 text-white px-4 py-2.5 flex items-center justify-between text-xs font-semibold">
            <span>SIT Environment</span>
            <RefreshCw className="w-3.5 h-3.5 opacity-75" />
          </div>

          <div className="col-span-1 flex items-center justify-center p-1.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
            <button
              type="button"
              disabled={checkedVersionIds.length === 0 || deploying}
              onClick={handleDeploy}
              className={`px-2.5 py-1.5 rounded text-xs font-semibold flex items-center gap-1 transition-colors whitespace-nowrap ${
                checkedVersionIds.length > 0
                  ? 'bg-[#5C6FA8] text-white hover:bg-[#4B5D93] shadow'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed'
              }`}
            >
              <span>{deploying ? '...' : 'Deploy'}</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          <div className="col-span-3 bg-[#3E4C63] dark:bg-slate-800 text-white px-4 py-2.5 flex items-center justify-between text-xs font-semibold">
            <span>Prod Environment</span>
            <RefreshCw className="w-3.5 h-3.5 opacity-75" />
          </div>

          {/* Rows */}
          {filteredVersions.map(({ version, endpoint, collection }) => {
            const isChecked = checkedVersionIds.includes(version.id);
            return (
              <React.Fragment key={version.id}>
                <div className="col-span-5 px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleCheck(version.id)}
                    className="rounded border-slate-300"
                  />
                  <Plug className="w-4 h-4 text-slate-400 shrink-0" />
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => onSelectEndpoint(endpoint!.id)}
                      className="text-xs font-medium text-[#4A5B8C] dark:text-[#A5B7EB] hover:underline truncate block text-left"
                    >
                      {endpoint!.name} ({version.versionLabel})
                    </button>
                    <div className="text-[11px] text-slate-500">{collection!.name}</div>
                  </div>
                </div>

                <div className="col-span-3 px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
                  {version.sitVersionTag ? (
                    <>
                      <span className="text-sm font-bold text-slate-800 dark:text-slate-100 font-mono">
                        {version.sitVersionTag}
                      </span>
                      <div className="text-[11px] text-slate-500 leading-tight">
                        <div>
                          {version.sitDeployedAt?.slice(0, 16).replace('T', ' ')} (
                          {formatRelativeTime(version.sitDeployedAt)})
                        </div>
                        {version.sitDeployedBy && <div>{version.sitDeployedBy}</div>}
                      </div>
                    </>
                  ) : (
                    <span className="text-[11px] text-slate-400">Not deployed</span>
                  )}
                </div>

                <div className="col-span-1 border-b border-slate-100 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/20" />

                <div className="col-span-3 px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
                  {version.prodVersionTag ? (
                    <>
                      <span className="text-sm font-bold text-slate-800 dark:text-slate-100 font-mono">
                        {version.prodVersionTag}
                      </span>
                      <div className="text-[11px] text-slate-500 leading-tight">
                        <div>
                          {version.prodDeployedAt?.slice(0, 16).replace('T', ' ')} (
                          {formatRelativeTime(version.prodDeployedAt)})
                        </div>
                        {version.prodDeployedBy && <div>{version.prodDeployedBy}</div>}
                      </div>
                    </>
                  ) : (
                    <span className="text-[11px] text-slate-400">Not deployed</span>
                  )}
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}
