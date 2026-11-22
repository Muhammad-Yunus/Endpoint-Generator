import React, { useRef, useState } from 'react';
import {
  Briefcase,
  Users,
  UserCheck,
  FolderKanban,
  PlugZap,
  GitBranch,
  Database,
  ShieldCheck,
  KeyRound,
  ArrowLeftRight,
  AlertCircle,
  ExternalLink,
  Share2,
  XCircle,
  Calendar,
  ArrowLeft,
  Filter,
} from 'lucide-react';
import type { DashboardAnalytics } from '../types/domain';

export interface DashboardDrilldownFilter {
  type: 'authKey' | 'endpoint';
  label: string;
  value: string;
}

export interface DashboardFilterChange {
  range: 'today' | '1w' | 'custom';
  startDate: string;
  endDate: string;
  drilldown: DashboardDrilldownFilter | null;
}

function toIsoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function Dashboard({
  analytics,
  range,
  startDate,
  endDate,
  drilldownFilter,
  onFilterChange,
  onBarClick,
  onNavigate,
}: {
  analytics: DashboardAnalytics | null;
  range: 'today' | '1w' | 'custom';
  startDate: string;
  endDate: string;
  drilldownFilter: DashboardDrilldownFilter | null;
  onFilterChange: (next: DashboardFilterChange) => void;
  onBarClick: (bar: { rangeStart: string; rangeEnd: string; label: string }) => void;
  onNavigate: (page: string) => void;
}) {
  const [metricMode, setMetricMode] = useState<'request' | 'latency'>('request');
  const [hoveredBar, setHoveredBar] = useState<number | null>(null);
  const chartSectionRef = useRef<HTMLDivElement | null>(null);

  if (!analytics) {
    return (
      <div className="p-4 lg:p-5 space-y-4 animate-pulse">
        <div className="h-20 bg-white dark:bg-slate-900 rounded-md border border-slate-200 dark:border-slate-800" />
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          <div className="xl:col-span-4 h-80 bg-white dark:bg-slate-900 rounded-md border border-slate-200 dark:border-slate-800" />
          <div className="xl:col-span-8 h-80 bg-white dark:bg-slate-900 rounded-md border border-slate-200 dark:border-slate-800" />
        </div>
      </div>
    );
  }

  const kpiCards = [
    { label: 'Workspaces', value: analytics.kpis.workspaces, icon: Briefcase, bg: 'bg-[#E4ECF7] text-[#476B9E] dark:bg-sky-950/60 dark:text-sky-300', page: 'workspaces' },
    { label: 'Teams', value: analytics.kpis.teams, icon: Users, bg: 'bg-[#F7E8EA] text-[#A85A66] dark:bg-rose-950/50 dark:text-rose-300', page: 'teams' },
    { label: 'Developers', value: analytics.kpis.developers, icon: UserCheck, bg: 'bg-[#E4F2EC] text-[#3F7F68] dark:bg-emerald-950/50 dark:text-emerald-300', page: 'developers' },
    { label: 'Collections', value: analytics.kpis.collections, icon: FolderKanban, bg: 'bg-[#F7EFE0] text-[#9A7437] dark:bg-amber-950/50 dark:text-amber-300', page: 'collections' },
    { label: 'Endpoints', value: analytics.kpis.endpoints, icon: PlugZap, bg: 'bg-[#E3F1EE] text-[#3D7A72] dark:bg-teal-950/50 dark:text-teal-300', page: 'collections' },
    { label: 'Versions', value: analytics.kpis.versions, icon: GitBranch, bg: 'bg-[#E7F0F5] text-[#45728A] dark:bg-cyan-950/50 dark:text-cyan-300', page: 'collections' },
    { label: 'Datasources', value: analytics.kpis.datasources, icon: Database, bg: 'bg-[#EAEDF8] text-[#53659E] dark:bg-indigo-950/50 dark:text-indigo-300', page: 'data_configuration' },
    { label: 'Auth Conf', value: analytics.kpis.authConfigs, icon: ShieldCheck, bg: 'bg-[#EFEAF7] text-[#6B589E] dark:bg-violet-950/50 dark:text-violet-300', page: 'auth_configuration' },
    { label: 'Auth Ids', value: analytics.kpis.authIds, icon: KeyRound, bg: 'bg-[#F2EBF5] text-[#7A5B8E] dark:bg-purple-950/50 dark:text-purple-300', page: 'auth_configuration' },
  ];

  const series = analytics.series || [];
  const maxChartVal = Math.max(
    ...series.map((s) => (metricMode === 'request' ? s.requests : s.avgLatencyMs)),
    1
  );

  const effectiveStart = startDate || analytics.startDate;
  const effectiveEnd = endDate || analytics.endDate;

  const computedDays = Math.max(
    1,
    Math.round(
      (new Date(`${effectiveEnd}T00:00:00`).getTime() -
        new Date(`${effectiveStart}T00:00:00`).getTime()) /
        86400_000
    ) + 1
  );
  const daysBadgeText =
    range === 'today'
      ? '1 day'
      : range === '1w'
      ? '7 days'
      : `${computedDays} ${computedDays === 1 ? 'day' : 'days'}`;

  const handlePresetClick = (preset: 'today' | '1w' | 'custom') => {
    const now = new Date();
    const todayIso = toIsoDate(now);
    if (preset === 'today') {
      onFilterChange({
        range: 'today',
        startDate: todayIso,
        endDate: todayIso,
        drilldown: drilldownFilter,
      });
      return;
    }
    if (preset === '1w') {
      const weekAgo = new Date(now.getTime() - 6 * 86400_000);
      onFilterChange({
        range: '1w',
        startDate: toIsoDate(weekAgo),
        endDate: todayIso,
        drilldown: drilldownFilter,
      });
      return;
    }
    onFilterChange({
      range: 'custom',
      startDate: effectiveStart,
      endDate: effectiveEnd,
      drilldown: drilldownFilter,
    });
  };

  const handleDateInputChange = (field: 'start' | 'end', val: string) => {
    if (!val) return;
    let nextStart = field === 'start' ? val : effectiveStart;
    let nextEnd = field === 'end' ? val : effectiveEnd;
    if (nextEnd < nextStart) {
      if (field === 'start') nextEnd = nextStart;
      else nextStart = nextEnd;
    }
    onFilterChange({
      range: 'custom',
      startDate: nextStart,
      endDate: nextEnd,
      drilldown: drilldownFilter,
    });
  };

  const handleActivateDrilldown = (filter: DashboardDrilldownFilter) => {
    onFilterChange({
      range,
      startDate: effectiveStart,
      endDate: effectiveEnd,
      drilldown: filter,
    });
    chartSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  const labelStep = series.length > 12 ? 2 : 1;

  return (
    <div className="p-4 lg:p-5 space-y-4">
      {/* Top Banner + Interactive Filter Row */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
        <div className="xl:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md px-5 py-4 flex items-center gap-4 shadow-2xs">
          <div className="w-11 h-11 rounded-lg bg-[#EEF1F9] dark:bg-indigo-950/50 flex items-center justify-center text-[#5C6FA8] dark:text-[#9BAEE5] shrink-0">
            <Share2 className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-medium text-[#5C6FA8] dark:text-[#9BAEE5]">Welcome to,</div>
            <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 tracking-tight truncate">
              Endpoint Generator Dashboard
            </h1>
          </div>
        </div>

        <div className="xl:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
          <div className="space-y-1.5">
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Filter Date Range
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded overflow-hidden border border-[#C6D0EB] dark:border-indigo-700/60">
                {(
                  [
                    { id: 'today', label: 'Today' },
                    { id: '1w', label: '1 Week' },
                    { id: 'custom', label: 'Custom' },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handlePresetClick(item.id)}
                    className={`px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                      range === item.id
                        ? 'bg-[#5C6FA8] text-white'
                        : 'bg-white dark:bg-slate-800 text-[#4A5B8C] dark:text-[#A5B7EB] hover:bg-[#EEF1F9] dark:hover:bg-slate-700'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center border border-slate-300 dark:border-slate-700 hover:border-[#5C6FA8]/70 focus-within:border-[#5C6FA8] rounded bg-white dark:bg-slate-800 px-2.5 py-1 text-xs font-mono text-slate-700 dark:text-slate-100 gap-1.5 transition-colors">
                <Calendar className="w-3.5 h-3.5 text-[#5C6FA8] dark:text-[#9BAEE5] shrink-0" />
                <input
                  type="date"
                  aria-label="Start Date"
                  value={effectiveStart}
                  onChange={(e) => handleDateInputChange('start', e.target.value)}
                  className="bg-transparent focus:outline-none text-xs cursor-pointer dark:[color-scheme:dark]"
                />
                <span className="text-slate-400">-</span>
                <input
                  type="date"
                  aria-label="End Date"
                  value={effectiveEnd}
                  onChange={(e) => handleDateInputChange('end', e.target.value)}
                  className="bg-transparent focus:outline-none text-xs cursor-pointer dark:[color-scheme:dark]"
                />
              </div>

              <span className="px-3 py-1.5 rounded bg-[#F5E9C9] dark:bg-amber-950/50 text-[#6E5624] dark:text-amber-200 border border-[#E6D3A3] dark:border-amber-800/50 text-xs font-semibold whitespace-nowrap tabular-nums">
                {daysBadgeText}
              </span>
            </div>
          </div>

          <div className="inline-flex rounded overflow-hidden border border-[#C6D0EB] dark:border-indigo-700/60 self-end sm:self-center">
            <button
              type="button"
              onClick={() => setMetricMode('request')}
              className={`px-4 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                metricMode === 'request'
                  ? 'bg-[#5C6FA8] text-white'
                  : 'bg-white dark:bg-slate-800 text-[#4A5B8C] dark:text-[#A5B7EB] hover:bg-[#EEF1F9] dark:hover:bg-slate-700'
              }`}
            >
              Request
            </button>
            <button
              type="button"
              onClick={() => setMetricMode('latency')}
              className={`px-4 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                metricMode === 'latency'
                  ? 'bg-[#5C6FA8] text-white'
                  : 'bg-white dark:bg-slate-800 text-[#4A5B8C] dark:text-[#A5B7EB] hover:bg-[#EEF1F9] dark:hover:bg-slate-700'
              }`}
            >
              Response Time
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Grid: KPI 3x3 Matrix (left) and Traffic Bar Chart (right) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
        {/* Left: 3x3 KPI Matrix filling full row height cleanly (Servers section removed) */}
        <div className="xl:col-span-4 grid grid-cols-3 gap-3 auto-rows-fr">
          {kpiCards.map((k) => {
            const Icon = k.icon;
            return (
              <button
                key={k.label}
                type="button"
                onClick={() => onNavigate(k.page)}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md px-3.5 py-4 flex items-center gap-3 hover:border-[#8D9FD2] hover:shadow-xs transition-all text-left cursor-pointer"
              >
                <div className={`w-9 h-9 rounded-md ${k.bg} flex items-center justify-center shrink-0`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-lg font-bold text-slate-800 dark:text-slate-100 tabular-nums leading-tight">
                    {k.value.toLocaleString()}
                  </div>
                  <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    {k.label}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Right: Requests & Response Time Bar Chart (supports Global + Drilldown views) */}
        <div
          ref={chartSectionRef}
          className="xl:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md p-4 flex flex-col justify-between"
        >
          {/* Active Drilldown Filter Strip when an Auth Key or Endpoint row is clicked */}
          {drilldownFilter && (
            <div className="mb-3 px-3 py-2 rounded-md bg-[#EEF1F9] dark:bg-indigo-950/30 border border-[#C6D0EB] dark:border-indigo-800/50 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0 text-xs">
                <Filter className="w-3.5 h-3.5 text-[#5C6FA8] dark:text-[#9BAEE5] shrink-0" />
                <span className="font-semibold text-slate-700 dark:text-slate-200 shrink-0">
                  {drilldownFilter.type === 'authKey' ? 'Auth Key Filter:' : 'Endpoint Filter:'}
                </span>
                <span className="font-mono font-semibold text-[#4A5B8C] dark:text-[#A5B7EB] truncate">
                  {drilldownFilter.label}
                </span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    onNavigate(
                      drilldownFilter.type === 'authKey' ? 'auth_configuration' : 'request_log'
                    )
                  }
                  className="text-[11px] font-semibold text-[#476B9E] dark:text-sky-300 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <span>
                    {drilldownFilter.type === 'authKey'
                      ? 'Open Auth Provider'
                      : 'View Endpoint Logs'}
                  </span>
                  <ExternalLink className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onFilterChange({
                      range,
                      startDate: effectiveStart,
                      endDate: effectiveEnd,
                      drilldown: null,
                    })
                  }
                  className="px-2.5 py-1 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:border-[#5C6FA8] hover:text-[#4A5B8C] flex items-center gap-1 cursor-pointer"
                >
                  <ArrowLeft className="w-3 h-3" />
                  <span>All Traffic</span>
                </button>
              </div>
            </div>
          )}

          {/* Metric Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <div className="border border-slate-200 dark:border-slate-800 rounded-md p-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-md bg-[#E4ECF7] text-[#476B9E] dark:bg-sky-950/60 dark:text-sky-300 flex items-center justify-center shrink-0">
                  <ArrowLeftRight className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                    {metricMode === 'request'
                      ? analytics.totalRequests.toLocaleString()
                      : `${analytics.avgDurationMs} ms`}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {metricMode === 'request' ? 'Request' : 'Avg Response Time'}
                  </div>
                </div>
              </div>
              <div className="text-right text-[11px] text-slate-600 dark:text-slate-400 tabular-nums space-y-0.5">
                <div className="text-[#4B826E] dark:text-emerald-300 font-medium">
                  avg {analytics.avgReqPerHour.toLocaleString()} req./hour
                </div>
                <div>
                  max {analytics.peakReqCount.toLocaleString()} req. @{analytics.peakReqAt}
                </div>
              </div>
            </div>

            <div className="border border-slate-200 dark:border-slate-800 rounded-md p-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-md bg-[#F7E6E8] text-[#B35C68] dark:bg-rose-950/50 dark:text-rose-300 flex items-center justify-center shrink-0">
                  <AlertCircle className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                    {analytics.totalErrors.toLocaleString()}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">Error Request</div>
                </div>
              </div>
              <div className="text-right text-[11px] text-slate-600 dark:text-slate-400 tabular-nums space-y-0.5">
                <div className="text-[#B35C68] dark:text-rose-300 font-medium">
                  avg {analytics.avgErrPerHour.toLocaleString()} req./hour
                </div>
                <div>
                  max {analytics.peakErrCount.toLocaleString()} req. @{analytics.peakErrAt}
                </div>
              </div>
            </div>
          </div>

          {/* Contained Bar Chart with Dedicated Non-Overflowing X-Axis Strip */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                {metricMode === 'request' ? 'Request vs Time' : 'Response Time (ms) vs Time'}
              </span>
              <span className="text-[11px] text-slate-400">
                Click any bar to inspect Request Logs for that window
              </span>
            </div>

            {/* Plot Area: Y-Axis + Bars */}
            <div className="relative h-48 flex">
              {/* Y-Axis Scale */}
              <div className="w-12 shrink-0 flex flex-col justify-between items-end pr-2 text-[10px] font-mono text-slate-400 tabular-nums select-none">
                {[1, 0.66, 0.33, 0].map((ratio, idx) => {
                  const val = Math.round(maxChartVal * ratio);
                  const formatted =
                    metricMode === 'request'
                      ? val >= 1000
                        ? `${(val / 1000).toFixed(val >= 10000 ? 0 : 1)}k`
                        : String(val)
                      : `${val}ms`;
                  return <span key={idx}>{formatted}</span>;
                })}
              </div>

              {/* Gridlines + Clickable Bars */}
              <div className="flex-1 relative">
                <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="w-full border-b border-slate-100 dark:border-slate-800"
                    />
                  ))}
                </div>

                <div className="relative z-10 h-full flex items-end justify-between gap-1.5 px-1">
                  {series.map((pt, idx) => {
                    const value = metricMode === 'request' ? pt.requests : pt.avgLatencyMs;
                    const heightPct = value === 0 ? 0 : Math.max(4, Math.round((value / maxChartVal) * 100));
                    const errPct =
                      metricMode === 'request' && pt.errors > 0
                        ? Math.min(heightPct, Math.max(4, Math.round((pt.errors / maxChartVal) * 100)))
                        : 0;
                    return (
                      <button
                        key={`${pt.rangeStart}-${idx}`}
                        type="button"
                        onClick={() => onBarClick(pt)}
                        onMouseEnter={() => setHoveredBar(idx)}
                        onMouseLeave={() => setHoveredBar(null)}
                        aria-label={`Filter logs ${pt.rangeStart} to ${pt.rangeEnd}`}
                        className="flex-1 h-full flex flex-col items-center justify-end relative group cursor-pointer focus:outline-none"
                      >
                        {hoveredBar === idx && (
                          <div
                            className={`absolute -top-14 z-30 px-2.5 py-1.5 rounded bg-slate-900 dark:bg-slate-800 text-white text-[10px] font-mono whitespace-nowrap shadow-lg pointer-events-none border border-slate-700 ${
                              idx <= 1
                                ? 'left-0'
                                : idx >= series.length - 2
                                ? 'right-0'
                                : 'left-1/2 -translate-x-1/2'
                            }`}
                          >
                            <div className="text-slate-300">
                              {pt.rangeStart} → {pt.rangeEnd.slice(11)}
                            </div>
                            <div className="text-[#9FD3BE] font-semibold">
                              {metricMode === 'request'
                                ? `${pt.requests.toLocaleString()} reqs · ${pt.errors} err`
                                : `${pt.avgLatencyMs} ms avg`}
                            </div>
                            <div className="text-[#E6C98B] text-[9px] mt-0.5">
                              Click to open Request Log
                            </div>
                          </div>
                        )}
                        <div className="w-full max-w-[18px] h-full flex flex-col justify-end">
                          <div
                            style={{ height: `${heightPct}%` }}
                            className={`w-full rounded-t-[2px] transition-all duration-150 relative overflow-hidden group-hover:ring-2 group-hover:ring-[#5C6FA8]/40 ${
                              metricMode === 'request'
                                ? 'bg-[#6FA894] group-hover:bg-[#578F7B]'
                                : 'bg-[#7A94C8] group-hover:bg-[#607BB3]'
                            }`}
                          >
                            {errPct > 0 && (
                              <div
                                style={{ height: `${Math.max(2, errPct)}px` }}
                                className="absolute bottom-0 left-0 right-0 bg-[#D4818B]"
                              />
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Dedicated X-Axis Label Row inside Card Bounds (No Overflow) */}
            <div className="pl-12 pr-1 pt-2 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between gap-1.5 overflow-hidden">
              {series.map((pt, idx) => {
                const showLabel = idx % labelStep === 0 || idx === series.length - 1;
                return (
                  <div
                    key={`x-${pt.rangeStart}-${idx}`}
                    className="flex-1 min-w-0 text-center"
                  >
                    {showLabel ? (
                      <span className="block text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate leading-tight">
                        {pt.label}
                      </span>
                    ) : (
                      <span className="block text-[10px] leading-tight select-none">&nbsp;</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Leaderboards */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        {/* Top 10 Auth Identifier */}
        <div className="xl:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md p-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              Top 10 Auth Identifier (NIK / Key / Email)
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('auth_configuration')}
              className="text-xs font-medium text-[#4A5B8C] dark:text-[#9BAEE5] hover:underline flex items-center gap-1 cursor-pointer shrink-0"
            >
              <span>see more</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {analytics.topAuthIdentifiers.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                No auth identifier request logs found in selected date range.
              </div>
            ) : (
              analytics.topAuthIdentifiers.map((item) => {
                const isSelected =
                  drilldownFilter?.type === 'authKey' && drilldownFilter.value === item.keyName;
                return (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() =>
                      handleActivateDrilldown({
                        type: 'authKey',
                        label: item.keyName,
                        value: item.keyName,
                      })
                    }
                    className={`w-full py-3 px-2 -mx-2 rounded flex items-center justify-between gap-3 text-left transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[#EEF1F9] dark:bg-indigo-950/40 ring-1 ring-[#5C6FA8]/40'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-[#4A5B8C] dark:text-[#A5B7EB] truncate">{item.label}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                        {item.subtitle}
                      </div>
                    </div>
                    <div className="text-right shrink-0 tabular-nums">
                      <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center justify-end gap-1">
                        <ArrowLeftRight className="w-3 h-3 text-[#6883B8]" />
                        <span>{item.requests.toLocaleString()} req.</span>
                      </div>
                      <div className="text-[11px] text-[#B35C68] dark:text-rose-300 flex items-center justify-end gap-1 mt-0.5">
                        <XCircle className="w-3 h-3" />
                        <span>{item.errors} error</span>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Top 10 Endpoint */}
        <div className="xl:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md p-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              Top 10 Endpoint
            </h2>
            <div className="flex items-center gap-12 sm:gap-16">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 hidden sm:inline">
                Requests
              </span>
              <button
                type="button"
                onClick={() => onNavigate('request_log')}
                className="text-xs font-medium text-[#4A5B8C] dark:text-[#9BAEE5] hover:underline flex items-center gap-1 cursor-pointer shrink-0"
              >
                <span>see more</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {analytics.topEndpoints.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                No endpoint request logs found in selected date range.
              </div>
            ) : (
              analytics.topEndpoints.map((ep) => {
                const maxSpark = Math.max(...ep.sparkline, 1);
                const isSelected =
                  drilldownFilter?.type === 'endpoint' && drilldownFilter.value === ep.path;
                return (
                  <button
                    key={ep.path}
                    type="button"
                    onClick={() =>
                      handleActivateDrilldown({
                        type: 'endpoint',
                        label: ep.path,
                        value: ep.path,
                      })
                    }
                    className={`w-full py-3 px-2 -mx-2 rounded flex items-center justify-between gap-4 text-left transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[#EEF1F9] dark:bg-indigo-950/40 ring-1 ring-[#5C6FA8]/40'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-[#4A5B8C] dark:text-[#A5B7EB] truncate">{ep.path}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                        {ep.subtitle}
                      </div>
                    </div>
                    <div className="hidden sm:flex items-end gap-[2px] h-7 w-28 shrink-0">
                      {ep.sparkline.map((v, i) => (
                        <div
                          key={i}
                          style={{ height: `${v === 0 ? 0 : Math.max(15, Math.round((v / maxSpark) * 100))}%` }}
                          className="flex-1 bg-[#7EB09D] rounded-t-[1px]"
                        />
                      ))}
                    </div>
                    <div className="text-right shrink-0 w-24 tabular-nums">
                      <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center justify-end gap-1">
                        <ArrowLeftRight className="w-3 h-3 text-[#6883B8]" />
                        <span>{ep.requests.toLocaleString()} req.</span>
                      </div>
                      <div className="text-[11px] text-[#B35C68] dark:text-rose-300 flex items-center justify-end gap-1 mt-0.5">
                        <XCircle className="w-3 h-3" />
                        <span>{ep.errors} error</span>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
