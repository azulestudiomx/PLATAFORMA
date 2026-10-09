/**
 * pages/CampoPage.tsx
 * Operación en campo: brigadas, jornadas con geocerca y cobertura por sección.
 *
 * La jornada comprueba con GPS que la entrada ocurrió dentro del territorio
 * asignado, y registra también los "no estaba": son los que evitan que la
 * siguiente brigada vuelva a tocar la misma puerta.
 */
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Swal from 'sweetalert2';
import {
  brigadesApi, territoriesApi, structureApi, RESULTADOS_VISITA,
  type Brigade, type BrigadeShift,
} from '../services/api';
import { useAuth } from '../hooks/useAuth';

const ESTADO_JORNADA: Record<string, { label: string; color: string; bg: string }> = {
  PLANEADA: { label: 'Planeada', color: '#B45309', bg: '#FFFBEB' },
  EN_CURSO: { label: 'En curso', color: '#0F766E', bg: '#F0FDFA' },
  CERRADA: { label: 'Cerrada', color: '#475569', bg: '#F8FAFC' },
};

const colorResultado = (r: string) =>
  RESULTADOS_VISITA.find(x => x.valor === r)?.color || '#64748B';
const labelResultado = (r: string) =>
  RESULTADOS_VISITA.find(x => x.valor === r)?.label || r;

