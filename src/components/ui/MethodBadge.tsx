import React from 'react';
import { Database } from 'lucide-react';
import { methodBadgeColor } from '../../lib/api';
import type { DbEngine, HttpMethod } from '../../types/domain';

export function MethodBadge({
  method,
  size = 'sm',
}: {
  method: HttpMethod;
  size?: 'xs' | 'sm' | 'md';
}) {
  const sizeCls =
    size === 'xs'
      ? 'px-1.5 py-0.5 text-[10px]'
      : size === 'md'
      ? 'px-3 py-1 text-xs'
      : 'px-2 py-0.5 text-[11px]';

  return (
    <span
      className={`inline-flex items-center justify-center font-mono font-semibold rounded tracking-tight whitespace-nowrap shrink-0 ${sizeCls} ${methodBadgeColor(
        method
      )}`}
    >
      {method}
    </span>
  );
}

export function ToggleSwitch({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label || 'Toggle'}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5C6FA8] focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? 'bg-[#5C6FA8]' : 'bg-slate-300 dark:bg-slate-600'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

export function EngineBadge({ engine }: { engine: DbEngine }) {
  if (engine === 'postgresql') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#4C7399] dark:text-sky-300">
        <Database className="w-4 h-4 shrink-0" />
        <span>PostgreSQL</span>
      </span>
    );
  }
  if (engine === 'mysql') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#4B8292] dark:text-cyan-300">
        <Database className="w-4 h-4 shrink-0" />
        <span>MySQL</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#A66064] dark:text-rose-300">
      <Database className="w-4 h-4 shrink-0" />
      <span>SQL Server</span>
    </span>
  );
}
