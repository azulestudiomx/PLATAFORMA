/**
 * pages/MensajeriaPage.tsx
 * Mensajería masiva segmentada.
 *
 * El envío es siempre un paso aparte y explícito: primero se ve a cuántos
 * llegaría y cómo se vería el mensaje, luego se prepara la lista, y solo al
 * final se dispara. Sin credenciales de proveedor no sale ningún mensaje, y
 * la interfaz lo dice antes de que alguien crea que sí se envió.
 */
import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Swal from 'sweetalert2';
import { messagingApi, peopleApi, type MessageCampaign, type VistaPrevia } from '../services/api';
import { useAuth } from '../hooks/useAuth';

const CANALES = [
  { valor: 'WHATSAPP', label: 'WhatsApp', icon: 'fa-whatsapp', marca: 'fab' },
  { valor: 'SMS', label: 'SMS', icon: 'fa-comment-sms', marca: 'fas' },
  { valor: 'EMAIL', label: 'Correo', icon: 'fa-envelope', marca: 'fas' },
];

const ESTADO: Record<string, { label: string; color: string; bg: string }> = {
  BORRADOR: { label: 'Borrador', color: '#64748B', bg: '#F8FAFC' },
  LISTA: { label: 'Lista para enviar', color: '#B45309', bg: '#FFFBEB' },
  ENVIANDO: { label: 'Enviando', color: '#0F766E', bg: '#F0FDFA' },
  ENVIADA: { label: 'Enviada', color: '#15803D', bg: '#F0FDF4' },
  CANCELADA: { label: 'Cancelada', color: '#B91C1C', bg: '#FEF2F2' },
};

