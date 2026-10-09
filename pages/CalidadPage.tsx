/**
 * pages/CalidadPage.tsx
 * Control de calidad del padrón.
 *
 * Muestra qué registros están marcados y por qué, y quién los capturó.
 * Nada se borra automáticamente: cada marca la confirma o la descarta una
 * persona, y esa decisión queda en la bitácora.
 */
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Swal from 'sweetalert2';
import { qualityApi, type QualityFlag } from '../services/api';
import { useAuth } from '../hooks/useAuth';

// Qué significa cada marca, en lenguaje de campaña y no de base de datos.
const TIPOS: Record<string, { label: string; explica: string; icon: string }> = {
  RAFAGA: {
    label: 'Captura en ráfaga',
    explica: 'Muchos registros del mismo usuario en pocos minutos. Tocar puertas toma más tiempo.',
    icon: 'fa-bolt',
  },
  GPS_DUPLICADO: {
    label: 'Misma ubicación',
    explica: 'Varios registros con la coordenada exacta: suele indicar captura desde un escritorio.',
    icon: 'fa-location-dot',
  },
  FOTO_REPETIDA: {
    label: 'Foto reutilizada',
    explica: 'La misma imagen aparece en registros de personas distintas.',
    icon: 'fa-images',
  },
  TELEFONO_REPETIDO: {
    label: 'Teléfono compartido',
    explica: 'Un número en varias personas. Una familia es normal; veinte no.',
    icon: 'fa-phone',
  },
  TELEFONO_INVALIDO: {
    label: 'Teléfono no contactable',
    explica: 'El campo trae texto ("PENDIENTE") o un número incompleto. Esa persona no se puede movilizar.',
    icon: 'fa-phone-slash',
  },
  SECCION_INVALIDA: {
    label: 'Sección inexistente',
    explica: 'La sección declarada no está en el catálogo electoral de Campeche.',
    icon: 'fa-map-pin',
  },
  SECCION_INCOHERENTE: {
    label: 'Ubicación lejos de su sección',
    explica: 'El GPS capturado queda a kilómetros del centro de la sección declarada.',
    icon: 'fa-compass',
  },
  MUNICIPIO_INVALIDO: {
    label: 'Municipio incorrecto',
    explica: 'Se capturó una localidad en el campo de municipio.',
    icon: 'fa-city',
  },
};

const SEVERIDAD: Record<string, { color: string; bg: string; label: string }> = {
  ALTA: { color: '#B91C1C', bg: '#FEF2F2', label: 'Alta' },
  MEDIA: { color: '#B45309', bg: '#FFFBEB', label: 'Media' },
  BAJA: { color: '#0F766E', bg: '#F0FDFA', label: 'Baja' },
};

const ESTADO_LABEL: Record<string, string> = {
  PENDIENTE: 'Por revisar',
  CONFIRMADO: 'Confirmado',
  DESCARTADO: 'Descartado',
  CORREGIDO: 'Corregido',
};

