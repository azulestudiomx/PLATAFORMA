import React, { useState, useEffect } from 'react';
import { eventsApi, authApi } from '../services/api';
import { CalendarEvent, User } from '../types';
import { useConfig } from '../contexts/ConfigContext';
import Swal from 'sweetalert2';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  isToday
} from 'date-fns';
import { es } from 'date-fns/locale';

export const CalendarPage: React.FC = () => {
  const { config } = useConfig();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const safeDate = (d: any) => {
    const parsed = new Date(d);
    return isNaN(parsed.getTime()) ? null : parsed;
  };

  // New Event State
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newEvent, setNewEvent] = useState({
    title: '',
    date: '',
    location: '',
    community: '',
    type: '',
    description: '',
    assignedTo: ''
  });

  // Ensure default type is set when modal opens
  useEffect(() => {
    if (showModal && !newEvent.type && config?.eventTypes?.[0]) {
      setNewEvent(prev => ({ ...prev, type: config.eventTypes[0] }));
    }
  }, [showModal, config]);

  const MUNICIPALIOS = [
    "Campeche", "Carmen", "Champotón", "Escárcega", "Calkiní",
    "Hecelchakán", "Hopelchén", "Tenabo", "Candelaria",
    "Calakmul", "Palizada", "Seybaplaya", "Dzitbalché"
  ];

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch events first (everyone can see them)
      try {
        const eventsData = await eventsApi.list();
        setEvents(Array.isArray(eventsData) ? eventsData : []);
      } catch (e) {
        console.error('Error fetching events:', e);
        setEvents([]);
      }

      // Fetch users (requires Admin - if fail, just keep empty list)
      try {
        const usersData = await authApi.listUsers();
        setUsers(Array.isArray(usersData) ? usersData : []);
      } catch (e) {
        console.warn('User list could not be loaded (likely permissions):', e);
        setUsers([]);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
       const payload = {
          ...newEvent,
          // If Jornada, maybe title can be auto-generated if empty
          title: newEvent.title || `Jornada en ${newEvent.community || newEvent.location}`,
          date: newEvent.date.includes('T') ? newEvent.date : `${newEvent.date}T09:00`
       };

       if (editingId) {
          await eventsApi.update(editingId, payload);
       } else {
          await eventsApi.create(payload);
       }

        setShowModal(false);
        setEditingId(null);
        setNewEvent({ title: '', date: '', location: '', community: '', type: 'Jornada', description: '', assignedTo: '' });
        fetchData();
        Swal.fire({
          title: editingId ? '¡Actualizado!' : '¡Evento Creado!',
          text: 'La agenda ha sido actualizada.',
          icon: 'success',
          timer: 1500,
          showConfirmButton: false
        });
    } catch (error) {
      console.error('Error saving event:', error);
      Swal.fire('Error', 'No se pudo guardar el evento.', 'error');
    }
  };

  const handleDeleteEvent = async (id: string) => {
    const result = await Swal.fire({
      title: '¿Estás seguro?',
      text: "No podrás revertir esta acción",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#8B0000',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
      try {
        await eventsApi.delete(id);
        setEvents(events.filter(e => (e._id || e.id) !== id));
        Swal.fire('¡Eliminado!', 'El evento ha sido eliminado.', 'success');
      } catch (error) {
        console.error('Error deleting event:', error);
        Swal.fire('Error', 'No se pudo eliminar el evento.', 'error');
      }
    }
  };

  const handleEdit = (event: CalendarEvent) => {
      setEditingId(event._id || event.id);
      setNewEvent({
          title: event.title,
          date: event.date.slice(0, 16), // Format for datetime-local
          location: event.location,
          community: event.community || '',
          type: event.type,
          description: event.description || '',
          assignedTo: event.assignedTo || ''
      });
      setShowModal(true);
  };

  const downloadICS = () => {
    if (events.length === 0) {
      Swal.fire('Información', 'No hay eventos para exportar', 'info');
      return;
    }
    let icsContent = "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Plataforma Ciudadana//MX\n";
    events.forEach(event => {
      const d = safeDate(event.date);
      if (!d) return;
      
      const startDate = d.toISOString().replace(/-|:|\.\d\d\d/g, "");
      const endDate = new Date(d.getTime() + 60 * 60 * 1000).toISOString().replace(/-|:|\.\d\d\d/g, "");
      icsContent += "BEGIN:VEVENT\n";
      icsContent += `UID:${event._id || event.id}@plataforma.campeche\n`;
      icsContent += `DTSTAMP:${startDate}\n`;
      icsContent += `DTSTART:${startDate}\n`;
      icsContent += `DTEND:${endDate}\n`;
      icsContent += `SUMMARY:${event.title}\n`;
      icsContent += `DESCRIPTION:${event.description || ''}${event.assignedTo ? `\\nAsignado a: ${event.assignedTo}` : ''}\n`;
      icsContent += `LOCATION:${event.community ? `${event.community}, ` : ''}${event.location || ''}\n`;
      icsContent += "END:VEVENT\n";
    });
    icsContent += "END:VCALENDAR";
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.setAttribute('download', 'calendario_jornadas.ics');
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  // Calendar Grid Logic
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart, { weekStartsOn: 0 }); 
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });
  const weekDays = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col md:flex-row justify-between items-center mb-10 gap-6">
        <div>
          <h1 className="text-3xl font-brand font-bold text-slate-800 tracking-tight">Gestión de Jornadas</h1>
          <p className="text-slate-400 mt-1">Programa visitas a comunidades y asigna equipos de campo</p>
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="bg-slate-100 p-1.5 rounded-2xl flex shadow-sm border border-slate-200">
            <button onClick={() => setViewMode('list')} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-brand-primary' : 'text-slate-500'}`}>
              <i className="fas fa-list mr-1.5"></i> LISTA
            </button>
            <button onClick={() => setViewMode('calendar')} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${viewMode === 'calendar' ? 'bg-white shadow-sm text-brand-primary' : 'text-slate-500'}`}>
              <i className="fas fa-calendar-alt mr-1.5"></i> CALENDARIO
            </button>
          </div>

          <button onClick={downloadICS} className="h-11 px-6 rounded-2xl bg-white border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50 transition-all flex items-center gap-2">
            <i className="fas fa-file-export"></i> EXPORTAR .ICS
          </button>
          <button onClick={() => { setEditingId(null); setShowModal(true); }} className="h-11 px-6 rounded-2xl bg-brand-primary text-white font-bold text-xs shadow-glow-red hover:bg-red-800 transition-all flex items-center gap-2">
            <i className="fas fa-plus"></i> AGENDAR JORNADA
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-12 h-12 border-4 border-slate-100 border-t-brand-primary rounded-full animate-spin"></div>
          <p className="mt-4 text-slate-400 font-bold text-xs uppercase tracking-widest">Cargando Agenda...</p>
        </div>
      ) : viewMode === 'list' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {events.length === 0 ? (
            <div className="col-span-full py-20 text-center bg-white rounded-3xl border-2 border-dashed border-slate-100">
               <i className="fas fa-calendar-alt text-4xl text-slate-100 mb-4"></i>
               <p className="text-slate-400 italic">No hay jornadas programadas para este mes.</p>
            </div>
          ) : (
            events.map(event => (
              <div key={event._id || event.id} className="bg-white rounded-3xl shadow-card p-6 border border-slate-50 hover:border-brand-primary/20 transition-all group">
                <div className="flex justify-between items-start mb-4">
                  <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    event.type === 'Jornada' ? 'bg-red-50 text-brand-primary' : 
                    event.type === 'Visita' ? 'bg-blue-50 text-blue-600' : 'bg-slate-50 text-slate-500'
                  }`}>
                    {event.type}
                  </span>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => handleEdit(event)} className="w-8 h-8 rounded-lg bg-slate-50 text-slate-400 hover:text-brand-primary hover:bg-red-50 flex items-center justify-center">
                        <i className="fas fa-edit text-xs"></i>
                    </button>
                    <button onClick={() => handleDeleteEvent(event._id || event.id)} className="w-8 h-8 rounded-lg bg-slate-50 text-slate-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center">
                        <i className="fas fa-trash text-xs"></i>
                    </button>
                  </div>
                </div>
                
                <h3 className="text-xl font-brand font-bold text-slate-800 mb-4">{event.title}</h3>
                
                <div className="space-y-3 mb-6">
                  <div className="flex items-center gap-3 text-slate-500">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                        <i className="far fa-calendar-alt text-xs"></i>
                    </div>
                    <span className="text-xs font-semibold capitalize">
                       {safeDate(event.date) ? format(safeDate(event.date)!, "EEEE d 'de' MMMM", { locale: es }) : 'Fecha pendiente'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-slate-500">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                        <i className="fas fa-map-marker-alt text-xs"></i>
                    </div>
                    <span className="text-xs font-semibold">
                       {event.community ? `${event.community}, ` : ''}{event.location}
                    </span>
                  </div>
                  {event.assignedTo && (
                    <div className="flex items-center gap-3 text-slate-700">
                      <div className="w-8 h-8 rounded-lg bg-green-50 text-green-600 flex items-center justify-center shrink-0">
                          <i className="fas fa-user-check text-xs"></i>
                      </div>
                      <span className="text-xs font-bold">Asignado: {event.assignedTo}</span>
                    </div>
                  )}
                </div>
                
                {event.description && (
                  <p className="text-xs text-slate-400 line-clamp-2 border-t pt-4">{event.description}</p>
                )}
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="bg-white rounded-3xl shadow-card border border-slate-50 overflow-hidden">
          {/* Calendar Header */}
          <div className="flex items-center justify-between p-6 bg-slate-50/50 border-b border-slate-50">
            <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="w-10 h-10 flex items-center justify-center rounded-xl bg-white shadow-sm border border-slate-100 text-slate-400 hover:text-brand-primary transition-all">
              <i className="fas fa-chevron-left"></i>
            </button>
            <h2 className="text-xl font-brand font-bold text-slate-800 capitalize">
              {format(currentMonth, 'MMMM yyyy', { locale: es })}
            </h2>
            <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="w-10 h-10 flex items-center justify-center rounded-xl bg-white shadow-sm border border-slate-100 text-slate-400 hover:text-brand-primary transition-all">
              <i className="fas fa-chevron-right"></i>
            </button>
          </div>

          <div className="grid grid-cols-7 border-b border-slate-50">
            {weekDays.map(day => <div key={day} className="py-4 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">{day}</div>)}
          </div>

          <div className="grid grid-cols-7 bg-slate-50 gap-px">
            {calendarDays.map((day) => {
              const dayEvents = events.filter(e => {
                const d = safeDate(e.date);
                return d ? isSameDay(d, day) : false;
              });
              const isCurrent = isSameMonth(day, currentMonth);
              return (
                <div key={day.toString()} className={`min-h-[140px] p-2 bg-white ${!isCurrent ? 'opacity-40' : ''}`}>
                  <div className={`text-right text-xs font-bold mb-2 ${isToday(day) ? 'bg-brand-primary text-white w-6 h-6 rounded-lg flex items-center justify-center ml-auto' : 'text-slate-300'}`}>
                    {format(day, 'd')}
                  </div>
                  <div className="space-y-1">
                    {dayEvents.map(e => (
                      <div 
                        key={e._id || e.id} 
                        onClick={() => handleEdit(e)}
                        className={`text-[9px] p-2 rounded-xl font-bold border-l-2 cursor-pointer transition-all hover:scale-[1.02] ${
                            e.type === 'Jornada' ? 'bg-red-50 text-brand-primary border-brand-primary' : 'bg-blue-50 text-blue-600 border-blue-600'
                        }`}
                      >
                        <div className="truncate">{e.title}</div>
                        {e.assignedTo && <div className="text-[7px] mt-0.5 uppercase opacity-60 truncate">👤 {e.assignedTo}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
          <div className="bg-white w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden animate-fade-in">
            <div className="bg-brand-primary p-6 text-white flex justify-between items-center bg-brand-gradient">
                <h3 className="font-brand font-bold text-lg">{editingId ? 'Editar Programación' : 'Agendar Jornada de Captura'}</h3>
                <button onClick={() => setShowModal(false)} className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center hover:bg-white/25 transition-all"><i className="fas fa-times text-xs"></i></button>
            </div>
            
            <form onSubmit={handleAddEvent} className="p-8 space-y-5 overflow-y-auto max-h-[75vh]">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">Título de la Jornada (Opcional)</label>
                    <input type="text" value={newEvent.title} onChange={e => setNewEvent({ ...newEvent, title: e.target.value })} className="input-modern" placeholder="Ej. MEGA JORNADA SOCIAL" />
                </div>
                <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">Fecha y Hora</label>
                    <input required type="datetime-local" value={newEvent.date} onChange={e => setNewEvent({ ...newEvent, date: e.target.value })} className="input-modern" />
                </div>
                <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">Tipo de Actividad</label>
                    <select value={newEvent.type} onChange={e => setNewEvent({ ...newEvent, type: e.target.value })} className="input-modern font-bold text-brand-primary">
                        {config.eventTypes?.map(t => (
                            <option key={t} value={t}>{t}</option>
                        ))}
                        {(!config.eventTypes || config.eventTypes.length === 0) && (
                            <>
                                <option value="Jornada">Jornada de Captura</option>
                                <option value="Visita">Visita de Campo</option>
                            </>
                        )}
                    </select>
                </div>
                <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">Municipio</label>
                    <select required value={newEvent.location} onChange={e => setNewEvent({ ...newEvent, location: e.target.value })} className="input-modern">
                        <option value="">Seleccione...</option>
                        {MUNICIPALIOS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                </div>
                <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">Comunidad / Lugar</label>
                    <input required type="text" value={newEvent.community} onChange={e => setNewEvent({ ...newEvent, community: e.target.value })} className="input-modern" placeholder="Ej. Colonia Centro" />
                </div>
                <div className="col-span-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">Asignar Responsable / Capturista</label>
                    <select value={newEvent.assignedTo} onChange={e => setNewEvent({ ...newEvent, assignedTo: e.target.value })} className="input-modern font-bold text-blue-600">
                        <option value="">-- Sin asignar --</option>
                        {users.map(u => <option key={u.username} value={u.name}>{u.name} (@{u.username})</option>)}
                    </select>
                </div>
                <div className="col-span-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">Instrucciones Adicionales</label>
                    <textarea rows={3} value={newEvent.description} onChange={e => setNewEvent({ ...newEvent, description: e.target.value })} className="input-modern resize-none" placeholder="Indique puntos de reunión o metas de captura..."></textarea>
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setShowModal(false)} className="btn-ghost text-xs px-8">CANCELAR</button>
                <button type="submit" className="btn-primary flex-1 shadow-glow-red uppercase text-xs font-bold tracking-widest h-12">
                   {editingId ? 'ACTUALIZAR AGENDA' : 'CONFIRMAR PROGRAMACIÓN'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CalendarPage;