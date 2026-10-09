/**
 * pages/EstructuraPage.tsx
 * Red de promoción: el árbol de responsables de la campaña y sus metas.
 *
 * Es la vista que responde "¿quién responde por esta sección y cuánto lleva?".
 */
import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Swal from 'sweetalert2';
import { structureApi, territoriesApi, authApi, type StructureNode, type Goal } from '../services/api';
import { ROLE_LABEL } from '../types';
import { useAuth } from '../hooks/useAuth';

// Roles que tienen sentido dentro de la red de promoción.
const ROLES_RED = [
  'COORD_GENERAL', 'COORD_MUNICIPAL', 'COORD_SECCIONAL', 'PROMOTOR',
];

const COLOR_ROL: Record<string, string> = {
  COORD_GENERAL: '#8B1A26',
  COORD_MUNICIPAL: '#B45309',
  COORD_SECCIONAL: '#0F766E',
  PROMOTOR: '#4338CA',
};

const pct = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : `${Math.round(v * 100)}%`;

const semaforoDe = (avance: number | null | undefined) =>
  avance === null || avance === undefined ? '#94A3B8'
    : avance >= 1 ? '#15803D'
    : avance >= 0.6 ? '#CA8A04'
    : '#B91C1C';

// ───────────────────────────────────────────────────────────────────────────
// Fila del árbol
// ───────────────────────────────────────────────────────────────────────────
const NodoFila: React.FC<{
  nodo: StructureNode;
  nivel: number;
  onEditar: (n: StructureNode) => void;
  onEliminar: (n: StructureNode) => void;
  onAsignar: (n: StructureNode) => void;
}> = ({ nodo, nivel, onEditar, onEliminar, onAsignar }) => {
  const [abierto, setAbierto] = useState(nivel < 2);
  const hijos = nodo.children || [];
  const avance = nodo.avance;

  return (
    <>
      <tr className="border-b border-gray-50 hover:bg-slate-50/60 transition-colors">
        <td className="py-3 pr-3">
          <div className="flex items-center gap-2" style={{ paddingLeft: nivel * 22 }}>
            {hijos.length > 0 ? (
              <button
                onClick={() => setAbierto(!abierto)}
                className="w-5 h-5 rounded flex items-center justify-center text-slate-400 hover:bg-slate-200 shrink-0"
                aria-label={abierto ? 'Contraer' : 'Expandir'}
              >
                <i className={`fas fa-chevron-${abierto ? 'down' : 'right'} text-[10px]`} />
              </button>
            ) : (
              <span className="w-5 shrink-0" />
            )}
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ background: COLOR_ROL[nodo.rol] || '#64748B' }}
            />
            <div className="min-w-0">
              <p className="font-semibold text-sm text-slate-800 truncate">{nodo.nombre}</p>
              <p className="text-[11px] text-slate-400 truncate">
                {ROLE_LABEL[nodo.rol] || nodo.rol}
                {nodo.territory && ` · ${nodo.territory.name}`}
                {nodo.user && ` · @${nodo.user.username}`}
              </p>
            </div>
          </div>
        </td>

        <td className="py-3 px-2 text-center tabular-nums text-sm text-slate-700">
          {(nodo.personasDirectas ?? 0).toLocaleString('es-MX')}
        </td>
        <td className="py-3 px-2 text-center tabular-nums text-sm font-semibold text-slate-800">
          {(nodo.personasRama ?? 0).toLocaleString('es-MX')}
        </td>
        <td className="py-3 px-2 text-center tabular-nums text-sm text-slate-500">
          {(nodo.metaRama ?? 0).toLocaleString('es-MX')}
        </td>

        <td className="py-3 px-2">
          <div className="flex items-center gap-2 min-w-[110px]">
            <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(100, (avance ?? 0) * 100)}%`,
                  background: semaforoDe(avance),
                }}
              />
            </div>
            <span
              className="text-[11px] font-bold tabular-nums w-9 text-right"
              style={{ color: semaforoDe(avance) }}
            >
              {pct(avance)}
            </span>
          </div>
        </td>

        <td className="py-3 pl-2">
          <div className="flex items-center gap-1 justify-end">
            <button
              onClick={() => onAsignar(nodo)}
              className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-500 hover:bg-indigo-600 hover:text-white transition-all"
              title="Asignar personas"
            >
              <i className="fas fa-user-plus text-[11px]" />
            </button>
            <button
              onClick={() => onEditar(nodo)}
              className="w-7 h-7 rounded-lg bg-slate-50 text-slate-500 hover:bg-slate-700 hover:text-white transition-all"
              title="Editar"
            >
              <i className="fas fa-pen text-[11px]" />
            </button>
            <button
              onClick={() => onEliminar(nodo)}
              className="w-7 h-7 rounded-lg bg-red-50 text-red-400 hover:bg-red-600 hover:text-white transition-all"
              title="Eliminar"
            >
              <i className="fas fa-trash text-[11px]" />
            </button>
          </div>
        </td>
      </tr>

      {abierto && hijos.map(h => (
        <NodoFila
          key={h.id}
          nodo={h}
          nivel={nivel + 1}
          onEditar={onEditar}
          onEliminar={onEliminar}
          onAsignar={onAsignar}
        />
      ))}
    </>
  );
};

// ───────────────────────────────────────────────────────────────────────────
const EstructuraPage: React.FC = () => {
  const qc = useQueryClient();
  const { can } = useAuth();
  const [tab, setTab] = useState<'red' | 'metas' | 'huecos'>('red');
  const [modal, setModal] = useState<StructureNode | 'nuevo' | null>(null);
  const [asignando, setAsignando] = useState<StructureNode | null>(null);

  const { data: arbol = [], isLoading } = useQuery({
    queryKey: ['structure', 'tree'],
    queryFn: () => structureApi.tree(),
  });

  const { data: planos = [] } = useQuery({
    queryKey: ['structure', 'list'],
    queryFn: () => structureApi.list(),
  });

  const { data: territorios = [] } = useQuery({
    queryKey: ['territories', 'municipios-secciones'],
    queryFn: async () => {
      const [munis, secs] = await Promise.all([
        territoriesApi.list({ type: 'MUNICIPIO' }),
        territoriesApi.list({ type: 'SECCION' }),
      ]);
      return [...munis, ...secs];
    },
  });

  const { data: usuarios = [] } = useQuery({
    queryKey: ['users', 'para-estructura'],
    queryFn: () => authApi.listUsers(),
    enabled: can(3),
  });

  const { data: metas = [] } = useQuery({
    queryKey: ['structure', 'goals'],
    queryFn: () => structureApi.goals(),
    enabled: tab === 'metas',
  });

  const { data: huecos = [] } = useQuery({
    queryKey: ['structure', 'huecos'],
    queryFn: () => structureApi.huecos('SECCION', 100),
    enabled: tab === 'huecos',
  });

  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ['structure'] });
  };

  const guardar = useMutation({
    mutationFn: (datos: any) =>
      datos.id ? structureApi.update(datos.id, datos) : structureApi.create(datos),
    onSuccess: () => {
      refrescar();
      setModal(null);
      Swal.fire({ icon: 'success', title: 'Guardado', timer: 1400, showConfirmButton: false });
    },
    onError: (e: any) => Swal.fire({ icon: 'error', title: 'No se pudo guardar', text: e.message }),
  });

  const eliminar = useMutation({
    mutationFn: (id: string) => structureApi.delete(id),
    onSuccess: (r: any) => {
      refrescar();
      Swal.fire({
        icon: 'success',
        title: 'Nodo eliminado',
        text: r.personasLiberadas
          ? `${r.personasLiberadas} persona(s) quedaron sin promotor.`
          : undefined,
      });
    },
    onError: (e: any) => Swal.fire({ icon: 'error', title: 'No se pudo eliminar', text: e.message }),
  });

  // Totales del árbol completo, para la fila de KPIs.
  const totales = useMemo(() => {
    const acc = { nodos: planos.length, personas: 0, meta: 0 };
    for (const raiz of arbol) {
      acc.personas += raiz.personasRama ?? 0;
      acc.meta += raiz.metaRama ?? 0;
    }
    return { ...acc, avance: acc.meta > 0 ? acc.personas / acc.meta : null };
  }, [arbol, planos]);

  const confirmarEliminar = (n: StructureNode) => {
    Swal.fire({
      icon: 'warning',
      title: `¿Eliminar a ${n.nombre}?`,
      text: 'Las personas que tiene asignadas quedarán sin promotor, no se borran.',
      showCancelButton: true,
      confirmButtonText: 'Eliminar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#B91C1C',
    }).then(r => { if (r.isConfirmed) eliminar.mutate(n.id); });
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20">
      {/* Encabezado */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <h2 className="font-brand font-bold text-2xl text-gray-900 tracking-tight">
            Red de Promoción
          </h2>
          <p className="text-sm text-gray-400 mt-0.5">
            Quién responde por cada territorio y cuánto lleva de su meta
          </p>
        </div>
        {can(3) && (
          <button onClick={() => setModal('nuevo')} className="btn-primary py-2 h-10 text-xs">
            <i className="fas fa-plus mr-2" /> Agregar a la red
          </button>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { etq: 'Integrantes', val: totales.nodos.toLocaleString('es-MX'), icon: 'fa-sitemap', color: '#4338CA' },
          { etq: 'Simpatizantes', val: totales.personas.toLocaleString('es-MX'), icon: 'fa-users', color: '#0F766E' },
          { etq: 'Meta total', val: totales.meta.toLocaleString('es-MX'), icon: 'fa-bullseye', color: '#B45309' },
          { etq: 'Avance', val: pct(totales.avance), icon: 'fa-chart-line', color: semaforoDe(totales.avance) },
        ].map(k => (
          <div key={k.etq} className="bg-white p-4 rounded-2xl shadow-card border border-gray-50 flex items-center gap-3">
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: `${k.color}15`, color: k.color }}
            >
              <i className={`fas ${k.icon}`} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none mb-1">
                {k.etq}
              </p>
              <p className="text-xl font-brand font-bold text-slate-800 leading-none tabular-nums">
                {k.val}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Pestañas */}
      <div className="flex gap-2 border-b border-gray-100">
        {[
          { id: 'red', label: 'Árbol de la red', icon: 'fa-sitemap' },
          { id: 'metas', label: 'Metas', icon: 'fa-bullseye' },
          { id: 'huecos', label: 'Sin responsable', icon: 'fa-triangle-exclamation' },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as any)}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-lg transition-all flex items-center gap-2 ${
              tab === t.id
                ? 'bg-brand-primary text-white'
                : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            <i className={`fas ${t.icon}`} /> {t.label}
          </button>
        ))}
      </div>

      {/* ── Árbol ── */}
      {tab === 'red' && (
        <div className="bg-white rounded-2xl shadow-card border border-gray-50 overflow-hidden">
          {isLoading ? (
            <div className="p-16 text-center text-slate-300">
              <i className="fas fa-circle-notch fa-spin text-2xl" />
            </div>
          ) : arbol.length === 0 ? (
            <div className="p-16 text-center">
              <i className="fas fa-sitemap text-4xl text-slate-200 mb-4" />
              <p className="text-slate-500 font-semibold mb-1">La red aún no tiene integrantes</p>
              <p className="text-sm text-slate-400 mb-5">
                Empieza por el coordinador general y ve colgando de él a los municipales.
              </p>
              {can(3) && (
                <button onClick={() => setModal('nuevo')} className="btn-primary py-2 h-10 text-xs">
                  <i className="fas fa-plus mr-2" /> Agregar al primero
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-gray-100">
                    <th className="text-left py-3 pr-3 pl-4">Integrante</th>
                    <th className="text-center py-3 px-2">Propios</th>
                    <th className="text-center py-3 px-2">Rama</th>
                    <th className="text-center py-3 px-2">Meta</th>
                    <th className="text-left py-3 px-2">Avance</th>
                    <th className="py-3 pl-2 pr-4" />
                  </tr>
                </thead>
                <tbody>
                  {arbol.map(n => (
                    <NodoFila
                      key={n.id}
                      nodo={n}
                      nivel={0}
                      onEditar={setModal}
                      onEliminar={confirmarEliminar}
                      onAsignar={setAsignando}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Metas ── */}
      {tab === 'metas' && (
        <MetasPanel metas={metas} nodos={planos} territorios={territorios} onCambio={refrescar} can={can} />
      )}

      {/* ── Huecos ── */}
      {tab === 'huecos' && (
        <div className="bg-white rounded-2xl shadow-card border border-gray-50 overflow-hidden">
          <div className="p-4 border-b border-gray-50">
            <p className="text-sm font-semibold text-slate-800">
              Secciones sin responsable asignado
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              Ordenadas por lista nominal: arriba están las que más votos ponen en juego.
            </p>
          </div>
          {huecos.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-sm">
              <i className="fas fa-circle-check text-3xl text-green-200 mb-3 block" />
              Todas las secciones tienen responsable.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-gray-100">
                    <th className="text-left py-3 px-4">Sección</th>
                    <th className="text-right py-3 px-4">Lista nominal</th>
                    <th className="text-left py-3 px-4">Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {huecos.map((h: any) => (
                    <tr key={h.id} className="border-b border-gray-50 hover:bg-slate-50/60">
                      <td className="py-2.5 px-4 font-semibold text-slate-700">{h.name}</td>
                      <td className="py-2.5 px-4 text-right tabular-nums text-slate-600">
                        {(h.listaNominal ?? 0).toLocaleString('es-MX')}
                      </td>
                      <td className="py-2.5 px-4 text-slate-400 text-xs">{h.motivo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modales */}
      {modal && (
        <NodoModal
          nodo={modal === 'nuevo' ? null : modal}
          nodos={planos}
          territorios={territorios}
          usuarios={usuarios}
          onGuardar={(d) => guardar.mutate(d)}
          onCerrar={() => setModal(null)}
          guardando={guardar.isPending}
        />
      )}

      {asignando && (
        <AsignarModal
          nodo={asignando}
          onCerrar={() => setAsignando(null)}
          onListo={() => { setAsignando(null); refrescar(); }}
        />
      )}
    </div>
  );
};

// ───────────────────────────────────────────────────────────────────────────
// Modal de alta y edición
// ───────────────────────────────────────────────────────────────────────────
const NodoModal: React.FC<{
  nodo: StructureNode | null;
  nodos: StructureNode[];
  territorios: any[];
  usuarios: any[];
  onGuardar: (datos: any) => void;
  onCerrar: () => void;
  guardando: boolean;
}> = ({ nodo, nodos, territorios, usuarios, onGuardar, onCerrar, guardando }) => {
  const [f, setF] = useState({
    id: nodo?.id,
    nombre: nodo?.nombre || '',
    telefono: nodo?.telefono || '',
    email: nodo?.email || '',
    rol: nodo?.rol || 'PROMOTOR',
    parentId: nodo?.parentId || '',
    territoryId: nodo?.territoryId || '',
    userId: nodo?.userId || '',
    metaSimpatizantes: nodo?.metaSimpatizantes ?? 0,
  });

  const set = (k: string, v: any) => setF(s => ({ ...s, [k]: v }));

  // Un nodo no puede ser su propio superior.
  const posiblesPadres = nodos.filter(n => n.id !== nodo?.id);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-5 border-b border-gray-100 flex justify-between items-center">
          <h3 className="font-brand font-bold text-lg text-slate-800">
            {nodo ? 'Editar integrante' : 'Agregar a la red'}
          </h3>
          <button onClick={onCerrar} className="text-slate-300 hover:text-slate-600">
            <i className="fas fa-times" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Nombre completo *
            </label>
            <input
              value={f.nombre}
              onChange={e => set('nombre', e.target.value)}
              className="input-field mt-1"
              placeholder="Nombre de quien responde"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Rol en la red *
              </label>
              <select value={f.rol} onChange={e => set('rol', e.target.value)} className="input-field mt-1">
                {ROLES_RED.map(r => (
                  <option key={r} value={r}>{ROLE_LABEL[r] || r}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Meta de simpatizantes
              </label>
              <input
                type="number"
                min={0}
                value={f.metaSimpatizantes}
                onChange={e => set('metaSimpatizantes', Number(e.target.value))}
                className="input-field mt-1 tabular-nums"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Responde ante
            </label>
            <select value={f.parentId} onChange={e => set('parentId', e.target.value)} className="input-field mt-1">
              <option value="">— Nadie (raíz de la red) —</option>
              {posiblesPadres.map(n => (
                <option key={n.id} value={n.id}>
                  {'· '.repeat(n.depth)}{n.nombre} ({ROLE_LABEL[n.rol] || n.rol})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Territorio del que responde
            </label>
            <select
              value={f.territoryId}
              onChange={e => set('territoryId', e.target.value)}
              className="input-field mt-1"
            >
              <option value="">— Sin territorio —</option>
              <optgroup label="Municipios">
                {territorios.filter(t => t.type === 'MUNICIPIO').map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </optgroup>
              <optgroup label="Secciones">
                {territorios.filter(t => t.type === 'SECCION').map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name}{t.listaNominal ? ` — LN ${t.listaNominal.toLocaleString('es-MX')}` : ''}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Cuenta del sistema
            </label>
            <select value={f.userId} onChange={e => set('userId', e.target.value)} className="input-field mt-1">
              <option value="">— Sin cuenta (no entra a la plataforma) —</option>
              {usuarios.map((u: any) => (
                <option key={u.id} value={u.id}>{u.name} (@{u.username})</option>
              ))}
            </select>
            <p className="text-[11px] text-slate-400 mt-1">
              Ligar una cuenta hace que esa persona vea solo su rama al entrar.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Teléfono</label>
              <input value={f.telefono} onChange={e => set('telefono', e.target.value)} className="input-field mt-1" />
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Correo</label>
              <input value={f.email} onChange={e => set('email', e.target.value)} className="input-field mt-1" />
            </div>
          </div>
        </div>

        <div className="p-5 border-t border-gray-100 flex gap-3">
          <button onClick={onCerrar} className="btn-ghost flex-1 h-11 text-sm">Cancelar</button>
          <button
            onClick={() => onGuardar(f)}
            disabled={!f.nombre.trim() || guardando}
            className="btn-primary flex-1 h-11 text-sm disabled:opacity-40"
          >
            {guardando ? <i className="fas fa-circle-notch fa-spin" /> : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ───────────────────────────────────────────────────────────────────────────
// Modal para asignar personas a un promotor
// ───────────────────────────────────────────────────────────────────────────
const AsignarModal: React.FC<{
  nodo: StructureNode;
  onCerrar: () => void;
  onListo: () => void;
}> = ({ nodo, onCerrar, onListo }) => {
  const [seccion, setSeccion] = useState(nodo.territory?.type === 'SECCION' ? nodo.territory.code : '');
  const [enviando, setEnviando] = useState(false);

  const asignar = async () => {
    if (!seccion.trim()) return;
    setEnviando(true);
    try {
      // El servidor guarda la sección sin ceros a la izquierda en los datos
      // heredados, así que se manda tal cual la escribió el usuario.
      const r = await structureApi.asignar(nodo.id, { seccion: seccion.trim() });
      Swal.fire({
        icon: r.asignadas > 0 ? 'success' : 'info',
        title: r.asignadas > 0 ? 'Personas asignadas' : 'No se encontró a nadie',
        text: r.asignadas > 0
          ? `${r.asignadas} persona(s) de la sección ${seccion} ahora responden a ${nodo.nombre}.`
          : `No hay personas registradas con la sección ${seccion}.`,
      });
      if (r.asignadas > 0) onListo();
    } catch (e: any) {
      Swal.fire({ icon: 'error', title: 'No se pudo asignar', text: e.message });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="p-5 border-b border-gray-100">
          <h3 className="font-brand font-bold text-lg text-slate-800">Asignar personas</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Se asignarán a <strong className="text-slate-600">{nodo.nombre}</strong>
          </p>
        </div>

        <div className="p-5">
          <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            Sección electoral
          </label>
          <input
            value={seccion}
            onChange={e => setSeccion(e.target.value)}
            className="input-field mt-1 tabular-nums"
            placeholder="Ej. 467"
          />
          <p className="text-[11px] text-slate-400 mt-2">
            Todas las personas registradas en esa sección pasarán a responder a este promotor.
            Es la forma rápida de armar la red al inicio.
          </p>
        </div>

        <div className="p-5 border-t border-gray-100 flex gap-3">
          <button onClick={onCerrar} className="btn-ghost flex-1 h-11 text-sm">Cancelar</button>
          <button
            onClick={asignar}
            disabled={!seccion.trim() || enviando}
            className="btn-primary flex-1 h-11 text-sm disabled:opacity-40"
          >
            {enviando ? <i className="fas fa-circle-notch fa-spin" /> : 'Asignar'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ───────────────────────────────────────────────────────────────────────────
// Panel de metas
// ───────────────────────────────────────────────────────────────────────────
const MetasPanel: React.FC<{
  metas: Goal[];
  nodos: StructureNode[];
  territorios: any[];
  onCambio: () => void;
  can: (n: number) => boolean;
}> = ({ metas, nodos, territorios, onCambio, can }) => {
  const [nueva, setNueva] = useState(false);
  const [f, setF] = useState({ tipo: 'SIMPATIZANTES', target: 100, nodeId: '', territoryId: '', hasta: '' });

  const crear = async () => {
    try {
      await structureApi.createGoal({
        ...f,
        nodeId: f.nodeId || null,
        territoryId: f.territoryId || null,
        hasta: f.hasta || null,
      });
      setNueva(false);
      onCambio();
      Swal.fire({ icon: 'success', title: 'Meta creada', timer: 1400, showConfirmButton: false });
    } catch (e: any) {
      Swal.fire({ icon: 'error', title: 'No se pudo crear', text: e.message });
    }
  };

  const borrar = async (id: string) => {
    await structureApi.deleteGoal(id);
    onCambio();
  };

  const COLOR: Record<string, string> = {
    verde: '#15803D', amarillo: '#CA8A04', rojo: '#B91C1C', 'sin-meta': '#94A3B8',
  };

  return (
    <div className="space-y-4">
      {can(3) && (
        <div className="flex justify-end">
          <button onClick={() => setNueva(!nueva)} className="btn-ghost py-2 h-10 text-xs border border-gray-100 bg-white">
            <i className={`fas fa-${nueva ? 'times' : 'plus'} mr-2`} />
            {nueva ? 'Cancelar' : 'Nueva meta'}
          </button>
        </div>
      )}

      {nueva && (
        <div className="bg-white p-5 rounded-2xl shadow-card border border-gray-50 grid grid-cols-1 sm:grid-cols-5 gap-3 items-end">
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tipo</label>
            <select value={f.tipo} onChange={e => setF(s => ({ ...s, tipo: e.target.value }))} className="input-field mt-1">
              <option value="SIMPATIZANTES">Simpatizantes</option>
              <option value="COMPROMISOS">Compromisos de voto</option>
              <option value="VERIFICADOS">Verificados</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Meta</label>
            <input
              type="number" min={1} value={f.target}
              onChange={e => setF(s => ({ ...s, target: Number(e.target.value) }))}
              className="input-field mt-1 tabular-nums"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Responsable</label>
            <select value={f.nodeId} onChange={e => setF(s => ({ ...s, nodeId: e.target.value, territoryId: '' }))} className="input-field mt-1">
              <option value="">— Elegir —</option>
              {nodos.map(n => <option key={n.id} value={n.id}>{n.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">o Territorio</label>
            <select value={f.territoryId} onChange={e => setF(s => ({ ...s, territoryId: e.target.value, nodeId: '' }))} className="input-field mt-1">
              <option value="">— Elegir —</option>
              {territorios.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <button
            onClick={crear}
            disabled={!f.nodeId && !f.territoryId}
            className="btn-primary h-11 text-sm disabled:opacity-40"
          >
            Crear
          </button>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-card border border-gray-50 overflow-hidden">
        {metas.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm">
            <i className="fas fa-bullseye text-3xl text-slate-200 mb-3 block" />
            Aún no hay metas asignadas.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-gray-100">
                  <th className="text-left py-3 px-4">Responsable</th>
                  <th className="text-left py-3 px-4">Tipo</th>
                  <th className="text-right py-3 px-4">Logrado</th>
                  <th className="text-right py-3 px-4">Meta</th>
                  <th className="text-left py-3 px-4 w-40">Avance</th>
                  <th className="py-3 px-4" />
                </tr>
              </thead>
              <tbody>
                {metas.map(m => (
                  <tr key={m.id} className="border-b border-gray-50 hover:bg-slate-50/60">
                    <td className="py-3 px-4 font-semibold text-slate-700">
                      {m.node?.nombre || m.territory?.name || '—'}
                    </td>
                    <td className="py-3 px-4 text-slate-500 text-xs">{m.tipo}</td>
                    <td className="py-3 px-4 text-right tabular-nums font-semibold text-slate-800">
                      {m.logrado.toLocaleString('es-MX')}
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums text-slate-500">
                      {m.target.toLocaleString('es-MX')}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.min(100, (m.avance ?? 0) * 100)}%`,
                              background: COLOR[m.semaforo],
                            }}
                          />
                        </div>
                        <span className="text-[11px] font-bold tabular-nums w-9 text-right" style={{ color: COLOR[m.semaforo] }}>
                          {pct(m.avance)}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {can(3) && (
                        <button
                          onClick={() => borrar(m.id)}
                          className="w-7 h-7 rounded-lg bg-red-50 text-red-400 hover:bg-red-600 hover:text-white transition-all"
                          title="Eliminar meta"
                        >
                          <i className="fas fa-trash text-[11px]" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default EstructuraPage;