const CalidadPage: React.FC = () => {
  const qc = useQueryClient();
  const { can } = useAuth();
  const [tab, setTab] = useState<'marcas' | 'capturistas'>('marcas');
  const [filtros, setFiltros] = useState({ tipo: '', severidad: '', estado: 'PENDIENTE', page: 1 });
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());

  const { data: resumen } = useQuery({
    queryKey: ['quality', 'resumen'],
    queryFn: () => qualityApi.resumen(),
  });

  const { data: flags, isLoading } = useQuery({
    queryKey: ['quality', 'flags', filtros],
    queryFn: () => qualityApi.flags({ ...filtros, limit: 25 }),
  });

  const { data: capturistas = [] } = useQuery({
    queryKey: ['quality', 'capturistas'],
    queryFn: () => qualityApi.capturistas(),
    enabled: tab === 'capturistas',
  });

  const refrescar = () => qc.invalidateQueries({ queryKey: ['quality'] });

  const analizar = useMutation({
    mutationFn: () => qualityApi.analizar(),
    onSuccess: (r: any) => {
      refrescar();
      Swal.fire({
        icon: r.total > 0 ? 'warning' : 'success',
        title: r.total > 0 ? `${r.total} marcas nuevas` : 'Sin problemas nuevos',
        html: r.total > 0
          ? `<div style="text-align:left;font-size:13px;line-height:1.7">
               ${r.rafagas ? `Capturas en ráfaga: <b>${r.rafagas}</b><br>` : ''}
               ${r.gpsDuplicado ? `Ubicación repetida: <b>${r.gpsDuplicado}</b><br>` : ''}
               ${r.fotosRepetidas ? `Fotos reutilizadas: <b>${r.fotosRepetidas}</b><br>` : ''}
               ${r.telefonosRepetidos ? `Teléfonos compartidos: <b>${r.telefonosRepetidos}</b><br>` : ''}
               ${r.telefonosInvalidos ? `Teléfonos no contactables: <b>${r.telefonosInvalidos}</b><br>` : ''}
               ${r.territorioInvalido ? `Territorio incorrecto: <b>${r.territorioInvalido}</b><br>` : ''}
               ${r.seccionIncoherente ? `Ubicación incoherente: <b>${r.seccionIncoherente}</b><br>` : ''}
             </div>`
          : 'El padrón no tiene problemas nuevos detectables.',
      });
    },
    onError: (e: any) => Swal.fire({ icon: 'error', title: 'Falló el análisis', text: e.message }),
  });

  const resolver = useMutation({
    mutationFn: ({ ids, estado }: { ids: string[]; estado: string }) =>
      ids.length === 1
        ? qualityApi.resolve(ids[0], estado)
        : qualityApi.bulkResolve(ids, estado),
    onSuccess: () => { refrescar(); setSeleccion(new Set()); },
    onError: (e: any) => Swal.fire({ icon: 'error', title: 'No se pudo guardar', text: e.message }),
  });

  const toggle = (id: string) => {
    setSeleccion(s => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const filas = flags?.data || [];
  const todasSeleccionadas = filas.length > 0 && filas.every(f => seleccion.has(f.id));

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20">
      {/* Encabezado */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <h2 className="font-brand font-bold text-2xl text-gray-900 tracking-tight">
            Calidad del Padrón
          </h2>
          <p className="text-sm text-gray-400 mt-0.5">
            Detecta captura inflada antes de que la meta se cumpla solo en pantalla
          </p>
        </div>
        {can(2) && (
          <button
            onClick={() => analizar.mutate()}
            disabled={analizar.isPending}
            className="btn-primary py-2 h-10 text-xs disabled:opacity-50"
          >
            <i className={`fas fa-magnifying-glass-chart mr-2 ${analizar.isPending ? 'fa-spin' : ''}`} />
            {analizar.isPending ? 'Analizando…' : 'Ejecutar análisis'}
          </button>
        )}
      </div>

      {/* KPIs */}
      {resumen && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              etq: 'Registros marcados',
              val: resumen.personasMarcadas.toLocaleString('es-MX'),
              sub: `de ${resumen.totalPadron.toLocaleString('es-MX')}`,
              color: '#B91C1C', icon: 'fa-flag',
            },
            {
              etq: 'Del padrón',
              val: `${(resumen.proporcionAfectada * 100).toFixed(1)}%`,
              sub: 'necesita revisión',
              color: '#B45309', icon: 'fa-percent',
            },
            {
              etq: 'Marcas totales',
              val: resumen.totalMarcas.toLocaleString('es-MX'),
              sub: 'un registro puede tener varias',
              color: '#4338CA', icon: 'fa-list-check',
            },
            {
              etq: 'Por revisar',
              val: (resumen.porEstado.find(e => e.estado === 'PENDIENTE')?.total ?? 0).toLocaleString('es-MX'),
              sub: 'sin resolver',
              color: '#0F766E', icon: 'fa-clock',
            },
          ].map(k => (
            <div key={k.etq} className="bg-white p-4 rounded-2xl shadow-card border border-gray-50">
              <div className="flex items-center gap-3">
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
                  <p className="text-[10px] text-slate-400 mt-1 truncate">{k.sub}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Desglose por tipo */}
      {resumen && resumen.porTipo.length > 0 && (
        <div className="bg-white p-5 rounded-2xl shadow-card border border-gray-50">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">
            Qué se encontró
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {resumen.porTipo.map(t => {
              const info = TIPOS[t.tipo];
              return (
                <button
                  key={t.tipo}
                  onClick={() => setFiltros(f => ({ ...f, tipo: f.tipo === t.tipo ? '' : t.tipo, page: 1 }))}
                  className={`text-left p-3 rounded-xl border transition-all ${
                    filtros.tipo === t.tipo
                      ? 'border-brand-primary bg-brand-primary/5'
                      : 'border-gray-100 hover:border-gray-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <i className={`fas ${info?.icon || 'fa-flag'} text-slate-400 mt-0.5 shrink-0`} />
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="font-bold text-sm text-slate-800 tabular-nums">{t.total}</span>
                        <span className="text-xs font-semibold text-slate-600 truncate">
                          {info?.label || t.tipo}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-snug mt-0.5">
                        {info?.explica || ''}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Pestañas */}
      <div className="flex gap-2 border-b border-gray-100">
        {[
          { id: 'marcas', label: 'Registros marcados', icon: 'fa-flag' },
          { id: 'capturistas', label: 'Confianza por capturista', icon: 'fa-user-shield' },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as any)}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-lg transition-all flex items-center gap-2 ${
              tab === t.id ? 'bg-brand-primary text-white' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            <i className={`fas ${t.icon}`} /> {t.label}
          </button>
        ))}
      </div>

      {/* ── Marcas ── */}
      {tab === 'marcas' && (
        <div className="bg-white rounded-2xl shadow-card border border-gray-50 overflow-hidden">
          {/* Filtros */}
          <div className="p-4 border-b border-gray-50 flex flex-wrap items-center gap-2">
            <select
              value={filtros.estado}
              onChange={e => setFiltros(f => ({ ...f, estado: e.target.value, page: 1 }))}
              className="input-field h-9 text-xs w-auto"
            >
              <option value="">Todos los estados</option>
              {Object.entries(ESTADO_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <select
              value={filtros.severidad}
              onChange={e => setFiltros(f => ({ ...f, severidad: e.target.value, page: 1 }))}
              className="input-field h-9 text-xs w-auto"
            >
              <option value="">Toda severidad</option>
              <option value="ALTA">Alta</option>
              <option value="MEDIA">Media</option>
              <option value="BAJA">Baja</option>
            </select>
            {filtros.tipo && (
              <button
                onClick={() => setFiltros(f => ({ ...f, tipo: '', page: 1 }))}
                className="h-9 px-3 rounded-lg bg-brand-primary/10 text-brand-primary text-xs font-bold flex items-center gap-2"
              >
                {TIPOS[filtros.tipo]?.label || filtros.tipo}
                <i className="fas fa-times text-[10px]" />
              </button>
            )}

            <div className="flex-1" />

            {seleccion.size > 0 && can(2) && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 font-medium">
                  {seleccion.size} seleccionada(s)
                </span>
                <button
                  onClick={() => resolver.mutate({ ids: [...seleccion], estado: 'CONFIRMADO' })}
                  className="h-9 px-3 rounded-lg bg-red-50 text-red-600 text-xs font-bold hover:bg-red-600 hover:text-white transition-all"
                >
                  Confirmar problema
                </button>
                <button
                  onClick={() => resolver.mutate({ ids: [...seleccion], estado: 'DESCARTADO' })}
                  className="h-9 px-3 rounded-lg bg-slate-100 text-slate-600 text-xs font-bold hover:bg-slate-700 hover:text-white transition-all"
                >
                  Descartar
                </button>
              </div>
            )}
          </div>

          {isLoading ? (
            <div className="p-16 text-center text-slate-300">
              <i className="fas fa-circle-notch fa-spin text-2xl" />
            </div>
          ) : filas.length === 0 ? (
            <div className="p-16 text-center">
              <i className="fas fa-circle-check text-4xl text-green-200 mb-4" />
              <p className="text-slate-500 font-semibold mb-1">Nada marcado con estos filtros</p>
              <p className="text-sm text-slate-400">
                {resumen?.totalMarcas === 0
                  ? 'Ejecuta el análisis para revisar el padrón.'
                  : 'Prueba cambiando el estado o la severidad.'}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-gray-100">
                      <th className="py-3 pl-4 pr-2 w-8">
                        <input
                          type="checkbox"
                          checked={todasSeleccionadas}
                          onChange={() => setSeleccion(
                            todasSeleccionadas ? new Set() : new Set(filas.map(f => f.id))
                          )}
                          className="rounded border-gray-300"
                        />
                      </th>
                      <th className="text-left py-3 px-2">Persona</th>
                      <th className="text-left py-3 px-2">Problema</th>
                      <th className="text-left py-3 px-2">Capturó</th>
                      <th className="text-left py-3 px-2">Estado</th>
                      <th className="py-3 px-4" />
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((f: QualityFlag) => {
                      const sev = SEVERIDAD[f.severidad] || SEVERIDAD.MEDIA;
                      const info = TIPOS[f.tipo];
                      return (
                        <tr key={f.id} className="border-b border-gray-50 hover:bg-slate-50/60">
                          <td className="py-3 pl-4 pr-2">
                            <input
                              type="checkbox"
                              checked={seleccion.has(f.id)}
                              onChange={() => toggle(f.id)}
                              className="rounded border-gray-300"
                            />
                          </td>
                          <td className="py-3 px-2">
                            <p className="font-semibold text-slate-800 text-sm">
                              {f.person?.name || '(registro eliminado)'}
                            </p>
                            <p className="text-[11px] text-slate-400">
                              {f.person?.seccion ? `Sección ${f.person.seccion}` : 'Sin sección'}
                              {f.person?.municipio && ` · ${f.person.municipio}`}
                            </p>
                          </td>
                          <td className="py-3 px-2">
                            <div className="flex items-center gap-2">
                              <span
                                className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide shrink-0"
                                style={{ background: sev.bg, color: sev.color }}
                              >
                                {sev.label}
                              </span>
                              <span className="text-xs font-semibold text-slate-700">
                                {info?.label || f.tipo}
                              </span>
                            </div>
                            {f.detalle && (
                              <p className="text-[11px] text-slate-400 mt-1 max-w-md">{f.detalle}</p>
                            )}
                          </td>
                          <td className="py-3 px-2 text-xs text-slate-500">
                            {f.capturadoPor || '—'}
                          </td>
                          <td className="py-3 px-2">
                            <span className={`text-[11px] font-bold ${
                              f.estado === 'PENDIENTE' ? 'text-amber-600'
                                : f.estado === 'CONFIRMADO' ? 'text-red-600'
                                : f.estado === 'CORREGIDO' ? 'text-green-600'
                                : 'text-slate-400'
                            }`}>
                              {ESTADO_LABEL[f.estado]}
                            </span>
                            {f.resueltoPor && (
                              <p className="text-[10px] text-slate-400">por {f.resueltoPor}</p>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">
                            {f.estado === 'PENDIENTE' && can(3) && (
                              <div className="flex gap-1 justify-end">
                                <button
                                  onClick={() => resolver.mutate({ ids: [f.id], estado: 'CONFIRMADO' })}
                                  className="w-7 h-7 rounded-lg bg-red-50 text-red-500 hover:bg-red-600 hover:text-white transition-all"
                                  title="Es un problema real"
                                >
                                  <i className="fas fa-check text-[11px]" />
                                </button>
                                <button
                                  onClick={() => resolver.mutate({ ids: [f.id], estado: 'DESCARTADO' })}
                                  className="w-7 h-7 rounded-lg bg-slate-50 text-slate-400 hover:bg-slate-600 hover:text-white transition-all"
                                  title="Falso positivo"
                                >
                                  <i className="fas fa-times text-[11px]" />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Paginación */}
              {flags && flags.pages > 1 && (
                <div className="p-4 border-t border-gray-50 flex justify-between items-center">
                  <span className="text-xs text-slate-500">
                    Página {flags.page} de {flags.pages} · {flags.total.toLocaleString('es-MX')} marcas
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setFiltros(f => ({ ...f, page: Math.max(1, f.page - 1) }))}
                      disabled={filtros.page === 1}
                      className="h-8 px-3 rounded-lg border border-gray-200 text-xs font-bold text-slate-600 disabled:opacity-40 hover:bg-slate-50"
                    >
                      Anterior
                    </button>
                    <button
                      onClick={() => setFiltros(f => ({ ...f, page: f.page + 1 }))}
                      disabled={filtros.page >= flags.pages}
                      className="h-8 px-3 rounded-lg border border-gray-200 text-xs font-bold text-slate-600 disabled:opacity-40 hover:bg-slate-50"
                    >
                      Siguiente
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Confianza por capturista ── */}
      {tab === 'capturistas' && (
        <div className="bg-white rounded-2xl shadow-card border border-gray-50 overflow-hidden">
          <div className="p-4 border-b border-gray-50">
            <p className="text-sm font-semibold text-slate-800">Índice de confianza</p>
            <p className="text-xs text-slate-400 mt-0.5">
              Qué proporción de lo que capturó cada quien quedó marcado. Es lo que distingue
              a quien trabaja de quien infla.
            </p>
          </div>
          {capturistas.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-sm">
              Aún no hay capturas suficientes para evaluar.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-gray-100">
                    <th className="text-left py-3 px-4">Usuario</th>
                    <th className="text-right py-3 px-4">Capturas</th>
                    <th className="text-right py-3 px-4">Marcadas</th>
                    <th className="text-left py-3 px-4 w-44">Confianza</th>
                    <th className="text-left py-3 px-4">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {capturistas.map(c => {
                    const color = c.nivel === 'CRÍTICO' ? '#B91C1C'
                      : c.nivel === 'REVISAR' ? '#B45309' : '#15803D';
                    return (
                      <tr key={c.usuario} className="border-b border-gray-50 hover:bg-slate-50/60">
                        <td className="py-3 px-4 font-semibold text-slate-700">{c.usuario}</td>
                        <td className="py-3 px-4 text-right tabular-nums text-slate-600">
                          {c.capturas.toLocaleString('es-MX')}
                        </td>
                        <td className="py-3 px-4 text-right tabular-nums text-slate-600">
                          {c.marcas.toLocaleString('es-MX')}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${c.confianza}%`, background: color }}
                              />
                            </div>
                            <span className="text-[11px] font-bold tabular-nums w-9 text-right" style={{ color }}>
                              {c.confianza}%
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className="text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wide"
                            style={{ background: `${color}15`, color }}
                          >
                            {c.nivel}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CalidadPage;
