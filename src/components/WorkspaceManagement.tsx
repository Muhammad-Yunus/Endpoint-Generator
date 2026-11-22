import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { Developer, Team, Workspace } from '../types/domain';

export function WorkspaceManagement({
  page,
  workspaceId,
  workspaces,
  teams,
  developers,
  onSelectWorkspace,
  onRefreshData,
}: {
  page: 'workspaces' | 'teams' | 'developers';
  workspaceId: number;
  workspaces: Workspace[];
  teams: Team[];
  developers: Developer[];
  onSelectWorkspace: (id: number) => void;
  onRefreshData: () => Promise<void>;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [wsName, setWsName] = useState('');
  const [wsCode, setWsCode] = useState('');
  const [wsDesc, setWsDesc] = useState('');
  const [teamName, setTeamName] = useState('');
  const [teamLead, setTeamLead] = useState('');
  const [devName, setDevName] = useState('');
  const [devEmail, setDevEmail] = useState('');
  const [devTeamId, setDevTeamId] = useState<number>(teams[0]?.id || 1);
  const [devRole, setDevRole] = useState<Developer['role']>('Developer');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (page === 'workspaces') {
      await apiFetch('/api/workspaces', {
        method: 'POST',
        body: JSON.stringify({ name: wsName, code: wsCode, description: wsDesc }),
      });
    } else if (page === 'teams') {
      await apiFetch('/api/teams', {
        method: 'POST',
        body: JSON.stringify({ workspaceId, name: teamName, leadEmail: teamLead, description: teamName }),
      });
    } else {
      await apiFetch('/api/developers', {
        method: 'POST',
        body: JSON.stringify({ workspaceId, teamId: devTeamId, name: devName, email: devEmail, role: devRole }),
      });
    }
    await onRefreshData();
    setModalOpen(false);
    setWsName('');
    setWsCode('');
    setWsDesc('');
    setTeamName('');
    setTeamLead('');
    setDevName('');
    setDevEmail('');
  };

  return (
    <div className="p-4 lg:p-5 space-y-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100 capitalize">{page}</h1>
            <p className="text-xs text-slate-500">
              {page === 'workspaces'
                ? 'Top-level project containers isolating Collections, Teams, and Datasources.'
                : page === 'teams'
                ? 'Engineering squads owning Datasources and API Collections.'
                : 'Workspace developers and RBAC operators.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="px-3.5 py-2 rounded bg-[#5C6FA8] hover:bg-[#4B5D93] text-white text-xs font-semibold flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add {page.slice(0, -1)}</span>
          </button>
        </div>

        <div className="border border-slate-200 dark:border-slate-800 rounded overflow-hidden">
          {page === 'workspaces' && (
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                <tr>
                  <th className="text-left px-4 py-2.5">Workspace Name</th>
                  <th className="text-left px-4 py-2.5">Code</th>
                  <th className="text-left px-4 py-2.5">Description</th>
                  <th className="text-right px-4 py-2.5">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {workspaces.map((w) => (
                  <tr key={w.id}>
                    <td className="px-4 py-3 font-semibold text-[#4A5B8C] dark:text-[#A5B7EB]">{w.name}</td>
                    <td className="px-4 py-3 font-mono text-slate-500">{w.code}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{w.description}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => onSelectWorkspace(w.id)}
                        className={`px-3 py-1 rounded text-[11px] font-semibold ${
                          w.id === workspaceId
                            ? 'bg-[#558B78] text-white'
                            : 'border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                        }`}
                      >
                        {w.id === workspaceId ? 'Active Workspace' : 'Switch'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {page === 'teams' && (
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                <tr>
                  <th className="text-left px-4 py-2.5">Team Name</th>
                  <th className="text-left px-4 py-2.5">Lead Email</th>
                  <th className="text-left px-4 py-2.5">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {teams.map((t) => (
                  <tr key={t.id}>
                    <td className="px-4 py-3 font-semibold text-[#4A5B8C] dark:text-[#A5B7EB]">{t.name}</td>
                    <td className="px-4 py-3 font-mono text-slate-500">{t.leadEmail}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{t.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {page === 'developers' && (
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                <tr>
                  <th className="text-left px-4 py-2.5">Name</th>
                  <th className="text-left px-4 py-2.5">Email</th>
                  <th className="text-left px-4 py-2.5">Team</th>
                  <th className="text-left px-4 py-2.5">Role</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {developers.map((d) => (
                  <tr key={d.id}>
                    <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-100">{d.name}</td>
                    <td className="px-4 py-3 font-mono text-slate-500">{d.email}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {teams.find((t) => t.id === d.teamId)?.name || '-'}
                    </td>
                    <td className="px-4 py-3 font-medium text-[#4A5B8C] dark:text-[#A5B7EB]">{d.role}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <form
            onSubmit={handleSubmit}
            className="w-full max-w-md rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-5 space-y-3 text-xs shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold capitalize">Add {page.slice(0, -1)}</h3>
              <button type="button" onClick={() => setModalOpen(false)}>
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>
            {page === 'workspaces' && (
              <>
                <input
                  type="text"
                  required
                  placeholder="Workspace Name"
                  value={wsName}
                  onChange={(e) => setWsName(e.target.value)}
                  className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
                <input
                  type="text"
                  required
                  placeholder="Workspace Code (e.g., CORE_FIN)"
                  value={wsCode}
                  onChange={(e) => setWsCode(e.target.value)}
                  className="w-full px-3 py-2 font-mono rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
                <input
                  type="text"
                  placeholder="Description"
                  value={wsDesc}
                  onChange={(e) => setWsDesc(e.target.value)}
                  className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </>
            )}
            {page === 'teams' && (
              <>
                <input
                  type="text"
                  required
                  placeholder="Team Name"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
                <input
                  type="email"
                  required
                  placeholder="Lead Email"
                  value={teamLead}
                  onChange={(e) => setTeamLead(e.target.value)}
                  className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </>
            )}
            {page === 'developers' && (
              <>
                <input
                  type="text"
                  required
                  placeholder="Full Name"
                  value={devName}
                  onChange={(e) => setDevName(e.target.value)}
                  className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
                <input
                  type="email"
                  required
                  placeholder="Email"
                  value={devEmail}
                  onChange={(e) => setDevEmail(e.target.value)}
                  className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
                <select
                  value={devTeamId}
                  onChange={(e) => setDevTeamId(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                >
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <select
                  value={devRole}
                  onChange={(e) => setDevRole(e.target.value as Developer['role'])}
                  className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                >
                  <option value="Admin">Admin</option>
                  <option value="Architect">Architect</option>
                  <option value="Developer">Developer</option>
                  <option value="Viewer">Viewer</option>
                </select>
              </>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700"
              >
                Cancel
              </button>
              <button type="submit" className="px-4 py-1.5 rounded bg-[#5C6FA8] hover:bg-[#4B5D93] text-white font-semibold">
                Save
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
