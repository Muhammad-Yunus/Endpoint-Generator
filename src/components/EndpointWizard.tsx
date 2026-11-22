import React, { useState, useMemo } from 'react';
import {
  Wand2,
  Database,
  Braces,
  CloudCog,
  X,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  Table2,
  Eye,
  FunctionSquare,
  TerminalSquare,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import type {
  Collection,
  Datasource,
  DatasourceObject,
  Endpoint,
  EndpointVersion,
  HttpMethod,
  CrudOperation,
} from '../types/domain';

export function EndpointWizard({
  isOpen,
  collections,
  datasources,
  datasourceObjects,
  defaultCollectionId,
  onClose,
  onManualCreate,
  onCreated,
}: {
  isOpen: boolean;
  collections: Collection[];
  datasources: Datasource[];
  datasourceObjects: DatasourceObject[];
  defaultCollectionId: number;
  onClose: () => void;
  onManualCreate: (collectionId: number, datasourceId: number) => void;
  onCreated: (created: Array<{ endpoint: Endpoint; version: EndpointVersion }>) => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [collectionId, setCollectionId] = useState<number>(defaultCollectionId || collections[0]?.id || 1);
  const [datasourceId, setDatasourceId] = useState<number>(datasources[0]?.id || 1);
  const [objectSearch, setObjectSearch] = useState('');
  const [selectedObjId, setSelectedObjId] = useState<number | null>(null);
  const [crudMode, setCrudMode] = useState<'single' | 'full_crud'>('single');
  const [singleOp, setSingleOp] = useState<CrudOperation>('select');
  const [endpointName, setEndpointName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredObjects = useMemo(() => {
    const q = objectSearch.trim().toLowerCase();
    return datasourceObjects
      .filter((o) => o.datasourceId === datasourceId)
      .filter(
        (o) =>
          !q ||
          o.objectName.toLowerCase().includes(q) ||
          o.schemaName.toLowerCase().includes(q) ||
          o.objectType.toLowerCase().includes(q)
      );
  }, [datasourceObjects, datasourceId, objectSearch]);

  const selectedObj = useMemo(
    () => datasourceObjects.find((o) => o.id === selectedObjId) || filteredObjects[0] || null,
    [datasourceObjects, selectedObjId, filteredObjects]
  );

  if (!isOpen) return null;

  const handleSelectObj = (obj: DatasourceObject) => {
    setSelectedObjId(obj.id);
    const pretty = obj.objectName
      .replace(/^sp_|^fn_|^vw_/, '')
      .split('_')
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(' ');
    setEndpointName(pretty);
    if (obj.objectType === 'function' || obj.objectType === 'stored_procedure') {
      setCrudMode('single');
      setSingleOp('execute_rpc');
    } else if (obj.objectType === 'view') {
      setCrudMode('single');
      setSingleOp('select');
    } else {
      setSingleOp('select');
    }
  };

  const buildOperationsList = (): Array<{
    name: string;
    method: HttpMethod;
    op: CrudOperation;
    segments: string[];
    hasIdParam: boolean;
  }> => {
    if (!selectedObj) return [];
    const baseName = endpointName || selectedObj.objectName;
    if (selectedObj.objectType === 'table' && crudMode === 'full_crud') {
      return [
        { name: `${baseName} List`, method: 'GET', op: 'select', segments: [selectedObj.schemaName, selectedObj.objectName], hasIdParam: false },
        { name: `${baseName} Detail`, method: 'GET', op: 'select_by_id', segments: [selectedObj.schemaName, selectedObj.objectName, '{id}'], hasIdParam: true },
        { name: `${baseName} Create`, method: 'POST', op: 'insert', segments: [selectedObj.schemaName, selectedObj.objectName], hasIdParam: false },
        { name: `${baseName} Update`, method: 'PUT', op: 'update', segments: [selectedObj.schemaName, selectedObj.objectName, '{id}'], hasIdParam: true },
        { name: `${baseName} Delete`, method: 'DELETE', op: 'delete', segments: [selectedObj.schemaName, selectedObj.objectName, '{id}'], hasIdParam: true },
      ];
    }
    const opMap: Record<CrudOperation, { method: HttpMethod; segs: string[]; idParam: boolean }> = {
      select: { method: 'GET', segs: [selectedObj.schemaName, selectedObj.objectName], idParam: false },
      select_by_id: { method: 'GET', segs: [selectedObj.schemaName, selectedObj.objectName, '{id}'], idParam: true },
      insert: { method: 'POST', segs: [selectedObj.schemaName, selectedObj.objectName], idParam: false },
      update: { method: 'PUT', segs: [selectedObj.schemaName, selectedObj.objectName, '{id}'], idParam: true },
      delete: { method: 'DELETE', segs: [selectedObj.schemaName, selectedObj.objectName, '{id}'], idParam: true },
      execute_rpc: { method: 'POST', segs: [selectedObj.schemaName, selectedObj.objectName], idParam: false },
    };
    const cfg = opMap[singleOp];
    return [{ name: baseName, method: cfg.method, op: singleOp, segments: cfg.segs, hasIdParam: cfg.idParam }];
  };

  const handleBuild = async () => {
    if (!selectedObj) return;
    setSaving(true);
    setError(null);
    try {
      const ops = buildOperationsList();
      const results: Array<{ endpoint: Endpoint; version: EndpointVersion }> = [];
      const pkCol = selectedObj.columns.find((c) => c.isPrimaryKey)?.name || 'id';
      const inCols = selectedObj.columns.filter((c) => c.direction !== 'OUT' && !c.isPrimaryKey);
      const outCols = selectedObj.columns.filter((c) => c.direction !== 'IN').map((c) => c.name);

      for (const item of ops) {
        const bodyFields =
          item.method === 'POST' || item.method === 'PUT' || item.method === 'PATCH'
            ? inCols.map((c) => ({
                name: c.name,
                dataType: c.dataType,
                mandatory: !c.nullable,
                mappedColumn: c.name,
                sampleValue: c.defaultValue ?? null,
                description: `Mapped to ${selectedObj.schemaName}.${selectedObj.objectName}.${c.name}`,
              }))
            : [];

        const pathParams = item.hasIdParam
          ? [
              {
                segmentIndex: item.segments.length - 1,
                segmentName: '{id}',
                isParam: true,
                paramName: 'id',
                dataType: 'string',
                mappedColumn: pkCol,
                description: `Primary key (${pkCol})`,
              },
            ]
          : [];

        const res = await apiFetch<{ endpoint: Endpoint; version: EndpointVersion }>('/api/endpoints', {
          method: 'POST',
          body: JSON.stringify({
            collectionId,
            name: item.name,
            datasourceId,
            version: {
              versionNumber: 1,
              versionLabel: 'Ver.1',
              method: item.method,
              pathSegments: item.segments,
              pathParams,
              headers: [],
              bodyFields,
              dbSchema: selectedObj.schemaName,
              dbObjectName: selectedObj.objectName,
              dbObjectType: selectedObj.objectType,
              crudOperation: item.op,
              sqlMapping: {
                selectedColumns: outCols,
                whereColumns: item.hasIdParam ? [pkCol] : [],
                orderBy: outCols[0] || pkCol,
                orderDir: 'ASC',
                customSqlPreview:
                  selectedObj.objectType === 'function' || selectedObj.objectType === 'stored_procedure'
                    ? `SELECT * FROM ${selectedObj.schemaName}.${selectedObj.objectName}(${inCols.map((_, i) => `$${i + 1}`).join(', ')});`
                    : item.op === 'insert'
                    ? `INSERT INTO ${selectedObj.schemaName}.${selectedObj.objectName} (${inCols.map((c) => c.name).join(', ')}) VALUES (...) RETURNING *;`
                    : item.op === 'update'
                    ? `UPDATE ${selectedObj.schemaName}.${selectedObj.objectName} SET ... WHERE ${pkCol} = $1 RETURNING *;`
                    : item.op === 'delete'
                    ? `DELETE FROM ${selectedObj.schemaName}.${selectedObj.objectName} WHERE ${pkCol} = $1;`
                    : `SELECT ${outCols.join(', ')} FROM ${selectedObj.schemaName}.${selectedObj.objectName}${item.hasIdParam ? ` WHERE ${pkCol} = $1` : ''};`,
              },
              paginationConfig: {
                enabled: item.op === 'select',
                mode: 'offset',
                defaultLimit: 25,
                maxLimit: 200,
                limitParam: 'limit',
                offsetParam: 'offset',
              },
              status: 'Draft',
              active: true,
              scopes: ['Read All'],
              description: `Generated by Endpoint Wizard from ${selectedObj.schemaName}.${selectedObj.objectName} (${selectedObj.objectType})`,
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
              circuitBreakerFallbackJson: { status: 503, message: 'Service temporarily unavailable' },
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
        results.push(res);
      }

      onCreated(results);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to build endpoint');
    } finally {
      setSaving(false);
    }
  };

  const objectIcon = (type: DatasourceObject['objectType']) => {
    switch (type) {
      case 'table':
        return <Table2 className="w-3.5 h-3.5 text-[#476B9E] dark:text-sky-300" />;
      case 'view':
        return <Eye className="w-3.5 h-3.5 text-[#4B826E] dark:text-emerald-300" />;
      case 'function':
        return <FunctionSquare className="w-3.5 h-3.5 text-[#9A7437] dark:text-amber-300" />;
      case 'stored_procedure':
        return <TerminalSquare className="w-3.5 h-3.5 text-[#5C6FA8] dark:text-[#A5B7EB]" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
      <div className="w-full max-w-xl rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-5 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-base font-bold text-slate-800 dark:text-slate-100">
              <Wand2 className="w-4 h-4 text-[#5C6FA8] dark:text-[#9BAEE5]" />
              <span>Endpoint Wizard</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Accelerate endpoint creation in a few steps. You can still fine tune and modify the generated endpoint after Build Endpoint completes.
          </p>

          {/* Stepper */}
          <div className="mt-5 grid grid-cols-3 gap-2 items-center relative">
            <div className="absolute top-4 left-12 right-12 h-[2px] bg-slate-200 dark:bg-slate-700 z-0" />
            {[
              { n: 1 as const, label: 'Choose Data Source', icon: Database },
              { n: 2 as const, label: 'Review Endpoint', icon: Braces },
              { n: 3 as const, label: 'Build Endpoint', icon: CloudCog },
            ].map((s) => {
              const Icon = s.icon;
              const active = step === s.n;
              const done = step > s.n;
              return (
                <div key={s.n} className="relative z-10 flex flex-col items-center">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center border text-xs font-semibold transition-colors ${
                      active
                        ? 'bg-[#6883B8] border-[#6883B8] text-white'
                        : done
                        ? 'bg-[#558B78] border-[#558B78] text-white'
                        : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-500'
                    }`}
                  >
                    {done ? <CheckCircle2 className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                  </div>
                  <span
                    className={`mt-1.5 text-[11px] font-medium px-2 py-0.5 rounded whitespace-nowrap ${
                      active
                        ? 'bg-[#EEF1F9] dark:bg-indigo-950/40 text-[#4A5B8C] dark:text-[#A5B7EB]'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {s.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
          {error && (
            <div className="p-3 rounded bg-[#F7E6E8] dark:bg-rose-950/40 border border-[#EBC9CE] dark:border-rose-800 text-xs text-[#9E4754] dark:text-rose-300">
              {error}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Target Collection (Inherits Collection Auth)
                </label>
                <select
                  value={collectionId}
                  onChange={(e) => setCollectionId(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                >
                  {collections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Choose Data Source
                </label>
                <select
                  value={datasourceId}
                  onChange={(e) => {
                    setDatasourceId(Number(e.target.value));
                    setSelectedObjId(null);
                  }}
                  className="w-full px-3 py-2 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                >
                  {datasources.map((ds) => (
                    <option key={ds.id} value={ds.id}>
                      [{ds.engine.toUpperCase()}] {ds.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Choose Table / View / Function / Procedure
                </label>
                <input
                  type="text"
                  value={objectSearch}
                  onChange={(e) => setObjectSearch(e.target.value)}
                  placeholder="search schema, table, view, function, or procedure"
                  className="w-full px-3 py-2 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-[#5C6FA8]"
                />
                <div className="mt-2 max-h-44 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredObjects.length === 0 ? (
                    <div className="p-3 text-xs text-slate-400 text-center">No objects match filter</div>
                  ) : (
                    filteredObjects.map((obj) => {
                      const isSel = selectedObj?.id === obj.id;
                      return (
                        <button
                          key={obj.id}
                          type="button"
                          onClick={() => handleSelectObj(obj)}
                          className={`w-full px-3 py-2 flex items-center justify-between text-left text-xs transition-colors ${
                            isSel
                              ? 'bg-[#EEF1F9] dark:bg-indigo-950/40 text-[#4A5B8C] dark:text-[#A5B7EB] font-medium'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {objectIcon(obj.objectType)}
                            <span className="font-mono truncate">
                              {obj.schemaName}.{obj.objectName}
                            </span>
                          </div>
                          <span className="text-[10px] uppercase font-mono text-slate-400 shrink-0 ml-2">
                            {obj.objectType.replace('_', ' ')}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {step === 2 && selectedObj && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Endpoint Base Name
                </label>
                <input
                  type="text"
                  value={endpointName}
                  onChange={(e) => setEndpointName(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                />
              </div>

              {selectedObj.objectType === 'table' && (
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Exposure Mode
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setCrudMode('single')}
                      className={`p-2.5 rounded border text-left text-xs ${
                        crudMode === 'single'
                          ? 'border-[#5C6FA8] bg-[#EEF1F9]/80 dark:bg-indigo-950/30 text-[#4A5B8C] dark:text-[#A5B7EB]'
                          : 'border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <div className="font-semibold">Single Operation</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">Expose 1 HTTP method</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCrudMode('full_crud')}
                      className={`p-2.5 rounded border text-left text-xs ${
                        crudMode === 'full_crud'
                          ? 'border-[#5C6FA8] bg-[#EEF1F9]/80 dark:bg-indigo-950/30 text-[#4A5B8C] dark:text-[#A5B7EB]'
                          : 'border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <div className="font-semibold">Full CRUD API Suite</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">GET, GET/:id, POST, PUT, DELETE</div>
                    </button>
                  </div>

                  {crudMode === 'single' && (
                    <select
                      value={singleOp}
                      onChange={(e) => setSingleOp(e.target.value as CrudOperation)}
                      className="w-full mt-2 px-3 py-2 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                    >
                      <option value="select">GET List (SELECT)</option>
                      <option value="select_by_id">GET By ID (SELECT WHERE PK)</option>
                      <option value="insert">POST Create (INSERT)</option>
                      <option value="update">PUT Update (UPDATE)</option>
                      <option value="delete">DELETE Remove (DELETE)</option>
                    </select>
                  )}
                </div>
              )}

              <div>
                <div className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Detected Columns & Parameters ({selectedObj.columns.length})
                </div>
                <div className="border border-slate-200 dark:border-slate-700 rounded overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500">
                      <tr>
                        <th className="text-left px-3 py-1.5 font-medium">Name</th>
                        <th className="text-left px-3 py-1.5 font-medium">Type</th>
                        <th className="text-left px-3 py-1.5 font-medium">Direction</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                      {selectedObj.columns.map((c) => (
                        <tr key={c.name}>
                          <td className="px-3 py-1.5 text-slate-800 dark:text-slate-200">{c.name}</td>
                          <td className="px-3 py-1.5 text-slate-500">{c.dataType}</td>
                          <td className="px-3 py-1.5 text-slate-500">{c.direction || 'COLUMN'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {step === 3 && selectedObj && (
            <div className="space-y-3">
              <div className="p-3 rounded bg-[#EEF2FA] dark:bg-indigo-950/40 border border-[#D4DDF0] dark:border-indigo-800/60 text-[#3B4E7A] dark:text-indigo-200 text-xs">
                Ready to scaffold {buildOperationsList().length} endpoint(s) bound to{' '}
                <strong>{datasources.find((d) => d.id === datasourceId)?.name}</strong> under Collection{' '}
                <strong>{collections.find((c) => c.id === collectionId)?.name}</strong>.
              </div>
              <div className="border border-slate-200 dark:border-slate-700 rounded divide-y divide-slate-100 dark:divide-slate-800">
                {buildOperationsList().map((op, i) => (
                  <div key={i} className="px-3 py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-semibold text-slate-800 dark:text-slate-100">{op.name}</div>
                      <div className="font-mono text-[11px] text-slate-500">
                        /v1/{op.segments.join('/')}
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-[#3E4C63] text-white font-mono text-[11px]">
                      {op.method}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              onManualCreate(collectionId, datasourceId);
              onClose();
            }}
            className="px-3 py-1.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-1.5"
          >
            <span>close, I'll do it myself</span>
            <X className="w-3.5 h-3.5" />
          </button>

          <div className="flex items-center gap-2">
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep((s) => (s === 3 ? 2 : 1))}
                className="px-3 py-1.5 rounded border border-slate-300 dark:border-slate-600 text-xs font-medium text-slate-700 dark:text-slate-200 flex items-center gap-1"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Back</span>
              </button>
            )}
            {step < 3 ? (
              <button
                type="button"
                disabled={!selectedObj}
                onClick={() => {
                  if (step === 1 && selectedObj && !endpointName) {
                    handleSelectObj(selectedObj);
                  }
                  setStep((s) => (s === 1 ? 2 : 3));
                }}
                className="px-4 py-1.5 rounded bg-[#5C6FA8] text-white text-xs font-semibold hover:bg-[#4B5D93] disabled:opacity-40 flex items-center gap-1"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                disabled={saving}
                onClick={handleBuild}
                className="px-4 py-1.5 rounded bg-[#558B78] text-white text-xs font-semibold hover:bg-[#467665] disabled:opacity-50"
              >
                {saving ? 'Building...' : 'Build Endpoint'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