const MensajeriaPage: React.FC = () => {
  const qc = useQueryClient();
  const { can } = useAuth();
  const [editando, setEditando] = useState<MessageCampaign | 'nueva' | null>(null);

  const { data: campanas = [], isLoading } = useQuery({
    queryKey: ['messaging'],
    queryFn: () => messagingApi.list(),
  });

  const { data: proveedores } = useQuery({
    queryKey: ['messaging', 'proveedores'],
    queryFn: () => messagingApi.proveedores(),
  });

  const refrescar = () => qc.invalidateQueries({ queryKey: ['messaging'] });

  const preparar = useMutation({
    mutationFn: (id: string) => messagingApi.preparar(id),
    onSuccess: (r: any) => {
      refrescar();
      Swal.fire({
        icon: 'success',
        title: `${r.destinatarios} destinatarios`,
        html: `<div style="text-align:left;font-size:13px;line-height:1.8">
                 ${r.descartados > 0
                   ? `Se descartaron <b>${r.descartados}</b>:<br>${
                       Object.entries(r.motivosDescarte)
                         .map(([m, n]) => `· ${m}: ${n}`).join('<br>')}<br><br>`
                   : ''}
                 ${r.muestra?.length
                   ? `<b>Así se vería:</b><br><i>${r.muestra[0].cuerpo}</i>` : ''}
               </div>`,
      });
    },
    onError: (e: any) => Swal.fire({ icon: 'error', title: 'No se pudo preparar', text: e.message }),
  });

  const enviar = async (c: MessageCampaign) => {
    const sinProveedor = !proveedores?.[c.canal]?.configurado;

    const { isConfirmed } = await Swal.fire({
      icon: sinProveedor ? 'info' : 'warning',
      title: sinProveedor ? 'Sin proveedor configurado' : `¿Enviar a ${c.totalDestinatarios} personas?`,
      html: sinProveedor
        ? `<div style="text-align:left;font-size:13px;line-height:1.7">
             No se enviará ningún mensaje: falta configurar el proveedor de
             <b>${c.canal}</b> en el servidor.<br><br>
             Hacen falta estas variables:<br>
             <code>${(proveedores?.[c.canal]?.requiere || []).join('</code>, <code>')}</code><br><br>
             La lista de destinatarios queda preparada para cuando se configure.
           </div>`
        : `<div style="text-align:left;font-size:13px;line-height:1.7">
             Se enviarán <b>${c.totalDestinatarios}</b> mensajes por <b>${c.canal}</b>.<br><br>
             <b>Esto no se puede deshacer.</b>
           </div>`,
      showCancelButton: true,
      confirmButtonText: sinProveedor ? 'Entendido, continuar' : 'Sí, enviar ahora',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: sinProveedor ? '#0F766E' : '#B91C1C',
    });
    if (!isConfirmed) return;

    try {
      const r = await messagingApi.enviar(c.id);
      refrescar();
      Swal.fire({
        icon: r.simulado ? 'info' : 'success',
        title: r.simulado ? 'No se envió nada' : 'Mensajes enviados',
        text: r.mensaje || `Enviados: ${r.enviados}`,
      });
    } catch (e: any) {
      Swal.fire({ icon: 'error', title: 'No se pudo enviar', text: e.message });
    }
  };

  const algunConfigurado = proveedores && Object.values(proveedores).some(p => p.configurado);

  if (editando) {
    return (
      <Editor
        campana={editando === 'nueva' ? null : editando}
        onCerrar={() => { setEditando(null); refrescar(); }}
      />
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <h2 className="font-brand font-bold text-2xl text-gray-900 tracking-tight">Mensajería</h2>
          <p className="text-sm text-gray-400 mt-0.5">
            Envíos segmentados desde el padrón, con vista previa antes de disparar
          </p>
        </div>
        {can(3) && (
          <button onClick={() => setEditando('nueva')} className="btn-primary py-2 h-10 text-xs">
            <i className="fas fa-plus mr-2" /> Nueva campaña
          </button>
        )}
      </div>

      {/* Estado de los proveedores: mejor decirlo desde el principio. */}
      {proveedores && !algunConfigurado && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-3">
          <i className="fas fa-circle-info text-amber-600 mt-0.5" />
          <div className="text-sm text-amber-900">
            <p className="font-semibold mb-1">Ningún proveedor está configurado todavía</p>
            <p className="text-xs leading-relaxed text-amber-800">
              Puedes armar campañas, segmentar y ver exactamente a cuántas personas llegarían,
              pero <strong>no se enviará ningún mensaje</strong> hasta que se configuren las
              credenciales en el servidor. Se necesita, según el canal:{' '}
              {Object.entries(proveedores).map(([canal, p]) => (
                <span key={canal} className="inline-block mr-3">
                  <strong>{canal}</strong>: <code className="text-[11px]">{p.requiere.join(', ')}</code>
                </span>
              ))}
            </p>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="p-16 text-center text-slate-300 bg-white rounded-2xl">
          <i className="fas fa-circle-notch fa-spin text-2xl" />
        </div>
      ) : campanas.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-card border border-gray-50 p-16 text-center">
          <i className="fas fa-paper-plane text-4xl text-slate-200 mb-4" />
          <p className="text-slate-500 font-semibold mb-1">Aún no hay campañas de mensajes</p>
          <p className="text-sm text-slate-400 mb-5">
            Un envío segmentado convierte el padrón en un canal: cumpleaños, avisos de jornada,
            recordatorio del día de la elección.
          </p>
          {can(3) && (
            <button onClick={() => setEditando('nueva')} className="btn-primary py-2 h-10 text-xs">
              <i className="fas fa-plus mr-2" /> Crear la primera
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {campanas.map(c => {
            const est = ESTADO[c.estado] || ESTADO.BORRADOR;
            const canal = CANALES.find(x => x.valor === c.canal);
            return (
              <div key={c.id} className="bg-white rounded-2xl shadow-card border border-gray-50 p-5">
                <div className="flex justify-between items-start mb-3 gap-3">
                  <div className="min-w-0">
                    <h3 className="font-brand font-bold text-slate-800 truncate">{c.nombre}</h3>
                    <p className="text-[11px] text-slate-400">
                      <i className={`${canal?.marca} ${canal?.icon} mr-1`} />
                      {canal?.label}
                    </p>
                  </div>
                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wide shrink-0"
                    style={{ background: est.bg, color: est.color }}
                  >
                    {est.label}
                  </span>
                </div>

                <p className="text-xs text-slate-500 bg-slate-50 rounded-lg p-2.5 mb-3 line-clamp-2">
                  {c.plantilla}
                </p>

                <div className="flex gap-4 text-xs mb-4">
                  <div>
                    <p className="text-slate-400 text-[10px] uppercase tracking-wider">Destinatarios</p>
                    <p className="font-bold text-slate-700 tabular-nums">
                      {c.totalDestinatarios.toLocaleString('es-MX')}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400 text-[10px] uppercase tracking-wider">Enviados</p>
                    <p className="font-bold text-slate-700 tabular-nums">
                      {c.enviados.toLocaleString('es-MX')}
                    </p>
                  </div>
                </div>

                <div className="flex gap-2">
                  {c.estado !== 'ENVIADA' && can(3) && (
                    <>
                      <button
                        onClick={() => preparar.mutate(c.id)}
                        className="flex-1 h-9 rounded-lg bg-slate-50 text-slate-600 text-xs font-bold hover:bg-slate-700 hover:text-white transition-all"
                      >
                        <i className="fas fa-list-check mr-1.5" /> Preparar lista
                      </button>
                      {c.estado === 'LISTA' && can(2) && (
                        <button
                          onClick={() => enviar(c)}
                          className="flex-1 h-9 rounded-lg bg-brand-primary/10 text-brand-primary text-xs font-bold hover:bg-brand-primary hover:text-white transition-all"
                        >
                          <i className="fas fa-paper-plane mr-1.5" /> Enviar
                        </button>
                      )}
                      <button
                        onClick={() => setEditando(c)}
                        className="w-9 h-9 rounded-lg bg-slate-50 text-slate-500 hover:bg-slate-700 hover:text-white transition-all"
                      >
                        <i className="fas fa-pen text-[11px]" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ───────────────────────────────────────────────────────────────────────────
// Editor con vista previa en vivo
// ───────────────────────────────────────────────────────────────────────────
const Editor: React.FC<{ campana: MessageCampaign | null; onCerrar: () => void }> = ({ campana, onCerrar }) => {
  const [f, setF] = useState({
    nombre: campana?.nombre || '',
    canal: campana?.canal || 'WHATSAPP',
    plantilla: campana?.plantilla || 'Hola {{primer_nombre}}, ',
    segmento: campana?.segmento || {},
  });
  const [previa, setPrevia] = useState<VistaPrevia | null>(null);
  const [calculando, setCalculando] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const { data: stats } = useQuery({
    queryKey: ['people', 'stats'],
    queryFn: () => peopleApi.stats(),
  });

  const setSeg = (k: string, v: any) =>
    setF(s => ({
      ...s,
      segmento: v === '' || v === false ? (() => {
        const n = { ...s.segmento }; delete n[k]; return n;
      })() : { ...s.segmento, [k]: v },
    }));

  // La vista previa se recalcula sola: el número de destinatarios es la
  // información más importante antes de disparar.
  useEffect(() => {
    let cancelado = false;
    setCalculando(true);
    const t = setTimeout(async () => {
      try {
        const r = await messagingApi.vistaPrevia({
          canal: f.canal, plantilla: f.plantilla, segmento: f.segmento,
        });
        if (!cancelado) setPrevia(r);
      } catch { /* la previa es informativa */ }
      finally { if (!cancelado) setCalculando(false); }
    }, 500);
    return () => { cancelado = true; clearTimeout(t); };
  }, [f.canal, f.plantilla, JSON.stringify(f.segmento)]);

  const guardar = async () => {
    setGuardando(true);
    try {
      if (campana) await messagingApi.update(campana.id, f);
      else await messagingApi.create(f);
      Swal.fire({ icon: 'success', title: 'Guardada', timer: 1300, showConfirmButton: false });
      onCerrar();
    } catch (e: any) {
      Swal.fire({ icon: 'error', title: 'No se pudo guardar', text: e.message });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-5 pb-20">
      <div className="flex justify-between items-center">
        <h2 className="font-brand font-bold text-2xl text-gray-900 tracking-tight">
          {campana ? 'Editar campaña' : 'Nueva campaña'}
        </h2>
        <button onClick={onCerrar} className="btn-ghost py-2 h-10 text-xs border border-gray-100 bg-white">
          Cancelar
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-white rounded-2xl shadow-card border border-gray-50 p-5 space-y-4">
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Nombre *</label>
              <input
                value={f.nombre}
                onChange={e => setF(s => ({ ...s, nombre: e.target.value }))}
                className="input-field mt-1"
                placeholder="Ej. Invitación jornada del sábado"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Canal</label>
              <div className="flex gap-2 mt-1">
                {CANALES.map(c => (
                  <button
                    key={c.valor}
                    onClick={() => setF(s => ({ ...s, canal: c.valor as any }))}
                    className={`flex-1 h-11 rounded-xl text-sm font-bold transition-all border flex items-center justify-center gap-2 ${
                      f.canal === c.valor
                        ? 'bg-brand-primary text-white border-brand-primary'
                        : 'bg-white text-slate-500 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <i className={`${c.marca} ${c.icon}`} /> {c.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Mensaje *</label>
              <textarea
                rows={5}
                value={f.plantilla}
                onChange={e => setF(s => ({ ...s, plantilla: e.target.value }))}
                className="input-field mt-1 resize-none"
                placeholder="Escribe el mensaje…"
              />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {['{{primer_nombre}}', '{{nombre}}', '{{seccion}}', '{{municipio}}'].map(v => (
                  <button
                    key={v}
                    onClick={() => setF(s => ({ ...s, plantilla: s.plantilla + v }))}
                    className="px-2 h-7 rounded-lg bg-slate-100 text-slate-600 text-[11px] font-mono hover:bg-slate-200"
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-card border border-gray-50 p-5 space-y-4">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">¿A quién le llega?</p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Municipio</label>
                <select
                  value={f.segmento.municipio || ''}
                  onChange={e => setSeg('municipio', e.target.value)}
                  className="input-field mt-1"
                >
                  <option value="">Todos</option>
                  {(stats?.porMunicipio || []).map(m => (
                    <option key={m.municipio} value={m.municipio}>
                      {m.municipio} ({m.total})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Sección</label>
                <input
                  value={f.segmento.seccion || ''}
                  onChange={e => setSeg('seccion', e.target.value)}
                  className="input-field mt-1 tabular-nums"
                  placeholder="Todas"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Afinidad</label>
              <select
                value={f.segmento.afinidad || ''}
                onChange={e => setSeg('afinidad', e.target.value)}
                className="input-field mt-1"
              >
                <option value="">Toda</option>
                <option value="DURO">Duro</option>
                <option value="BLANDO">Blando</option>
                <option value="INDECISO">Indeciso</option>
                <option value="NO_CONTACTADO">Sin contactar</option>
              </select>
            </div>

            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {[
                { k: 'compromiso', label: 'Solo con compromiso de voto' },
                { k: 'esLider', label: 'Solo líderes locales' },
                { k: 'requiereTransporte', label: 'Solo quien requiere transporte' },
                { k: 'cumpleHoy', label: 'Solo cumpleañeros de hoy' },
              ].map(m => (
                <label key={m.k} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(f.segmento[m.k])}
                    onChange={e => setSeg(m.k, e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  <span className="text-[11px] text-slate-600">{m.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Vista previa */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl shadow-card border border-gray-50 p-5 sticky top-4">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-3">
              Vista previa
            </p>

            {calculando ? (
              <div className="py-8 text-center text-slate-300">
                <i className="fas fa-circle-notch fa-spin" />
              </div>
            ) : previa ? (
              <>
                <div className="text-center py-3 mb-3 border-b border-gray-50">
                  <p className="text-4xl font-brand font-bold text-brand-primary tabular-nums leading-none">
                    {previa.destinatarios.toLocaleString('es-MX')}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">recibirían el mensaje</p>
                </div>

                {previa.descartados > 0 && (
                  <div className="mb-3 p-2.5 rounded-lg bg-amber-50 border border-amber-100">
                    <p className="text-[11px] font-bold text-amber-800 mb-1">
                      {previa.descartados} descartados
                    </p>
                    {Object.entries(previa.motivosDescarte).map(([m, n]) => (
                      <p key={m} className="text-[11px] text-amber-700">· {m}: {n}</p>
                    ))}
                  </div>
                )}

                {previa.muestra.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                      Así se vería
                    </p>
                    {previa.muestra.slice(0, 2).map((m, i) => (
                      <div key={i} className="mb-2 p-2.5 rounded-xl bg-slate-50 text-xs">
                        <p className="text-[10px] text-slate-400 mb-1">
                          {m.nombre} · {m.destino}
                        </p>
                        <p className="text-slate-700 leading-relaxed">{m.cuerpo}</p>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-slate-400 py-6 text-center">
                Ajusta los filtros para ver a cuántos llegaría.
              </p>
            )}

            <button
              onClick={guardar}
              disabled={!f.nombre.trim() || !f.plantilla.trim() || guardando}
              className="btn-primary w-full h-11 text-sm mt-4 disabled:opacity-40"
            >
              {guardando ? <i className="fas fa-circle-notch fa-spin" /> : 'Guardar campaña'}
            </button>
            <p className="text-[10px] text-slate-400 text-center mt-2">
              Guardar no envía nada. El envío es un paso aparte.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MensajeriaPage;
