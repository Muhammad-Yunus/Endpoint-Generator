import React, { useState } from 'react';
import {
  X,
  ExternalLink,
  Play,
  FileCheck,
  ShieldCheck,
  Zap,
  Database,
  Layers,
  ListOrdered,
  AlertTriangle,
  Globe,
  Cpu,
  Puzzle,
  Lock,
} from 'lucide-react';
import { EngineBadge } from './ui/MethodBadge';
import { formatDisplayDate } from '../lib/api';
import type { ProfilerStep, RequestLog } from '../types/domain';

export function LogProfilerDrawer({
  log,
  onClose,
  onNavigateEndpoint,
  onNavigateConfig,
}: {
  log: RequestLog | null;
  onClose: () => void;
  onNavigateEndpoint: (endpointId: number) => void;
  onNavigateConfig: (page: 'auth_configuration' | 'data_configuration') => void;
}) {
  const [tab, setTab] = useState<'request' | 'profiler' | 'error'>('request');
  const [profilerSubTab, setProfilerSubTab] = useState<'rest' | 'service' | 'extension'>('rest');
  const [showProfilingDetail, setShowProfilingDetail] = useState(true);

  if (!log) return null;

  const stepIcon = (type: ProfilerStep['iconType']) => {
    switch (type) {
      case 'start':
        return <Play className="w-3.5 h-3.5 text-[#4B826E] dark:text-emerald-300" />;
      case 'validate':
        return <FileCheck className="w-3.5 h-3.5 text-[#476B9E] dark:text-sky-300" />;
      case 'auth':
        return <ShieldCheck className="w-3.5 h-3.5 text-[#5C6FA8] dark:text-[#9BAEE5]" />;
      case 'ratelimit':
      case 'circuit':
        return <Zap className="w-3.5 h-3.5 text-[#9A7437] dark:text-amber-300" />;
      case 'cache':
        return <Layers className="w-3.5 h-3.5 text-[#45728A] dark:text-teal-300" />;
      case 'build':
        return <Database className="w-3.5 h-3.5 text-[#6883B8] dark:text-sky-300" />;
      case 'execute':
        return <Database className="w-3.5 h-3.5 text-[#5C6FA8] dark:text-[#A5B7EB]" />;
      case 'pagination':
        return <ListOrdered className="w-3.5 h-3.5 text-[#7A5B8E] dark:text-violet-300" />;
      case 'error':
        return <AlertTriangle className="w-3.5 h-3.5 text-[#B35C68] dark:text-rose-300" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-[1px]">
      <div className="w-full max-w-2xl bg-white dark:bg-slate-900 h-full shadow-2xl border-l border-slate-200 dark:border-slate-800 flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Log Detail</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Main Tabs */}
        <div className="px-6 border-b border-slate-200 dark:border-slate-800 flex items-center gap-6">
          {(
            [
              { id: 'request', label: 'Request Log' },
              { id: 'profiler', label: 'Profiler' },
              { id: 'error', label: 'Error Log' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`py-3 text-xs font-semibold border-b-2 transition-colors ${
                tab === t.id
                  ? 'border-[#5C6FA8] text-slate-900 dark:text-slate-100'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {tab === 'request' && (
            <div className="space-y-3 text-xs">
              {[
                { label: 'Duration', value: `${log.durationMs} ms` },
                { label: 'Instant', value: formatDisplayDate(log.createdAt) },
                { label: 'Request Key', value: log.requestKey, jump: () => navigator.clipboard.writeText(log.requestKey) },
                { label: 'Method', value: log.method },
                {
                  label: 'Collection',
                  id: String(log.collectionId),
                  value: log.collectionName,
                  jump: () => {
                    onNavigateEndpoint(log.endpointId);
                    onClose();
                  },
                },
                {
                  label: 'Endpoint',
                  id: String(log.endpointId),
                  value: log.endpointName,
                  jump: () => {
                    onNavigateEndpoint(log.endpointId);
                    onClose();
                  },
                },
                { label: 'Endpoint Version', id: String(log.endpointVersionId), value: log.versionLabel },
                {
                  label: 'Data Source',
                  value: log.datasourceName,
                  engine: log.datasourceEngine,
                  jump: () => {
                    onNavigateConfig('data_configuration');
                    onClose();
                  },
                },
                {
                  label: 'Auth Source',
                  value: log.authSourceLabel,
                  jump: () => {
                    onNavigateConfig('auth_configuration');
                    onClose();
                  },
                },
                { label: 'Path', value: log.path },
                { label: 'Key/User/Email', value: log.authIdentifierLabel },
              ].map((row) => (
                <div key={row.label} className="grid grid-cols-12 items-center gap-3">
                  <div className="col-span-4 text-slate-500 dark:text-slate-400 font-medium">{row.label}</div>
                  <div className="col-span-8 flex items-center gap-2">
                    {row.id && (
                      <div className="w-16 px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-slate-700 dark:text-slate-200 tabular-nums">
                        {row.id}
                      </div>
                    )}
                    <div className="flex-1 px-3 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-mono truncate flex items-center gap-2">
                      {row.engine && <EngineBadge engine={row.engine} />}
                      <span className="truncate">{row.value}</span>
                    </div>
                    {row.jump && (
                      <button
                        type="button"
                        onClick={row.jump}
                        className="p-2 rounded bg-[#6883B8] text-white hover:bg-[#556FA3] shrink-0"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}

              <div className="pt-4 space-y-3">
                <div>
                  <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Request Payload
                  </div>
                  <pre className="p-3 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-[11px] overflow-x-auto">
                    {JSON.stringify(log.requestBody ?? {}, null, 2)}
                  </pre>
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Response Payload ({log.statusMessage})
                  </div>
                  <pre className="p-3 rounded bg-[#1F2735] text-[#A6D8C2] font-mono text-[11px] overflow-x-auto max-h-60">
                    {JSON.stringify(log.responseBody ?? {}, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          )}

          {tab === 'profiler' && (
            <div className="space-y-4">
              {/* Sub-tabs: REST API | Service | Extension */}
              <div className="flex items-center gap-5 border-b border-slate-200 dark:border-slate-800">
                {[
                  { id: 'rest' as const, label: 'REST API', icon: Globe },
                  { id: 'service' as const, label: 'Service', icon: Cpu },
                  { id: 'extension' as const, label: 'Extension', icon: Puzzle },
                ].map((s) => {
                  const Icon = s.icon;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setProfilerSubTab(s.id)}
                      className={`pb-2.5 text-xs font-medium flex items-center gap-1.5 border-b-2 transition-colors ${
                        profilerSubTab === s.id
                          ? 'border-[#5C6FA8] text-slate-900 dark:text-slate-100 font-semibold'
                          : 'border-transparent text-slate-500'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{s.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-4 gap-2 text-[11px] font-semibold text-slate-500 border-b border-slate-100 dark:border-slate-800 pb-2">
                <span>Instant</span>
                <span>Duration (ms)</span>
                <span>Action</span>
                <span>Espace</span>
              </div>

              <div className="flex justify-center py-2 border-b border-[#C6D0EB] dark:border-indigo-800/60">
                <button
                  type="button"
                  onClick={() => setShowProfilingDetail((v) => !v)}
                  className="px-4 py-1.5 rounded border border-[#5C6FA8] text-[#4A5B8C] dark:text-[#A5B7EB] text-xs font-semibold hover:bg-[#EEF1F9] dark:hover:bg-indigo-950/30 flex items-center gap-1.5"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Get REST API Profiling</span>
                </button>
              </div>

              {showProfilingDetail && (
                <div className="relative pl-4 space-y-5 pt-2">
                  <div className="absolute left-[23px] top-4 bottom-4 w-px bg-slate-200 dark:bg-slate-700" />
                  {log.profilerSteps
                    .filter((st) =>
                      profilerSubTab === 'service'
                        ? st.espace.includes('Resilience') || st.espace.includes('Executor')
                        : profilerSubTab === 'extension'
                        ? st.espace.includes('PostgreSQL') || st.espace.includes('Cache')
                        : true
                    )
                    .map((step, i) => (
                      <div key={i} className="relative flex items-center justify-between gap-4 pl-6">
                        <div className="absolute left-0 w-6 h-6 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center shadow-2xs">
                          {stepIcon(step.iconType)}
                        </div>
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-xs font-medium text-slate-800 dark:text-slate-100">
                            {step.stage}
                          </span>
                          <span className="text-xs font-mono text-slate-500 tabular-nums">
                            {step.durationMs} ms
                          </span>
                        </div>
                        <span className="text-[11px] font-mono text-slate-400 shrink-0">
                          +{step.instantOffsetMs}ms · {step.espace}
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}

          {tab === 'error' && (
            <div className="space-y-4">
              {log.errorStack ? (
                <div className="p-4 rounded bg-[#F7E6E8] dark:bg-rose-950/30 border border-[#EBC9CE] dark:border-rose-800 space-y-2">
                  <div className="text-xs font-semibold text-[#9E4754] dark:text-rose-300">
                    {log.statusMessage}
                  </div>
                  <pre className="text-xs font-mono text-[#7F3943] dark:text-rose-200 whitespace-pre-wrap">
                    {log.errorStack}
                  </pre>
                </div>
              ) : (
                <div className="p-8 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded text-xs text-slate-400">
                  No errors recorded for this request ({log.statusMessage}).
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
