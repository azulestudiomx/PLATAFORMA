/**
 * pages/EncuestasPage.tsx
 * Encuestas de campo: constructor, aplicación y resultados por sección.
 */
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Swal from 'sweetalert2';
import { surveysApi, type Survey, type SurveyQuestion } from '../services/api';
import { useAuth } from '../hooks/useAuth';

const TIPOS = [
  { valor: 'UNICA', label: 'Opción única', icon: 'fa-circle-dot' },
  { valor: 'MULTIPLE', label: 'Opción múltiple', icon: 'fa-square-check' },
  { valor: 'ESCALA', label: 'Escala 1–10', icon: 'fa-sliders' },
  { valor: 'NUMERO', label: 'Número', icon: 'fa-hashtag' },
  { valor: 'ABIERTA', label: 'Respuesta abierta', icon: 'fa-align-left' },
];

const EncuestasPage: React.FC = () => {
  const qc = useQueryClient();
  const { can } = useAuth();
  const [vista, setVista] = useState<'lista' | 'nueva' | 'aplicar' | 'resultados'>('lista');
  const [activa, setActiva] = useState<Survey | null>(null);

  const { data: encuestas = [], isLoading } = useQuery({
    queryKey: ['surveys'],
    queryFn: () => surveysApi.list(),
  });

  const refrescar = () => qc.invalidateQueries({ queryKey: ['surveys'] });

  const crear = useMutation({
    mutationFn: (d: object) => surveysApi.create(d),
    onSuccess: () => {
      refrescar(); setVista('lista');
      Swal.fire({ icon: 'success', title: 'Encuesta creada', timer: 1400, showConfirmButton: false });
    },
    onError: (e: any) => Swal.fire({ icon: 'error', title: 'No se pudo crear', text: e.message }),
  });

  const cerrar = useMutation({
    mutationFn: (id: string) => surveysApi.update(id, { activa: false }),
    onSuccess: () => { refrescar(); Swal.fire({ icon: 'success', title: 'Encuesta cerrada', timer: 1300, showConfirmButton: false }); },
  });

  if (vista === 'nueva') {
    return <Constructor onGuardar={d => crear.mutate(d)} onCancelar={() => setVista('lista')} guardando={crear.isPending} />;
  }
  if (vista === 'aplicar' && activa) {
    return <Aplicar survey={activa} onSalir={() => { setVista('lista'); refrescar(); }} />;
  }
  if (vista === 'resultados' && activa) {
    return <Resultados surveyId={activa.id} onSalir={() => setVista('lista')} />;
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <h2 className="font-brand font-bold text-2xl text-gray-900 tracking-tight">Encuestas</h2>
          <p className="text-sm text-gray-400 mt-0.5">
            Sondeos aplicados en campo, con resultados agregados por sección
          </p>
        </div>
        {can(3) && (
          <button onClick={() => setVista('nueva')} className="btn-primary py-2 h-10 text-xs">
            <i className="fas fa-plus mr-2" /> Nueva encuesta
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="p-16 text-center text-slate-300 bg-white rounded-2xl">
          <i className="fas fa-circle-notch fa-spin text-2xl" />
        </div>
      ) : encuestas.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-card border border-gray-50 p-16 text-center">
          <i className="fas fa-clipboard-question text-4xl text-slate-200 mb-4" />
          <p className="text-slate-500 font-semibold mb-1">Aún no hay encuestas</p>
          <p className="text-sm text-slate-400 mb-5">
            Un sondeo aplicado durante la visita mide intención de voto sección por sección.
          </p>
          {can(3) && (
            <button onClick={() => setVista('nueva')} className="btn-primary py-2 h-10 text-xs">
              <i className="fas fa-plus mr-2" /> Crear la primera
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {encuestas.map(s => (
            <div key={s.id} className="bg-white rounded-2xl shadow-card border border-gray-50 p-5 flex flex-col">
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-brand font-bold text-slate-800 leading-tight">{s.titulo}</h3>
                <span
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ml-2"
                  style={s.activa
                    ? { background: '#F0FDFA', color: '#0F766E' }
                    : { background: '#F1F5F9', color: '#64748B' }}
                >
                  {s.activa ? 'ABIERTA' : 'CERRADA'}
                </span>
              </div>
              {s.descripcion && (
                <p className="text-xs text-slate-400 mb-3 line-clamp-2">{s.descripcion}</p>
              )}
              <div className="flex gap-4 text-xs mb-4">
                <div>
                  <p className="text-slate-400 text-[10px] uppercase tracking-wider">Preguntas</p>
                  <p className="font-bold text-slate-700 tabular-nums">{s.preguntas.length}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-[10px] uppercase tracking-wider">Respuestas</p>
                  <p className="font-bold text-slate-700 tabular-nums">{s._count?.respuestas ?? 0}</p>
                </div>
              </div>

              <div className="flex gap-2 mt-auto">
                {s.activa && (
                  <button
                    onClick={() => { setActiva(s); setVista('aplicar'); }}
                    className="flex-1 h-9 rounded-lg bg-brand-primary/10 text-brand-primary text-xs font-bold hover:bg-brand-primary hover:text-white transition-all"
                  >
                    <i className="fas fa-pen-to-square mr-1.5" /> Aplicar
                  </button>
                )}
                <button
                  onClick={() => { setActiva(s); setVista('resultados'); }}
                  className="flex-1 h-9 rounded-lg bg-slate-50 text-slate-600 text-xs font-bold hover:bg-slate-700 hover:text-white transition-all"
                >
                  <i className="fas fa-chart-simple mr-1.5" /> Resultados
                </button>
                {s.activa && can(3) && (
                  <button
                    onClick={() => cerrar.mutate(s.id)}
                    className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-600 hover:text-white transition-all"
                    title="Cerrar encuesta"
                  >
                    <i className="fas fa-lock text-[11px]" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ───────────────────────────────────────────────────────────────────────────
// Constructor de cuestionarios
// ───────────────────────────────────────────────────────────────────────────
const Constructor: React.FC<{
  onGuardar: (d: object) => void;
  onCancelar: () => void;
  guardando: boolean;
}> = ({ onGuardar, onCancelar, guardando }) => {
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [anonima, setAnonima] = useState(false);
  const [preguntas, setPreguntas] = useState<any[]>([
    { texto: '', tipo: 'UNICA', opciones: ['', ''], requerida: false },
  ]);

  const set = (i: number, campo: string, valor: any) =>
    setPreguntas(p => p.map((q, idx) => idx === i ? { ...q, [campo]: valor } : q));

  const puedeGuardar = titulo.trim() && preguntas.every(p => {
    if (!p.texto.trim()) return false;
    if (['UNICA', 'MULTIPLE'].includes(p.tipo)) {
      return p.opciones.filter((o: string) => o.trim()).length >= 2;
    }
    return true;
  });

  return (
    <div className="max-w-3xl mx-auto space-y-5 pb-20">
      <div className="flex justify-between items-center">
        <h2 className="font-brand font-bold text-2xl text-gray-900 tracking-tight">Nueva encuesta</h2>
        <button onClick={onCancelar} className="btn-ghost py-2 h-10 text-xs border border-gray-100 bg-white">
          Cancelar
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-card border border-gray-50 p-5 space-y-4">
        <div>
          <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Título *</label>
          <input value={titulo} onChange={e => setTitulo(e.target.value)} className="input-field mt-1"
            placeholder="Ej. Sondeo de intención de voto — primera ola" />
        </div>
        <div>
          <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Descripción</label>
          <textarea rows={2} value={descripcion} onChange={e => setDescripcion(e.target.value)}
            className="input-field mt-1 resize-none" placeholder="Para qué sirve y cómo aplicarla" />
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={anonima} onChange={e => setAnonima(e.target.checked)} className="rounded border-gray-300" />
          <span className="text-xs text-slate-600">
            Anónima — no se guarda a quién se le aplicó
          </span>
        </label>
      </div>

      {preguntas.map((p, i) => (
        <div key={i} className="bg-white rounded-2xl shadow-card border border-gray-50 p-5 space-y-3">
          <div className="flex justify-between items-start gap-3">
            <span className="w-7 h-7 rounded-lg bg-brand-primary/10 text-brand-primary flex items-center justify-center text-xs font-bold shrink-0">
              {i + 1}
            </span>
            <input
              value={p.texto}
              onChange={e => set(i, 'texto', e.target.value)}
              className="input-field flex-1"
              placeholder="Escribe la pregunta"
            />
            {preguntas.length > 1 && (
              <button
                onClick={() => setPreguntas(list => list.filter((_, x) => x !== i))}
                className="w-9 h-9 rounded-lg bg-red-50 text-red-400 hover:bg-red-600 hover:text-white transition-all shrink-0"
              >
                <i className="fas fa-trash text-[11px]" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5 pl-10">
            {TIPOS.map(t => (
              <button
                key={t.valor}
                onClick={() => set(i, 'tipo', t.valor)}
                className={`px-2.5 h-8 rounded-lg text-[11px] font-bold transition-all border flex items-center gap-1.5 ${
                  p.tipo === t.valor
                    ? 'bg-brand-primary text-white border-brand-primary'
                    : 'bg-white text-slate-500 border-gray-200 hover:border-gray-300'
                }`}
              >
                <i className={`fas ${t.icon}`} /> {t.label}
              </button>
            ))}
          </div>

          {['UNICA', 'MULTIPLE'].includes(p.tipo) && (
            <div className="pl-10 space-y-2">
              {p.opciones.map((o: string, oi: number) => (
                <div key={oi} className="flex gap-2">
                  <input
                    value={o}
                    onChange={e => set(i, 'opciones', p.opciones.map((x: string, xi: number) => xi === oi ? e.target.value : x))}
                    className="input-field h-10 text-sm flex-1"
                    placeholder={`Opción ${oi + 1}`}
                  />
                  {p.opciones.length > 2 && (
                    <button
                      onClick={() => set(i, 'opciones', p.opciones.filter((_: string, xi: number) => xi !== oi))}
                      className="w-10 h-10 rounded-lg bg-slate-50 text-slate-400 hover:text-red-600"
                    >
                      <i className="fas fa-times text-[11px]" />
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={() => set(i, 'opciones', [...p.opciones, ''])}
                className="text-[11px] font-bold text-brand-primary hover:underline"
              >
                <i className="fas fa-plus mr-1" /> Agregar opción
              </button>
            </div>
          )}

          <label className="flex items-center gap-2 cursor-pointer pl-10">
            <input
              type="checkbox"
              checked={p.requerida}
              onChange={e => set(i, 'requerida', e.target.checked)}
              className="rounded border-gray-300"
            />
            <span className="text-[11px] text-slate-500">Obligatoria</span>
          </label>
        </div>
      ))}

      <div className="flex gap-3">
        <button
          onClick={() => setPreguntas(p => [...p, { texto: '', tipo: 'UNICA', opciones: ['', ''], requerida: false }])}
          className="btn-ghost flex-1 h-11 text-sm border border-gray-100 bg-white"
        >
          <i className="fas fa-plus mr-2" /> Agregar pregunta
        </button>
        <button
          onClick={() => onGuardar({
            titulo, descripcion, anonima,
            preguntas: preguntas.map((p, i) => ({
              ...p, orden: i,
              opciones: p.opciones?.filter((o: string) => o.trim()) || [],
            })),
          })}
          disabled={!puedeGuardar || guardando}
          className="btn-primary flex-1 h-11 text-sm disabled:opacity-40"
        >
          {guardando ? <i className="fas fa-circle-notch fa-spin" /> : 'Guardar encuesta'}
        </button>
      </div>
    </div>
  );
};

// ───────────────────────────────────────────────────────────────────────────
// Aplicación en campo
// ───────────────────────────────────────────────────────────────────────────
const Aplicar: React.FC<{ survey: Survey; onSalir: () => void }> = ({ survey, onSalir }) => {
  const [seccion, setSeccion] = useState('');
  const [valores, setValores] = useState<Record<string, any>>({});
  const [enviando, setEnviando] = useState(false);
  const [levantadas, setLevantadas] = useState(0);

  const set = (qid: string, v: any) => setValores(s => ({ ...s, [qid]: v }));

  const toggleMultiple = (qid: string, opcion: string) => {
    const actual: string[] = valores[qid] || [];
    set(qid, actual.includes(opcion) ? actual.filter(o => o !== opcion) : [...actual, opcion]);
  };

  const enviar = async () => {
    const faltantes = survey.preguntas.filter(q => {
      if (!q.requerida) return false;
      const v = valores[q.id];
      return v == null || v === '' || (Array.isArray(v) && !v.length);
    });
    if (faltantes.length) {
      Swal.fire({
        icon: 'warning', title: 'Faltan respuestas',
        text: `Obligatorias: ${faltantes.map(q => q.texto).join('; ')}`,
      });
      return;
    }

    setEnviando(true);
    const mandar = async (lat?: number, lng?: number) => {
      try {
        await surveysApi.responder(survey.id, {
          seccion: seccion || null,
          lat, lng,
          respuestas: survey.preguntas.map(q => ({
            questionId: q.id,
            valor: valores[q.id] ?? null,
          })),
        });
        setLevantadas(n => n + 1);
        setValores({});
        Swal.fire({ icon: 'success', title: 'Respuesta guardada', timer: 1100, showConfirmButton: false });
      } catch (e: any) {
        Swal.fire({ icon: 'error', title: 'No se pudo guardar', text: e.message });
      } finally {
        setEnviando(false);
      }
    };

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        p => mandar(p.coords.latitude, p.coords.longitude),
        () => mandar(),
        { timeout: 6000 }
      );
    } else {
      mandar();
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5 pb-20">
      <div className="flex justify-between items-start gap-4">
        <div>
          <h2 className="font-brand font-bold text-xl text-gray-900">{survey.titulo}</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {levantadas > 0 ? `${levantadas} respuesta(s) levantada(s) en esta sesión` : 'Aplicando en campo'}
          </p>
        </div>
        <button onClick={onSalir} className="btn-ghost py-2 h-10 text-xs border border-gray-100 bg-white shrink-0">
          Salir
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-card border border-gray-50 p-5">
        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Sección electoral</label>
        <input
          value={seccion}
          onChange={e => setSeccion(e.target.value)}
          className="input-field mt-1 tabular-nums"
          placeholder="Ej. 467"
        />
        <p className="text-[11px] text-slate-400 mt-1">
          Es lo que permite agregar los resultados por territorio.
        </p>
      </div>

      {survey.preguntas.map((q: SurveyQuestion, i) => (
        <div key={q.id} className="bg-white rounded-2xl shadow-card border border-gray-50 p-5">
          <p className="font-semibold text-slate-800 text-sm mb-3">
            <span className="text-brand-primary mr-2">{i + 1}.</span>
            {q.texto}
            {q.requerida && <span className="text-red-500 ml-1">*</span>}
          </p>

          {q.tipo === 'UNICA' && (
            <div className="space-y-2">
              {q.opciones.map(o => (
                <label key={o} className="flex items-center gap-2.5 cursor-pointer p-2 rounded-lg hover:bg-slate-50">
                  <input
                    type="radio" name={q.id} checked={valores[q.id] === o}
                    onChange={() => set(q.id, o)} className="border-gray-300"
                  />
                  <span className="text-sm text-slate-700">{o}</span>
                </label>
              ))}
            </div>
          )}

          {q.tipo === 'MULTIPLE' && (
            <div className="space-y-2">
              {q.opciones.map(o => (
                <label key={o} className="flex items-center gap-2.5 cursor-pointer p-2 rounded-lg hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={(valores[q.id] || []).includes(o)}
                    onChange={() => toggleMultiple(q.id, o)}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm text-slate-700">{o}</span>
                </label>
              ))}
            </div>
          )}

          {q.tipo === 'ESCALA' && (
            <div className="flex flex-wrap gap-1.5">
              {Array.from({ length: 10 }, (_, n) => n + 1).map(n => (
                <button
                  key={n}
                  onClick={() => set(q.id, n)}
                  className={`w-9 h-9 rounded-lg text-sm font-bold transition-all border tabular-nums ${
                    valores[q.id] === n
                      ? 'bg-brand-primary text-white border-brand-primary'
                      : 'bg-white text-slate-500 border-gray-200 hover:border-gray-400'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          )}

          {q.tipo === 'NUMERO' && (
            <input
              type="number" value={valores[q.id] ?? ''}
              onChange={e => set(q.id, e.target.value)}
              className="input-field tabular-nums" placeholder="Escribe un número"
            />
          )}

          {q.tipo === 'ABIERTA' && (
            <textarea
              rows={3} value={valores[q.id] ?? ''}
              onChange={e => set(q.id, e.target.value)}
              className="input-field resize-none" placeholder="Respuesta"
            />
          )}
        </div>
      ))}

      <button
        onClick={enviar}
        disabled={enviando}
        className="btn-primary w-full h-12 text-sm disabled:opacity-50"
      >
        {enviando ? <i className="fas fa-circle-notch fa-spin" /> : 'Guardar respuesta'}
      </button>
    </div>
  );
};

// ───────────────────────────────────────────────────────────────────────────
// Resultados
// ───────────────────────────────────────────────────────────────────────────
const Resultados: React.FC<{ surveyId: string; onSalir: () => void }> = ({ surveyId, onSalir }) => {
  const [seccion, setSeccion] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['surveys', surveyId, 'resultados', seccion],
    queryFn: () => surveysApi.resultados(surveyId, seccion || undefined),
  });

  if (isLoading) {
    return <div className="p-16 text-center text-slate-300"><i className="fas fa-circle-notch fa-spin text-2xl" /></div>;
  }
  if (!data) return null;

  return (
    <div className="max-w-3xl mx-auto space-y-5 pb-20">
      <div className="flex justify-between items-start gap-4">
        <div>
          <h2 className="font-brand font-bold text-xl text-gray-900">{data.survey.titulo}</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {data.totalRespuestas.toLocaleString('es-MX')} respuestas
            {seccion && ` en la sección ${seccion}`}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <input
            value={seccion}
            onChange={e => setSeccion(e.target.value)}
            placeholder="Filtrar sección"
            className="input-field h-10 text-xs w-32 tabular-nums"
          />
          <button onClick={onSalir} className="btn-ghost py-2 h-10 text-xs border border-gray-100 bg-white">
            Salir
          </button>
        </div>
      </div>

      {data.totalRespuestas === 0 ? (
        <div className="bg-white rounded-2xl shadow-card border border-gray-50 p-16 text-center text-slate-400 text-sm">
          Todavía no hay respuestas{seccion && ' en esa sección'}.
        </div>
      ) : (
        <>
          {data.porPregunta.map((p, i) => (
            <div key={p.questionId} className="bg-white rounded-2xl shadow-card border border-gray-50 p-5">
              <p className="font-semibold text-slate-800 text-sm mb-1">
                <span className="text-brand-primary mr-2">{i + 1}.</span>{p.texto}
              </p>
              <p className="text-[11px] text-slate-400 mb-3">{p.respondidas} respuestas</p>

              {p.conteo && (
                <div className="space-y-2.5">
                  {p.conteo.map(c => (
                    <div key={c.opcion}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-600">{c.opcion}</span>
                        <span className="font-bold text-slate-800 tabular-nums">
                          {c.total} · {Math.round(c.porcentaje * 100)}%
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-brand-primary transition-all"
                          style={{ width: `${c.porcentaje * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {p.promedio !== undefined && p.promedio !== null && (
                <div className="flex gap-6">
                  <div>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider">Promedio</p>
                    <p className="text-2xl font-brand font-bold text-brand-primary tabular-nums">{p.promedio}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider">Mínimo</p>
                    <p className="text-lg font-bold text-slate-600 tabular-nums">{p.minimo}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider">Máximo</p>
                    <p className="text-lg font-bold text-slate-600 tabular-nums">{p.maximo}</p>
                  </div>
                </div>
              )}

              {p.textos && p.textos.length > 0 && (
                <div className="space-y-1.5 max-h-60 overflow-y-auto">
                  {p.textos.map((t, ti) => (
                    <p key={ti} className="text-xs text-slate-600 p-2 rounded-lg bg-slate-50">{t}</p>
                  ))}
                </div>
              )}
            </div>
          ))}

          {data.porSeccion.length > 0 && (
            <div className="bg-white rounded-2xl shadow-card border border-gray-50 p-5">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">
                Respuestas por sección
              </p>
              <div className="flex flex-wrap gap-2">
                {data.porSeccion.map(s => (
                  <button
                    key={s.seccion}
                    onClick={() => setSeccion(s.seccion === seccion ? '' : s.seccion)}
                    className={`px-3 h-8 rounded-lg text-xs font-bold transition-all border ${
                      seccion === s.seccion
                        ? 'bg-brand-primary text-white border-brand-primary'
                        : 'bg-white text-slate-600 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {s.seccion} <span className="opacity-60">· {s.total}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default EncuestasPage;
