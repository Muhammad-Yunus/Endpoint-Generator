import React, { useState, useMemo } from 'react';
import {
  Search,
  KeyRound,
  Trash2,
  Lock,
  Unlock,
  RefreshCw,
  Bell,
  Copy,
  Check,
  X,
  Plus,
  ExternalLink,
  Info,
  ChevronRight,
  ChevronDown,
  Save,
  CheckCircle2,
  Database,
} from 'lucide-react';
import { apiFetch, formatDisplayDate, formatRelativeTime } from '../lib/api';
import { MethodBadge, ToggleSwitch, EngineBadge } from './ui/MethodBadge';
import type {
  AlertConfig,
  AuthConfig,
  AuthIdentifier,
  AuthProviderType,
  Datasource,
  DbEngine,
  Endpoint,
  EndpointVersion,
  Team,
} from '../types/domain';

const SCOPES = ['Read All', 'network:read', 'location:write', 'secureaccess:read', 'cod:read', 'waybill:read'];

export function ConfigurationManager({
  page,
  workspaceId,
  teams,
  datasources,
  authConfigs,
  authIdentifiers,
  endpoints,
  endpointVersions,
  alertConfigs,
  onRefreshData,
  onNavigateEndpoint,
}: {
  page: 'auth_configuration' | 'data_configuration' | 'alert_configuration';
  workspaceId: number;
  teams: Team[];
  datasources: Datasource[];
  authConfigs: AuthConfig[];
  authIdentifiers: AuthIdentifier[];
  endpoints: Endpoint[];
  endpointVersions: EndpointVersion[];
  alertConfigs: AlertConfig[];
  onRefreshData: () => Promise<void>;
  onNavigateEndpoint: (epId: number) => void;
}) {
  // Auth Config state
  const [selectedAuthId, setSelectedAuthId] = useState<number | null>(null);
  const [keySearch, setKeySearch] = useState('');
  const [addKeyOpen, setAddKeyOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [customExpEnabled, setCustomExpEnabled] = useState(false);
  const [customExpMin, setCustomExpMin] = useState(60);
  const [usePlainSecret, setUsePlainSecret] = useState(false);
  const [genKey, setGenKey] = useState('');
  const [genSecret, setGenSecret] = useState('');
  const [genScopes, setGenScopes] = useState<string[]>(['Read All']);
  const [copiedField, setCopiedField] = useState<'key' | 'secret' | null>(null);
  const [newProviderOpen, setNewProviderOpen] = useState(false);
  const [newProviderName, setNewProviderName] = useState('');
  const [newProviderType, setNewProviderType] = useState<AuthProviderType>('Common Auth');

  // Data Config state
  const [engineFilter, setEngineFilter] = useState<DbEngine>('postgresql');
  const [dsSearch, setDsSearch] = useState('');
  const [selectedDsId, setSelectedDsId] = useState<number | null>(null);
  const [showConnDetail, setShowConnDetail] = useState(false);
  const [dsEndpointSearch, setDsEndpointSearch] = useState('');
  const [addDsOpen, setAddDsOpen] = useState(false);
  const [newDs, setNewDs] = useState({
    name: '',
    engine: 'postgresql' as DbEngine,
    host: '',
    port: 5432,
    databaseName: '',
    username: 'postgres',
    sslMode: 'require',
  });
  const [testConnResult, setTestConnResult] = useState<{ ok: boolean; text: string } | null>(null);

  // Alert state
  const [addAlertOpen, setAddAlertOpen] = useState(false);
  const [newAlert, setNewAlert] = useState({
    name: '',
    channel: 'Slack' as 'Email' | 'Slack' | 'Webhook',
    thresholdErrorRate: 5,
    thresholdLatencyMs: 500,
    target: '',
  });
  const [toast, setToast] = useState<string | null>(null);

  const notify = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const selectedAuth = authConfigs.find((a) => a.id === selectedAuthId) || null;
  const authKeys = useMemo(
    () =>
      selectedAuth
        ? authIdentifiers.filter(
            (i) =>
              i.authConfigId === selectedAuth.id &&
              (!keySearch ||
                i.name.toLowerCase().includes(keySearch.toLowerCase()) ||
                i.apiKey.toLowerCase().includes(keySearch.toLowerCase()))
          )
        : [],
    [selectedAuth, authIdentifiers, keySearch]
  );

  const selectedDs = datasources.find((d) => d.id === selectedDsId) || null;
  const filteredDatasources = useMemo(
    () =>
      datasources
        .filter((d) => d.engine === engineFilter)
        .filter((d) => !dsSearch || d.name.toLowerCase().includes(dsSearch.toLowerCase())),
    [datasources, engineFilter, dsSearch]
  );

  const generateKeyPair = () => {
    const randBytes = new Uint8Array(12);
    crypto.getRandomValues(randBytes);
    const k = btoa(String.fromCharCode(...randBytes)).slice(0, 16);
    const secBytes = new Uint8Array(24);
    crypto.getRandomValues(secBytes);
    const s = btoa(String.fromCharCode(...secBytes));
    setGenKey(k);
    setGenSecret(s);
  };

  const handleSaveNewKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAuth || !newKeyName.trim()) return;
    const finalKey = genKey || btoa(newKeyName.trim()).slice(0, 16);
    const finalSec = genSecret || btoa(newKeyName.trim() + Date.now()).slice(0, 28);
    await apiFetch('/api/auth-identifiers', {
      method: 'POST',
      body: JSON.stringify({
        authConfigId: selectedAuth.id,
        name: newKeyName.trim(),
        apiKey: finalKey,
        secretRaw: finalSec,
        usePlainSecret,
        customExpiredMinutes: customExpEnabled ? customExpMin : null,
        scopes: genScopes,
      }),
    });
    await onRefreshData();
    setAddKeyOpen(false);
    setNewKeyName('');
    setGenKey('');
    setGenSecret('');
    notify('Auth Identifier created');
  };

  // =========================================================================
  // AUTH CONFIGURATION (Ref: Image 10)
  // =========================================================================
  if (page === 'auth_configuration') {
    return (
      <div className="p-4 lg:p-5 space-y-4">
        {toast && (
          <div className="fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded bg-[#2B3445] text-white text-xs font-medium shadow-lg flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#7EB09D]" />
            <span>{toast}</span>
          </div>
        )}

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">Auth Configuration</h1>
              <p className="text-xs text-slate-500">
                Auth providers bind at the Collection level so all endpoints under a Collection share authentication.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setNewProviderOpen(true)}
              className="px-3.5 py-2 rounded border border-[#5C6FA8] text-[#4A5B8C] dark:text-[#A5B7EB] hover:bg-[#EEF1F9] dark:hover:bg-indigo-950/30 text-xs font-semibold flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Auth Provider</span>
            </button>
          </div>

          <div className="border border-slate-200 dark:border-slate-800 rounded overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="text-left px-4 py-2.5 w-14">No</th>
                  <th className="text-left px-4 py-2.5">Auth Configuration Name</th>
                  <th className="text-left px-4 py-2.5">Provider</th>
                  <th className="text-left px-4 py-2.5">Headers</th>
                  <th className="text-right px-4 py-2.5">Keys</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {authConfigs.map((ac, idx) => (
                  <tr
                    key={ac.id}
                    onClick={() => setSelectedAuthId(ac.id)}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer"
                  >
                    <td className="px-4 py-3 font-mono text-slate-500">{idx + 1}</td>
                    <td className="px-4 py-3 font-medium text-[#4A5B8C] dark:text-[#A5B7EB]">{ac.name}</td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{ac.providerType}</td>
                    <td className="px-4 py-3 font-mono text-slate-500">
                      {ac.headerKeyName}
                      {ac.headerSecretName ? ` / ${ac.headerSecretName}` : ''}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      {authIdentifiers.filter((i) => i.authConfigId === ac.id).length}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Auth Configuration Detail Slide-Over Drawer (Image 10) */}
        {selectedAuth && (
          <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/40 backdrop-blur-[1px]">
            <div className="w-full max-w-4xl bg-white dark:bg-slate-900 h-full shadow-2xl border-l border-slate-200 dark:border-slate-800 flex flex-col">
              <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Auth Configuration Detail
                </h2>
                <button
                  type="button"
                  onClick={() => setSelectedAuthId(null)}
                  className="px-3 py-1 rounded border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 flex items-center gap-1"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Close</span>
                </button>
              </div>

              <div className="px-6 border-b border-slate-200 dark:border-slate-800 flex items-center gap-6">
                <span className="py-3 text-xs font-semibold border-b-2 border-[#5C6FA8] text-slate-900 dark:text-slate-100">
                  {selectedAuth.providerType} — {selectedAuth.name}
                </span>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="relative w-72">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={keySearch}
                      onChange={(e) => setKeySearch(e.target.value)}
                      placeholder="Search key or name"
                      className="w-full pl-8 pr-3 py-1.5 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      generateKeyPair();
                      setAddKeyOpen(true);
                    }}
                    className="px-3.5 py-1.5 rounded border border-[#5C6FA8] text-[#4A5B8C] dark:text-[#A5B7EB] hover:bg-[#EEF1F9] dark:hover:bg-indigo-950/30 text-xs font-semibold flex items-center gap-1.5"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>Add Key</span>
                  </button>
                </div>

                <div className="border border-slate-200 dark:border-slate-800 rounded overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="text-left px-4 py-2.5">Key</th>
                        <th className="text-left px-4 py-2.5">Scopes</th>
                        <th className="text-left px-4 py-2.5">Expired On</th>
                        <th className="text-right px-4 py-2.5">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {authKeys.map((k) => (
                        <tr key={k.id}>
                          <td className="px-4 py-3">
                            <div className="font-semibold text-slate-800 dark:text-slate-100">{k.name}</div>
                            <div className="font-mono text-[11px] text-slate-500">{k.apiKey}</div>
                          </td>
                          <td className="px-4 py-3 text-[11px] text-slate-600 dark:text-slate-300">
                            {k.scopes.join(', ')}
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#EEF1F9] dark:bg-indigo-950/40 text-[#4A5B8C] dark:text-[#A5B7EB] text-[11px] font-medium">
                              <KeyRound className="w-3 h-3" />
                              <span>
                                {k.customExpiredMinutes ? `${k.customExpiredMinutes} min` : 'Lifetime Token'}
                              </span>
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                title="Delete Key"
                                onClick={async () => {
                                  await apiFetch(`/api/auth-identifiers/${k.id}`, { method: 'DELETE' });
                                  await onRefreshData();
                                  notify(`Deleted key ${k.name}`);
                                }}
                                className="p-1.5 rounded bg-[#C46A72] text-white hover:bg-[#AD575F]"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                title={k.locked ? 'Unlock Key' : 'Lock Key'}
                                onClick={async () => {
                                  await apiFetch(`/api/auth-identifiers/${k.id}`, {
                                    method: 'PATCH',
                                    body: JSON.stringify({ locked: !k.locked }),
                                  });
                                  await onRefreshData();
                                  notify(k.locked ? 'Key unlocked' : 'Key locked');
                                }}
                                className="p-1.5 rounded bg-[#D07A82] text-white hover:bg-[#B8656D]"
                              >
                                {k.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                              </button>
                              <button
                                type="button"
                                title="Rotate Key"
                                onClick={async () => {
                                  const nextKey = btoa(`${k.name}-${Date.now()}`).slice(0, 18);
                                  await apiFetch(`/api/auth-identifiers/${k.id}`, {
                                    method: 'PATCH',
                                    body: JSON.stringify({ apiKey: nextKey }),
                                  });
                                  await onRefreshData();
                                  notify(`Rotated key for ${k.name}`);
                                }}
                                className="p-1.5 rounded bg-[#558B78] text-white hover:bg-[#467665]"
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                title="Toggle Read All Scope"
                                onClick={() => notify(`Active scopes: ${k.scopes.join(', ')}`)}
                                className="p-1.5 rounded bg-[#6883B8] text-white hover:bg-[#556FA3]"
                              >
                                <Bell className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="text-[11px] text-slate-500">
                  1 to {authKeys.length} of {authKeys.length} items
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Add Key Modal (Ref: Image 10 Center Modal) */}
        {addKeyOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
            <form
              onSubmit={handleSaveNewKey}
              className="w-full max-w-md rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-5 space-y-4 shadow-2xl"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Add Auth Key</h3>
                <button type="button" onClick={() => setAddKeyOpen(false)}>
                  <X className="w-4 h-4 text-slate-400" />
                </button>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Name</label>
                <input
                  type="text"
                  required
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="e.g., Demo_Partner_Key"
                  className="w-full px-3 py-2 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>

              <div>
                <div className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Default Expired In (minute)?
                </div>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#EEF1F9] dark:bg-indigo-950/40 text-[#4A5B8C] dark:text-[#A5B7EB] text-[11px] font-medium">
                  <KeyRound className="w-3 h-3" />
                  <span>Lifetime Token</span>
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Custom Expired In (minute)?
                </span>
                <ToggleSwitch checked={customExpEnabled} onChange={setCustomExpEnabled} />
              </div>

              {customExpEnabled && (
                <input
                  type="number"
                  value={customExpMin}
                  onChange={(e) => setCustomExpMin(Number(e.target.value) || 60)}
                  className="w-full px-3 py-1.5 text-xs font-mono rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              )}

              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Use Plain Secret ?</span>
                <ToggleSwitch checked={usePlainSecret} onChange={setUsePlainSecret} />
              </div>

              <button
                type="button"
                onClick={generateKeyPair}
                className="px-3 py-1.5 rounded border border-[#5C6FA8] text-[#4A5B8C] dark:text-[#A5B7EB] text-xs font-semibold hover:bg-[#EEF1F9] dark:hover:bg-indigo-950/30 flex items-center gap-1.5"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>Generate Key</span>
              </button>

              <div>
                <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Key</label>
                <div className="flex items-center border border-slate-300 dark:border-slate-700 rounded px-3 py-1.5 bg-slate-50 dark:bg-slate-800">
                  <input
                    type="text"
                    value={genKey}
                    onChange={(e) => setGenKey(e.target.value)}
                    className="flex-1 text-xs font-mono bg-transparent focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(genKey);
                      setCopiedField('key');
                      setTimeout(() => setCopiedField(null), 1500);
                    }}
                    className="text-[#5C6FA8] dark:text-[#A5B7EB]"
                  >
                    {copiedField === 'key' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Secret</label>
                <div className="flex items-center border border-slate-300 dark:border-slate-700 rounded px-3 py-1.5 bg-slate-50 dark:bg-slate-800">
                  <input
                    type="text"
                    value={genSecret}
                    onChange={(e) => setGenSecret(e.target.value)}
                    className="flex-1 text-xs font-mono bg-transparent focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(genSecret);
                      setCopiedField('secret');
                      setTimeout(() => setCopiedField(null), 1500);
                    }}
                    className="text-[#5C6FA8] dark:text-[#A5B7EB]"
                  >
                    {copiedField === 'secret' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  API Scope
                </label>
                <div className="border border-slate-300 dark:border-slate-700 rounded p-2 space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {genScopes.map((s) => (
                      <span
                        key={s}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-xs"
                      >
                        <span>{s}</span>
                        <button
                          type="button"
                          onClick={() => setGenScopes(genScopes.filter((x) => x !== s))}
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
                      if (e.target.value && !genScopes.includes(e.target.value)) {
                        setGenScopes([...genScopes, e.target.value]);
                      }
                    }}
                    className="w-full text-xs text-slate-500 bg-transparent focus:outline-none"
                  >
                    <option value="">Select Scope...</option>
                    {SCOPES.filter((s) => !genScopes.includes(s)).map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAddKeyOpen(false)}
                  className="px-3.5 py-1.5 text-xs rounded border border-slate-300 dark:border-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-semibold rounded bg-[#5C6FA8] hover:bg-[#4B5D93] text-white"
                >
                  Save Key
                </button>
              </div>
            </form>
          </div>
        )}

        {/* New Auth Provider Modal */}
        {newProviderOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await apiFetch('/api/auth-configs', {
                  method: 'POST',
                  body: JSON.stringify({
                    workspaceId,
                    name: newProviderName,
                    providerType: newProviderType,
                    headerKeyName:
                      newProviderType === 'Bearer JWT' || newProviderType === 'OAuth2 / OIDC'
                        ? 'Authorization'
                        : 'X-CommonAuth-Key',
                    headerSecretName:
                      newProviderType === 'Bearer JWT' || newProviderType === 'OAuth2 / OIDC'
                        ? ''
                        : 'X-CommonAuth-Secret',
                  }),
                });
                await onRefreshData();
                setNewProviderOpen(false);
                setNewProviderName('');
                notify('Auth Provider created');
              }}
              className="w-full max-w-md rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-5 space-y-4 shadow-xl"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold">Add Auth Provider</h3>
                <button type="button" onClick={() => setNewProviderOpen(false)}>
                  <X className="w-4 h-4 text-slate-400" />
                </button>
              </div>
              <div>
                <label className="block text-xs mb-1">Provider Name</label>
                <input
                  type="text"
                  required
                  value={newProviderName}
                  onChange={(e) => setNewProviderName(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="block text-xs mb-1">Provider Type</label>
                <select
                  value={newProviderType}
                  onChange={(e) => setNewProviderType(e.target.value as AuthProviderType)}
                  className="w-full px-3 py-2 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                >
                  <option value="Common Auth">Common Auth</option>
                  <option value="JV CAS">JV CAS</option>
                  <option value="Bearer JWT">Bearer JWT</option>
                  <option value="OAuth2 / OIDC">OAuth2 / OIDC</option>
                  <option value="Basic Auth">Basic Auth</option>
                  <option value="Custom Header">Custom Header</option>
                </select>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setNewProviderOpen(false)}
                  className="px-3 py-1.5 text-xs rounded border border-slate-300 dark:border-slate-700"
                >
                  Cancel
                </button>
                <button type="submit" className="px-4 py-1.5 text-xs font-semibold rounded bg-[#5C6FA8] hover:bg-[#4B5D93] text-white">
                  Save
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // DATA CONFIGURATION (Ref: Image 11)
  // =========================================================================
  if (page === 'data_configuration') {
    const linkedEndpoints = selectedDs
      ? endpoints
          .filter((ep) => ep.datasourceId === selectedDs.id)
          .filter((ep) => !dsEndpointSearch || ep.name.toLowerCase().includes(dsEndpointSearch.toLowerCase()))
      : [];

    return (
      <div className="p-4 lg:p-5 space-y-4">
        {toast && (
          <div className="fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded bg-[#2B3445] text-white text-xs font-medium shadow-lg flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#7EB09D]" />
            <span>{toast}</span>
          </div>
        )}

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md p-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Data Configuration</h1>
            <button
              type="button"
              onClick={() => setAddDsOpen(true)}
              className="px-3.5 py-2 rounded bg-[#5C6FA8] text-white text-xs font-semibold hover:bg-[#4B5D93] flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Database Connection</span>
            </button>
          </div>

          {/* Engine Selector Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl">
            {(
              [
                { id: 'mysql' as DbEngine, label: 'Runtime DB API MySQL' },
                { id: 'postgresql' as DbEngine, label: 'Runtime DB API Postgre SQL' },
                { id: 'mssql' as DbEngine, label: 'Runtime DB API SQL Server' },
              ] as const
            ).map((eng) => {
              const active = engineFilter === eng.id;
              return (
                <button
                  key={eng.id}
                  type="button"
                  onClick={() => setEngineFilter(eng.id)}
                  className={`p-4 rounded-md border-2 flex flex-col items-center justify-center gap-2 transition-colors ${
                    active
                      ? 'border-[#5C6FA8] bg-[#EEF1F9]/60 dark:bg-indigo-950/30'
                      : 'border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40 hover:border-slate-300'
                  }`}
                >
                  <Database className="w-6 h-6 text-[#6883B8] dark:text-sky-300" />
                  <span className="text-xs font-semibold text-[#4A5B8C] dark:text-[#A5B7EB] text-center">{eng.label}</span>
                </button>
              );
            })}
          </div>

          {/* Search & Table */}
          <div className="space-y-3">
            <div className="relative max-w-md">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={dsSearch}
                onChange={(e) => setDsSearch(e.target.value)}
                placeholder="Search database connection"
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>

            <div className="border border-slate-200 dark:border-slate-800 rounded overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="text-left px-4 py-2.5 w-14">No</th>
                    <th className="text-left px-4 py-2.5">Database Connection</th>
                    <th className="text-left px-4 py-2.5">Host</th>
                    <th className="text-left px-4 py-2.5">Database</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredDatasources.map((ds, idx) => (
                    <tr
                      key={ds.id}
                      onClick={() => {
                        setSelectedDsId(ds.id);
                        setTestConnResult(null);
                      }}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer"
                    >
                      <td className="px-4 py-3 font-mono text-slate-500">{idx + 1}</td>
                      <td className="px-4 py-3 font-medium text-[#4A5B8C] dark:text-[#A5B7EB]">{ds.name}</td>
                      <td className="px-4 py-3 font-mono text-slate-500">{ds.host}</td>
                      <td className="px-4 py-3 font-mono text-slate-500">{ds.databaseName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Data Configuration Detail Slide-Over Drawer (Image 11) */}
        {selectedDs && (
          <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/40 backdrop-blur-[1px]">
            <div className="w-full max-w-xl bg-white dark:bg-slate-900 h-full shadow-2xl border-l border-slate-200 dark:border-slate-800 flex flex-col">
              <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Data Configuration Detail
                </h2>
                <button
                  type="button"
                  onClick={() => setSelectedDsId(null)}
                  className="px-3 py-1 rounded border border-slate-300 dark:border-slate-700 text-xs font-medium flex items-center gap-1"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Close</span>
                </button>
              </div>

              <div className="px-6 border-b border-slate-200 dark:border-slate-800 flex items-center">
                <span className="py-3 text-xs font-semibold border-b-2 border-[#5C6FA8]">
                  Runtime DB API - <EngineBadge engine={selectedDs.engine} />
                </span>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
                <div className="grid grid-cols-12 gap-4 items-center">
                  <div className="col-span-8">
                    <label className="block text-slate-600 dark:text-slate-400 mb-1">Owner Team</label>
                    <select
                      value={selectedDs.teamId || ''}
                      onChange={async (e) => {
                        await apiFetch(`/api/datasources/${selectedDs.id}`, {
                          method: 'PATCH',
                          body: JSON.stringify({ teamId: e.target.value ? Number(e.target.value) : null }),
                        });
                        await onRefreshData();
                      }}
                      className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                    >
                      <option value="">Select an item</option>
                      {teams.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-4 space-y-1">
                    <div className="text-slate-600 dark:text-slate-400">Active</div>
                    <ToggleSwitch
                      checked={selectedDs.active}
                      onChange={async (v) => {
                        await apiFetch(`/api/datasources/${selectedDs.id}`, {
                          method: 'PATCH',
                          body: JSON.stringify({ active: v }),
                        });
                        await onRefreshData();
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-600 dark:text-slate-400 mb-1">Database Connection</label>
                  <select
                    value={selectedDs.id}
                    onChange={(e) => setSelectedDsId(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-medium"
                  >
                    {datasources.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="p-3.5 rounded bg-[#EEF2FA] dark:bg-indigo-950/40 border border-[#D4DDF0] dark:border-indigo-800/60 text-[#3B4E7A] dark:text-indigo-200 flex items-start gap-2.5">
                  <Info className="w-4 h-4 shrink-0 mt-0.5 text-[#5C6FA8] dark:text-[#9BAEE5]" />
                  <div>
                    <strong>Can't find your database connection?</strong>
                    <div className="opacity-90 mt-0.5">
                      Add a new connection in Data Configuration or test TLS pool connectivity below.
                    </div>
                  </div>
                </div>

                <div>
                  <button
                    type="button"
                    onClick={() => setShowConnDetail((v) => !v)}
                    className="text-[#4A5B8C] dark:text-[#A5B7EB] font-semibold flex items-center gap-1"
                  >
                    <span>Show Connection</span>
                    {showConnDetail ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  </button>
                  {showConnDetail && (
                    <div className="mt-2 p-3 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono space-y-1.5">
                      <div>Host: {selectedDs.host}:{selectedDs.port}</div>
                      <div>Database: {selectedDs.databaseName}</div>
                      <div>User: {selectedDs.username} · SSL: {selectedDs.sslMode}</div>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const r = await apiFetch<{ ok: boolean; message: string; latencyMs: number }>(
                              `/api/datasources/${selectedDs.id}/test`,
                              { method: 'POST' }
                            );
                            setTestConnResult({
                              ok: r.ok,
                              text: r.ok ? `${r.message} (${r.latencyMs}ms)` : r.message,
                            });
                          } catch (err) {
                            setTestConnResult({
                              ok: false,
                              text: err instanceof Error ? err.message : 'Connection test failed',
                            });
                          }
                        }}
                        className="mt-1 px-3 py-1 rounded bg-[#6883B8] hover:bg-[#556FA3] text-white font-sans text-[11px] font-semibold"
                      >
                        Test Connection
                      </button>
                      {testConnResult && (
                        <div
                          className={`font-sans pt-1 ${
                            testConnResult.ok
                              ? 'text-[#4B826E] dark:text-emerald-300'
                              : 'text-[#B35C68] dark:text-rose-300'
                          }`}
                        >
                          {testConnResult.text}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-start gap-2.5 text-slate-500 pt-1">
                  <span className="w-5 h-5 rounded-full bg-[#5C6FA8] text-white flex items-center justify-center text-[10px] shrink-0">
                    C
                  </span>
                  <div>
                    <div>
                      create on {formatDisplayDate(selectedDs.createdAt)} ({formatRelativeTime(selectedDs.createdAt)})
                    </div>
                    <div className="text-slate-700 dark:text-slate-300">by {selectedDs.createdBy}</div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => notify('Datasource settings saved')}
                    className="px-4 py-2 rounded bg-[#558B78] hover:bg-[#467665] text-white font-semibold flex items-center gap-1.5"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Save</span>
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await apiFetch(`/api/datasources/${selectedDs.id}`, { method: 'DELETE' });
                      setSelectedDsId(null);
                      await onRefreshData();
                      notify('Datasource deleted');
                    }}
                    className="px-4 py-2 rounded bg-[#C46A72] hover:bg-[#AD575F] text-white font-semibold flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                </div>

                <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
                  <div className="font-semibold text-slate-800 dark:text-slate-100">
                    Endpoint using above configuration :
                  </div>
                  <input
                    type="text"
                    value={dsEndpointSearch}
                    onChange={(e) => setDsEndpointSearch(e.target.value)}
                    placeholder="Search"
                    className="w-full px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded">
                    {linkedEndpoints.map((ep) => {
                      const v = endpointVersions.find((x) => x.endpointId === ep.id);
                      return (
                        <button
                          key={ep.id}
                          type="button"
                          onClick={() => {
                            setSelectedDsId(null);
                            onNavigateEndpoint(ep.id);
                          }}
                          className="w-full px-3 py-2.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800 text-left"
                        >
                          <div className="flex items-center gap-2.5">
                            {v && <MethodBadge method={v.method} size="xs" />}
                            <span className="font-medium text-slate-800 dark:text-slate-100">{ep.name}</span>
                          </div>
                          <ExternalLink className="w-3.5 h-3.5 text-[#5C6FA8] dark:text-[#9BAEE5]" />
                        </button>
                      );
                    })}
                    {linkedEndpoints.length === 0 && (
                      <div className="p-3 text-center text-slate-400">No endpoints bound yet</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Add Datasource Modal */}
        {addDsOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await apiFetch('/api/datasources', {
                  method: 'POST',
                  body: JSON.stringify({ ...newDs, workspaceId }),
                });
                await onRefreshData();
                setEngineFilter(newDs.engine);
                setAddDsOpen(false);
                notify('Database connection added');
              }}
              className="w-full max-w-md rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-5 space-y-3 shadow-xl text-xs"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold">New Database Connection</h3>
                <button type="button" onClick={() => setAddDsOpen(false)}>
                  <X className="w-4 h-4 text-slate-400" />
                </button>
              </div>
              <div>
                <label className="block mb-1">Connection Name</label>
                <input
                  type="text"
                  required
                  value={newDs.name}
                  onChange={(e) => setNewDs({ ...newDs, name: e.target.value })}
                  placeholder="e.g., Supabase Production DB"
                  className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block mb-1">Engine</label>
                  <select
                    value={newDs.engine}
                    onChange={(e) => setNewDs({ ...newDs, engine: e.target.value as DbEngine })}
                    className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                  >
                    <option value="postgresql">PostgreSQL</option>
                    <option value="mysql">MySQL</option>
                    <option value="mssql">SQL Server</option>
                  </select>
                </div>
                <div>
                  <label className="block mb-1">Port</label>
                  <input
                    type="number"
                    value={newDs.port}
                    onChange={(e) => setNewDs({ ...newDs, port: Number(e.target.value) || 5432 })}
                    className="w-full px-3 py-2 font-mono rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
              </div>
              <div>
                <label className="block mb-1">Host</label>
                <input
                  type="text"
                  required
                  value={newDs.host}
                  onChange={(e) => setNewDs({ ...newDs, host: e.target.value })}
                  placeholder="aws-1-ap-south-1.pooler.supabase.com"
                  className="w-full px-3 py-2 font-mono rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block mb-1">Database Name</label>
                  <input
                    type="text"
                    required
                    value={newDs.databaseName}
                    onChange={(e) => setNewDs({ ...newDs, databaseName: e.target.value })}
                    placeholder="postgres"
                    className="w-full px-3 py-2 font-mono rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="block mb-1">Username</label>
                  <input
                    type="text"
                    required
                    value={newDs.username}
                    onChange={(e) => setNewDs({ ...newDs, username: e.target.value })}
                    className="w-full px-3 py-2 font-mono rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAddDsOpen(false)}
                  className="px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700"
                >
                  Cancel
                </button>
                <button type="submit" className="px-4 py-1.5 font-semibold rounded bg-[#5C6FA8] hover:bg-[#4B5D93] text-white">
                  Save Connection
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    );
  }

  // ALERT CONFIGURATION
  return (
    <div className="p-4 lg:p-5 space-y-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">Alert Configuration</h1>
            <p className="text-xs text-slate-500">Automated threshold alerting for error spikes & latency SLA breaches</p>
          </div>
          <button
            type="button"
            onClick={() => setAddAlertOpen(true)}
            className="px-3.5 py-2 rounded bg-[#5C6FA8] hover:bg-[#4B5D93] text-white text-xs font-semibold flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Alert Rule</span>
          </button>
        </div>
        <div className="border border-slate-200 dark:border-slate-800 rounded overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              <tr>
                <th className="text-left px-4 py-2.5">Rule Name</th>
                <th className="text-left px-4 py-2.5">Channel</th>
                <th className="text-left px-4 py-2.5">Target</th>
                <th className="text-right px-4 py-2.5">Error %</th>
                <th className="text-right px-4 py-2.5">Latency (ms)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {alertConfigs.map((al) => (
                <tr key={al.id}>
                  <td className="px-4 py-2.5 font-medium text-[#4A5B8C] dark:text-[#A5B7EB]">{al.name}</td>
                  <td className="px-4 py-2.5">{al.channel}</td>
                  <td className="px-4 py-2.5 font-mono text-slate-500">{al.target}</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">&gt; {al.thresholdErrorRate}%</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">&gt; {al.thresholdLatencyMs} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {addAlertOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await apiFetch('/api/alerts', {
                method: 'POST',
                body: JSON.stringify({ ...newAlert, workspaceId }),
              });
              await onRefreshData();
              setAddAlertOpen(false);
            }}
            className="w-full max-w-md rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-5 space-y-3 text-xs"
          >
            <h3 className="text-sm font-bold">New Alert Rule</h3>
            <input
              type="text"
              required
              placeholder="Rule name"
              value={newAlert.name}
              onChange={(e) => setNewAlert({ ...newAlert, name: e.target.value })}
              className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
            />
            <input
              type="text"
              required
              placeholder="Target (#channel or email)"
              value={newAlert.target}
              onChange={(e) => setNewAlert({ ...newAlert, target: e.target.value })}
              className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAddAlertOpen(false)}
                className="px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700"
              >
                Cancel
              </button>
              <button type="submit" className="px-4 py-1.5 rounded bg-[#5C6FA8] hover:bg-[#4B5D93] text-white font-semibold">
                Save Rule
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
