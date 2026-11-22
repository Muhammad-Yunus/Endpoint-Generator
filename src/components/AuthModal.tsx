import React, { useState } from 'react';
import { X, ShieldCheck, KeyRound, HelpCircle, Layers, Database, Shield, Activity } from 'lucide-react';
import { apiFetch, setAuthToken } from '../lib/api';
import type { AuthSessionUser } from '../types/domain';

export function AuthModal({
  isOpen,
  needsAdminClaim,
  onClose,
  onAuthenticated,
}: {
  isOpen: boolean;
  needsAdminClaim: boolean;
  onClose: () => void;
  onAuthenticated: (user: AuthSessionUser) => void;
}) {
  const [mode, setMode] = useState<'claim' | 'login'>(needsAdminClaim ? 'claim' : 'login');
  const [name, setName] = useState('Alex Morgan');
  const [email, setEmail] = useState('alex.morgan@demo.com');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const endpoint = mode === 'claim' ? '/api/auth/claim' : '/api/auth/login';
      const body = mode === 'claim' ? { name, email, password } : { email, password };
      const res = await apiFetch<{ user: AuthSessionUser; token: string }>(endpoint, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setAuthToken(res.token);
      onAuthenticated(res.user);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
      <div className="w-full max-w-md rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-[#EEF1F9] dark:bg-indigo-950/50 text-[#5C6FA8] dark:text-[#A5B7EB] flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {mode === 'claim' ? 'Claim Operator Admin Account' : 'Sign In to Endpoint Generator'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {mode === 'claim'
                  ? 'Set your initial operator password to unlock write actions'
                  : 'Authenticate to save endpoints, manage keys, and deploy'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 rounded-md bg-[#F7E6E8] dark:bg-rose-950/40 border border-[#EBC9CE] dark:border-rose-800 text-xs text-[#9E4754] dark:text-rose-300">
              {error}
            </div>
          )}

          {mode === 'claim' && (
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Full Name
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#5C6FA8]"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Operator Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#5C6FA8]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Password {mode === 'claim' && '(min 6 characters)'}
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter secure password"
              className="w-full px-3 py-2 text-sm rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#5C6FA8]"
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            {needsAdminClaim ? (
              <button
                type="button"
                onClick={() => setMode(mode === 'claim' ? 'login' : 'claim')}
                className="text-xs text-[#476B9E] dark:text-sky-300 hover:underline"
              >
                {mode === 'claim' ? 'Already have an account? Sign In' : 'Need to claim first Admin?'}
              </button>
            ) : (
              <span className="text-xs text-slate-500 flex items-center gap-1">
                <KeyRound className="w-3.5 h-3.5" /> Scrypt + Bearer verified
              </span>
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 text-xs font-medium rounded-md border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 text-xs font-semibold rounded-md bg-[#5C6FA8] text-white hover:bg-[#4B5D93] disabled:opacity-60"
              >
                {loading ? 'Verifying...' : mode === 'claim' ? 'Claim & Sign In' : 'Sign In'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export function HelpModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
      <div className="w-full max-w-2xl rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-[#5C6FA8] dark:text-[#9BAEE5]" />
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Endpoint Generator Architecture Guide
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-slate-600 dark:text-slate-300">
          <div className="p-3.5 rounded-md border border-slate-200 dark:border-slate-800 space-y-1.5">
            <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
              <Layers className="w-4 h-4 text-[#5C6FA8] dark:text-[#9BAEE5]" />
              <span>Workspace & Collection Auth</span>
            </div>
            <p>
              Auth providers (Common Auth, JV CAS, Bearer JWT, OAuth2) attach at the Collection level.
              Every endpoint under a Collection inherits its Auth Headers while enforcing granular API Scopes per version.
            </p>
          </div>
          <div className="p-3.5 rounded-md border border-slate-200 dark:border-slate-800 space-y-1.5">
            <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
              <Database className="w-4 h-4 text-[#6883B8] dark:text-sky-300" />
              <span>Datasource Binding & Versioning</span>
            </div>
            <p>
              Each Endpoint locks to one Database Connection. Multiple versions (Ver.1, Ver.2) share that same
              Datasource while mapping independently to different Tables, Views, Functions, or Stored Procedures.
            </p>
          </div>
          <div className="p-3.5 rounded-md border border-slate-200 dark:border-slate-800 space-y-1.5">
            <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
              <Shield className="w-4 h-4 text-[#558B78] dark:text-emerald-300" />
              <span>Per-Endpoint Resilience</span>
            </div>
            <p>
              Configure Rate Limiting (by IP or Auth Identifier), Circuit Breaker thresholds with fallback JSON,
              and Response Caching with TTL right inside the Settings tab.
            </p>
          </div>
          <div className="p-3.5 rounded-md border border-slate-200 dark:border-slate-800 space-y-1.5">
            <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
              <Activity className="w-4 h-4 text-[#A68046] dark:text-amber-300" />
              <span>Live Testing & Execution Profiler</span>
            </div>
            <p>
              Use the Test tab to invoke the live gateway. Every call generates a Request Log with stage-by-stage
              millisecond Profiler waterfall timings and updates Dashboard analytics.
            </p>
          </div>
        </div>
        <div className="px-5 py-3 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-800 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold rounded-md bg-[#5C6FA8] text-white hover:bg-[#4B5D93]"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