const CampoPage: React.FC = () => {
  const qc = useQueryClient();
  const { can } = useAuth();
  const [tab, setTab] = useState<'brigadas' | 'jornadas' | 'cobertura'>('brigadas');
  const [modalBrigada, setModalBrigada] = useState<Brigade | 'nueva' | null>(null);
  const [jornadaAbierta, setJornadaAbierta] = useState<string | null>(null);

  const { data: brigadas = [], isLoading } = useQuery({
    queryKey: ['brigades'],
    queryFn: () => brigadesApi.list(),
  });

  const { data: jornadas = [] } = useQuery({
    queryKey: ['brigades', 'shifts'],
    queryFn: () => brigadesApi.shifts(),
    enabled: tab === 'jornadas',
  });

  const { data: cobertura = [] } = useQuery({
    queryKey: ['brigades', 'cobertura'],
    queryFn: () => brigadesApi.cobertura(),
    enabled: tab === 'cobertura',
  });

  const { data: secciones = [] } = useQuery({
    queryKey: ['territories', 'secciones'],
    queryFn: () => territoriesApi.list({ type: 'SECCION' }),
  });

  const { data: nodos = [] } = useQuery({
    queryKey: ['structure', 'list'],
    queryFn: () => structureApi.list(),
    enabled: can(4),
  });

  const refrescar = () => qc.invalidateQueries({ queryKey: ['brigades'] });

  const guardar = useMutation({
    mutationFn: (d: any) => d.id ? brigadesApi.update(d.id, d) : brigadesApi.create(d),
    onSuccess: () => {
      refrescar(); setModalBrigada(null);
      Swal.fire({ icon: 'success', title: 'Guardado', timer: 1300, showConfirmButton: false });
    },
    onError: (e: any) => Swal.fire({ icon: 'error', title: 'No se pudo guardar', text: e.message }),
  });

  const nuevaJornada = useMutation({
    mutationFn: (d: any) => brigadesApi.createShift(d),
    onSuccess: () => {
      refrescar(); setTab('jornadas');
      Swal.fire({ icon: 'success', title: 'Jornada creada', timer: 1300, showConfirmButton: false });
    },
    onError: (e: any) => Swal.fire({ icon: 'error', title: 'No se pudo crear', text: e.message }),
  });

  /** Pide el GPS del dispositivo y registra la entrada. */
  const hacerCheckIn = async (jornada: BrigadeShift) => {
    if (!navigator.geolocation) {
      Swal.fire({ icon: 'error', title: 'Sin GPS', text: 'Este dispositivo no permite ubicación.' });
      return;
    }
    Swal.fire({ title: 'Obteniendo ubicación…', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

    navigator.geolocation.getCurrentPosition(
      async pos => {
        try {
          const r = await brigadesApi.checkIn(jornada.id, pos.coords.latitude, pos.coords.longitude);
          refrescar();
          Swal.fire({
            icon: r.dentroDeZona ? 'success' : 'warning',
            title: r.dentroDeZona ? 'Entrada registrada' : 'Entrada fuera de zona',
            text: r.dentroDeZona
              ? `Dentro del territorio asignado (${r.geocerca?.km ?? 0} km del centro).`
              : r.aviso,
            footer: r.dentroDeZona ? undefined
              : 'Se registró de todos modos. Un coordinador puede revisarlo.',
          });
        } catch (e: any) {
          Swal.fire({ icon: 'error', title: 'No se pudo registrar', text: e.message });
        }
      },
      err => Swal.fire({ icon: 'error', title: 'Sin ubicación', text: err.message }),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  const hacerCheckOut = async (jornada: BrigadeShift) => {
    const { value: resumen, isConfirmed } = await Swal.fire({
      title: 'Cerrar jornada',
      input: 'textarea',
      inputLabel: 'Resumen de lo que se hizo (opcional)',
      inputPlaceholder: 'Cómo estuvo el recorrido, incidencias…',
      showCancelButton: true,
      confirmButtonText: 'Cerrar jornada',
      cancelButtonText: 'Cancelar',
    });
    if (!isConfirmed) return;

    const enviar = async (lat?: number, lng?: number) => {
      try {
        const r = await brigadesApi.checkOut(jornada.id, { lat, lng, resumen });
        refrescar();
        Swal.fire({
          icon: 'success',
          title: 'Jornada cerrada',
          html: `<div style="font-size:13px;line-height:1.8">
                   Visitas: <b>${r.visitas}</b><br>
                   Horas en campo: <b>${r.horasEnCampo}</b><br>
                   ${r.cumplimientoMeta !== null
                     ? `Cumplimiento de meta: <b>${Math.round(r.cumplimientoMeta * 100)}%</b>` : ''}
                 </div>`,
        });
      } catch (e: any) {
        Swal.fire({ icon: 'error', title: 'No se pudo cerrar', text: e.message });
      }
    };

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        p => enviar(p.coords.latitude, p.coords.longitude),
        () => enviar(),
        { timeout: 8000 }
      );
    } else {
      enviar();
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <h2 className="font-brand font-bold text-2xl text-gray-900 tracking-tight">
            Operación en Campo
          </h2>
          <p className="text-sm text-gray-400 mt-0.5">
            Brigadas, jornadas con verificación de ubicación y cobertura del territorio
          </p>
        </div>
        {can(4) && (
          <button onClick={() => setModalBrigada('nueva')} className="btn-primary py-2 h-10 text-xs">
            <i className="fas fa-plus mr-2" /> Nueva brigada
          </button>
        )}
      </div>

      <div className="flex gap-2 border-b border-gray-100">
        {[
          { id: 'brigadas', label: 'Brigadas', icon: 'fa-people-group' },
          { id: 'jornadas', label: 'Jornadas', icon: 'fa-clipboard-check' },
          { id: 'cobertura', label: 'Cobertura', icon: 'fa-map-location-dot' },
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

      {/* ── Brigadas ── */}
      {tab === 'brigadas' && (
        isLoading ? (
          <div className="p-16 text-center text-slate-300 bg-white rounded-2xl">
            <i className="fas fa-circle-notch fa-spin text-2xl" />
          </div>
        ) : brigadas.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-card border border-gray-50 p-16 text-center">
            <i className="fas fa-people-group text-4xl text-slate-200 mb-4" />
            <p className="text-slate-500 font-semibold mb-1">Aún no hay brigadas</p>
            <p className="text-sm text-slate-400 mb-5">
              Una brigada es el equipo que sale a territorio, con su jefe y su zona asignada.
            </p>
            {can(4) && (
              <button onClick={() => setModalBrigada('nueva')} className="btn-primary py-2 h-10 text-xs">
                <i className="fas fa-plus mr-2" /> Crear la primera
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {brigadas.map(b => (
              <div key={b.id} className="bg-white rounded-2xl shadow-card border border-gray-50 p-5">
                <div className="flex justify-between items-start mb-3">
                  <div className="min-w-0">
                    <h3 className="font-brand font-bold text-slate-800 truncate">{b.nombre}</h3>
                    <p className="text-[11px] text-slate-400 truncate">
                      {b.territory?.name || 'Sin territorio'}
                      {b.vehiculo && ` · ${b.vehiculo}`}
                    </p>
                  </div>
                  {!b.activa && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 shrink-0">
                      INACTIVA
                    </span>
                  )}
                </div>

                <div className="flex gap-4 text-xs mb-3">
                  <div>
                    <p className="text-slate-400 text-[10px] uppercase tracking-wider">Integrantes</p>
                    <p className="font-bold text-slate-700 tabular-nums">{b.integrantes.length}</p>
                  </div>
                  <div>
                    <p className="text-slate-400 text-[10px] uppercase tracking-wider">Jornadas</p>
                    <p className="font-bold text-slate-700 tabular-nums">{b._count?.jornadas ?? 0}</p>
                  </div>
                  <div>
                    <p className="text-slate-400 text-[10px] uppercase tracking-wider">Visitas</p>
                    <p className="font-bold text-slate-700 tabular-nums">{b._count?.visitas ?? 0}</p>
                  </div>
                </div>

                {b.ultimaJornada && (
                  <p className="text-[11px] text-slate-400 mb-3">
                    Última jornada: {new Date(b.ultimaJornada.fecha).toLocaleDateString('es-MX')}
                    {' · '}
                    <span style={{ color: ESTADO_JORNADA[b.ultimaJornada.estado]?.color }}>
                      {ESTADO_JORNADA[b.ultimaJornada.estado]?.label}
                    </span>
                  </p>
                )}

                <div className="flex gap-2">
                  {can(4) && (
                    <>
                      <button
                        onClick={() => nuevaJornada.mutate({ brigadeId: b.id, metaVisitas: 20 })}
                        className="flex-1 h-9 rounded-lg bg-brand-primary/10 text-brand-primary text-xs font-bold hover:bg-brand-primary hover:text-white transition-all"
                      >
                        <i className="fas fa-play mr-1.5" /> Nueva jornada
                      </button>
                      <button
                        onClick={() => setModalBrigada(b)}
                        className="w-9 h-9 rounded-lg bg-slate-50 text-slate-500 hover:bg-slate-700 hover:text-white transition-all"
                        title="Editar"
                      >
                        <i className="fas fa-pen text-[11px]" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* ── Jornadas ── */}
      {tab === 'jornadas' && (
        <div className="bg-white rounded-2xl shadow-card border border-gray-50 overflow-hidden">
          {jornadas.length === 0 ? (
            <div className="p-16 text-center text-slate-400 text-sm">
              <i className="fas fa-clipboard-check text-3xl text-slate-200 mb-3 block" />
              Aún no hay jornadas registradas.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-gray-100">
                    <th className="text-left py-3 px-4">Brigada</th>
                    <th className="text-left py-3 px-2">Fecha</th>
                    <th className="text-left py-3 px-2">Zona</th>
                    <th className="text-center py-3 px-2">Visitas</th>
                    <th className="text-center py-3 px-2">Horas</th>
                    <th className="text-left py-3 px-2">Estado</th>
                    <th className="py-3 px-4" />
                  </tr>
                </thead>
                <tbody>
                  {jornadas.map(j => {
                    const est = ESTADO_JORNADA[j.estado] || ESTADO_JORNADA.PLANEADA;
                    return (
                      <React.Fragment key={j.id}>
                        <tr className="border-b border-gray-50 hover:bg-slate-50/60">
                          <td className="py-3 px-4 font-semibold text-slate-700">
                            {j.brigade?.nombre}
                          </td>
                          <td className="py-3 px-2 text-slate-500 text-xs tabular-nums">
                            {new Date(j.fecha).toLocaleDateString('es-MX')}
                          </td>
                          <td className="py-3 px-2 text-xs">
                            <span className="text-slate-600">{j.territory?.name || '—'}</span>
                            {j.checkInAt && (
                              <span
                                className="ml-2 text-[10px] font-bold"
                                style={{ color: j.dentroDeZona ? '#15803D' : '#B91C1C' }}
                                title={j.dentroDeZona
                                  ? 'Entrada dentro del territorio'
                                  : `Entrada a ${j.checkInKm} km del centro`}
                              >
                                <i className={`fas fa-location-${j.dentroDeZona ? 'check' : 'crosshairs'}`} />
                                {!j.dentroDeZona && ` ${j.checkInKm} km`}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-2 text-center tabular-nums font-semibold text-slate-800">
                            {j._count?.visitas ?? 0}
                            {j.metaVisitas > 0 && (
                              <span className="text-slate-300 font-normal"> / {j.metaVisitas}</span>
                            )}
                          </td>
                          <td className="py-3 px-2 text-center tabular-nums text-slate-500">
                            {j.horasEnCampo ?? '—'}
                          </td>
                          <td className="py-3 px-2">
                            <span
                              className="text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wide"
                              style={{ background: est.bg, color: est.color }}
                            >
                              {est.label}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            {j.estado === 'PLANEADA' && (
                              <button
                                onClick={() => hacerCheckIn(j)}
                                className="h-8 px-3 rounded-lg bg-teal-50 text-teal-700 text-xs font-bold hover:bg-teal-600 hover:text-white transition-all"
                              >
                                <i className="fas fa-location-arrow mr-1.5" /> Entrada
                              </button>
                            )}
                            {j.estado === 'EN_CURSO' && (
                              <div className="flex gap-1.5 justify-end">
                                <button
                                  onClick={() => setJornadaAbierta(jornadaAbierta === j.id ? null : j.id)}
                                  className="h-8 px-3 rounded-lg bg-indigo-50 text-indigo-600 text-xs font-bold hover:bg-indigo-600 hover:text-white transition-all"
                                >
                                  <i className="fas fa-house-user mr-1.5" /> Visita
                                </button>
                                <button
                                  onClick={() => hacerCheckOut(j)}
                                  className="h-8 px-3 rounded-lg bg-slate-100 text-slate-600 text-xs font-bold hover:bg-slate-700 hover:text-white transition-all"
                                >
                                  Cerrar
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                        {jornadaAbierta === j.id && (
                          <tr>
                            <td colSpan={7} className="bg-slate-50/80 px-4 py-4">
                              <RegistroVisita
                                shift={j}
                                secciones={secciones}
                                onListo={() => { refrescar(); }}
                              />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Cobertura ── */}
      {tab === 'cobertura' && (
        <div className="bg-white rounded-2xl shadow-card border border-gray-50 overflow-hidden">
          <div className="p-4 border-b border-gray-50">
            <p className="text-sm font-semibold text-slate-800">Cobertura por sección</p>
            <p className="text-xs text-slate-400 mt-0.5">
              Visitas hechas contra lista nominal, y qué proporción terminó en contacto efectivo.
            </p>
          </div>
          {cobertura.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-sm">
              Todavía no hay visitas registradas.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-gray-100">
                    <th className="text-left py-3 px-4">Sección</th>
                    <th className="text-left py-3 px-2">Tipo</th>
                    <th className="text-right py-3 px-2">Visitas</th>
                    <th className="text-right py-3 px-2">Contactados</th>
                    <th className="text-left py-3 px-2 w-32">Tasa de contacto</th>
                    <th className="text-right py-3 px-4">Lista nominal</th>
                  </tr>
                </thead>
                <tbody>
                  {cobertura.map((c: any) => (
                    <tr key={c.territoryId} className="border-b border-gray-50 hover:bg-slate-50/60">
                      <td className="py-3 px-4 font-semibold text-slate-700 tabular-nums">{c.seccion}</td>
                      <td className="py-3 px-2 text-xs text-slate-400">{c.tipoSeccion || '—'}</td>
                      <td className="py-3 px-2 text-right tabular-nums text-slate-700">{c.visitas}</td>
                      <td className="py-3 px-2 text-right tabular-nums text-slate-700">{c.contactados}</td>
                      <td className="py-3 px-2">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-teal-600"
                              style={{ width: `${Math.min(100, (c.tasaContacto ?? 0) * 100)}%` }}
                            />
                          </div>
                          <span className="text-[11px] font-bold tabular-nums w-9 text-right text-teal-700">
                            {c.tasaContacto !== null ? `${Math.round(c.tasaContacto * 100)}%` : '—'}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums text-slate-500">
                        {(c.listaNominal ?? 0).toLocaleString('es-MX')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {modalBrigada && (
        <BrigadaModal
          brigada={modalBrigada === 'nueva' ? null : modalBrigada}
          secciones={secciones}
          nodos={nodos}
          onGuardar={d => guardar.mutate(d)}
          onCerrar={() => setModalBrigada(null)}
          guardando={guardar.isPending}
        />
      )}
    </div>
  );
};

// ───────────────────────────────────────────────────────────────────────────
// Registro rápido de visita, dentro de la jornada en curso
// ───────────────────────────────────────────────────────────────────────────
const RegistroVisita: React.FC<{
  shift: BrigadeShift;
  secciones: any[];
  onListo: () => void;
}> = ({ shift, secciones, onListo }) => {
  const [f, setF] = useState({
    resultado: 'CONTACTADO',
    direccion: '',
    seccion: shift.territory?.code?.replace(/^0+/, '') || '',
    notas: '',
  });
  const [enviando, setEnviando] = useState(false);
  const [ultimas, setUltimas] = useState<string[]>([]);

  const registrar = async () => {
    setEnviando(true);
    try {
      const enviar = async (lat?: number, lng?: number) => {
        await brigadesApi.createVisit({
          shiftId: shift.id,
          brigadeId: shift.brigadeId,
          resultado: f.resultado,
          direccion: f.direccion || null,
          seccion: f.seccion || null,
          notas: f.notas || null,
          lat, lng,
        });
        setUltimas(u => [`${labelResultado(f.resultado)} — ${f.direccion || 's/dirección'}`, ...u].slice(0, 5));
        setF(s => ({ ...s, direccion: '', notas: '' }));
        onListo();
      };

      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          async p => { await enviar(p.coords.latitude, p.coords.longitude); setEnviando(false); },
          async () => { await enviar(); setEnviando(false); },
          { timeout: 6000 }
        );
      } else {
        await enviar();
        setEnviando(false);
      }
    } catch (e: any) {
      Swal.fire({ icon: 'error', title: 'No se pudo registrar', text: e.message });
      setEnviando(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
        Registrar visita
      </p>

      {/* El resultado se elige primero: es lo que cambia en cada puerta. */}
      <div className="flex flex-wrap gap-1.5">
        {RESULTADOS_VISITA.map(r => (
          <button
            key={r.valor}
            onClick={() => setF(s => ({ ...s, resultado: r.valor }))}
            className="px-3 h-8 rounded-lg text-xs font-bold transition-all border"
            style={f.resultado === r.valor
              ? { background: r.color, color: '#fff', borderColor: r.color }
              : { background: '#fff', color: r.color, borderColor: '#E2E8F0' }}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
        <input
          value={f.direccion}
          onChange={e => setF(s => ({ ...s, direccion: e.target.value }))}
          placeholder="Calle y número"
          className="input-field h-10 text-sm sm:col-span-2"
        />
        <input
          value={f.seccion}
          onChange={e => setF(s => ({ ...s, seccion: e.target.value }))}
          placeholder="Sección"
          className="input-field h-10 text-sm tabular-nums"
        />
        <button
          onClick={registrar}
          disabled={enviando}
          className="btn-primary h-10 text-sm disabled:opacity-50"
        >
          {enviando ? <i className="fas fa-circle-notch fa-spin" /> : 'Registrar'}
        </button>
      </div>

      {ultimas.length > 0 && (
        <div className="text-[11px] text-slate-500 space-y-0.5">
          <p className="font-bold text-slate-400 uppercase tracking-wider text-[10px]">
            Registradas en esta sesión
          </p>
          {ultimas.map((u, i) => (
            <p key={i}><i className="fas fa-check text-green-500 mr-1.5" />{u}</p>
          ))}
        </div>
      )}
    </div>
  );
};

// ───────────────────────────────────────────────────────────────────────────
const BrigadaModal: React.FC<{
  brigada: Brigade | null;
  secciones: any[];
  nodos: any[];
  onGuardar: (d: any) => void;
  onCerrar: () => void;
  guardando: boolean;
}> = ({ brigada, secciones, nodos, onGuardar, onCerrar, guardando }) => {
  const [f, setF] = useState({
    id: brigada?.id,
    nombre: brigada?.nombre || '',
    vehiculo: brigada?.vehiculo || '',
    territoryId: brigada?.territoryId || '',
    jefeId: brigada?.jefeId || '',
    activa: brigada?.activa ?? true,
  });
  const [integrantes, setIntegrantes] = useState<{ nombre: string; rol: string }[]>(
    brigada?.integrantes.map(i => ({ nombre: i.nombre, rol: i.rol })) || []
  );
  const [nuevo, setNuevo] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-5 border-b border-gray-100 flex justify-between items-center">
          <h3 className="font-brand font-bold text-lg text-slate-800">
            {brigada ? 'Editar brigada' : 'Nueva brigada'}
          </h3>
          <button onClick={onCerrar} className="text-slate-300 hover:text-slate-600">
            <i className="fas fa-times" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Nombre *</label>
            <input
              value={f.nombre}
              onChange={e => setF(s => ({ ...s, nombre: e.target.value }))}
              className="input-field mt-1"
              placeholder="Ej. Brigada Norte"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Zona asignada</label>
              <select
                value={f.territoryId}
                onChange={e => setF(s => ({ ...s, territoryId: e.target.value }))}
                className="input-field mt-1"
              >
                <option value="">— Sin zona —</option>
                {secciones.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name}{t.tipoSeccion ? ` (${t.tipoSeccion})` : ''}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-slate-400 mt-1">
                Define la geocerca que valida la entrada.
              </p>
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Vehículo</label>
              <input
                value={f.vehiculo}
                onChange={e => setF(s => ({ ...s, vehiculo: e.target.value }))}
                className="input-field mt-1"
                placeholder="Placas o descripción"
              />
            </div>
          </div>

          {nodos.length > 0 && (
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Jefe de brigada</label>
              <select
                value={f.jefeId}
                onChange={e => setF(s => ({ ...s, jefeId: e.target.value }))}
                className="input-field mt-1"
              >
                <option value="">— Sin asignar —</option>
                {nodos.map((n: any) => (
                  <option key={n.id} value={n.id}>{n.nombre}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Integrantes</label>
            <div className="flex gap-2 mt-1">
              <input
                value={nuevo}
                onChange={e => setNuevo(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && nuevo.trim()) {
                    setIntegrantes(i => [...i, { nombre: nuevo.trim(), rol: 'BRIGADISTA' }]);
                    setNuevo('');
                  }
                }}
                className="input-field flex-1"
                placeholder="Nombre y Enter para agregar"
              />
              <button
                type="button"
                onClick={() => {
                  if (!nuevo.trim()) return;
                  setIntegrantes(i => [...i, { nombre: nuevo.trim(), rol: 'BRIGADISTA' }]);
                  setNuevo('');
                }}
                className="btn-ghost px-4 h-11 text-sm border border-gray-100"
              >
                <i className="fas fa-plus" />
              </button>
            </div>
            {integrantes.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {integrantes.map((i, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-xs text-slate-600"
                  >
                    {i.nombre}
                    <button
                      onClick={() => setIntegrantes(list => list.filter((_, x) => x !== idx))}
                      className="text-slate-400 hover:text-red-600"
                    >
                      <i className="fas fa-times text-[10px]" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="p-5 border-t border-gray-100 flex gap-3">
          <button onClick={onCerrar} className="btn-ghost flex-1 h-11 text-sm">Cancelar</button>
          <button
            onClick={() => onGuardar({ ...f, integrantes })}
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

export default CampoPage;
