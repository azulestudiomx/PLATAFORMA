import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../src/config';
import { CalendarEvent } from '../types';
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
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [currentMonth, setCurrentMonth] = useState(new Date());

  // New Event State
  const [showModal, setShowModal] = useState(false);
  const [newEvent, setNewEvent] = useState({
    title: '',
    date: '',
    location: '',
    type: 'Reunión',
    description: ''
  });

  useEffect(() => {
    fetchEvents();
  }, []);

  const fetchEvents = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/events`);
      const data = await res.json();
      setEvents(data);
    } catch (error) {
      console.error('Error fetching events:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE_URL}/api/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newEvent,
          date: `${newEvent.date}:00-06:00` // Force Campeche Time (GMT-6)
        })
      });

      if (res.ok) {
        setShowModal(false);
        setNewEvent({ title: '', date: '', location: '', type: 'Reunión', description: '' });
        fetchEvents();
        Swal.fire({
          title: '¡Evento Creado!',
          text: 'El evento se ha añadido al calendario.',
          icon: 'success',
          timer: 2000,
          showConfirmButton: false
        });
      }
    } catch (error) {
      console.error('Error adding event:', error);
      Swal.fire('Error', 'No se pudo crear el evento.', 'error');
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
        await fetch(`${API_BASE_URL}/api/events/${id}`, {
          method: 'DELETE',
        });
        setEvents(events.filter(e => e._id !== id));
        Swal.fire(
          '¡Eliminado!',
          'El evento ha sido eliminado.',
          'success'
        );
      } catch (error) {
        console.error('Error deleting event:', error);
        Swal.fire('Error', 'No se pudo eliminar el evento.', 'error');
      }
    }
  };

  const getGoogleCalendarUrl = (event: CalendarEvent) => {
    const startTime = new Date(event.date).toISOString().replace(/-|:|\.\d\d\d/g, "");
    const endTime = new Date(new Date(event.date).getTime() + 60 * 60 * 1000).toISOString().replace(/-|:|\.\d\d\d/g, "");

    const details = encodeURIComponent(event.description || "");
    const location = encodeURIComponent(event.location || "");
    const title = encodeURIComponent(event.title);

    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startTime}/${endTime}&details=${details}&location=${location}&sf=true&output=xml`;
  };

  const downloadICS = () => {
    if (events.length === 0) {
      Swal.fire('Información', 'No hay eventos para exportar', 'info');
      return;
    }

    let icsContent = "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Plataforma Ciudadana//MX\n";

    events.forEach(event => {
      const startDate = new Date(event.date).toISOString().replace(/-|:|\.\d\d\d/g, "");
      const endDate = new Date(new Date(event.date).getTime() + 60 * 60 * 1000).toISOString().replace(/-|:|\.\d\d\d/g, "");

      icsContent += "BEGIN:VEVENT\n";
      icsContent += `UID:${event._id || event.id}@plataforma.campeche\n`;
      icsContent += `DTSTAMP:${startDate}\n`;
      icsContent += `DTSTART:${startDate}\n`;
      icsContent += `DTEND:${endDate}\n`;
      icsContent += `SUMMARY:${event.title}\n`;
      icsContent += `DESCRIPTION:${event.description || ''}\n`;
      icsContent += `LOCATION:${event.location || ''}\n`;
      icsContent += "END:VEVENT\n";
    });

    icsContent += "END:VCALENDAR";

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'calendario_eventos.ics');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Calendar Grid Logic
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart, { weekStartsOn: 0 }); // Sunday start
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });

  const weekDays = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

  return (
    <div className="p-6">
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <h1 className="text-3xl font-bold text-gray-800">Calendario de Eventos</h1>

        <div className="flex flex-wrap gap-2 justify-center">
          {/* View Toggle */}
          <div className="bg-gray-200 p-1 rounded-lg flex">
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-all ${viewMode === 'list' ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <i className="fas fa-list mr-1"></i> Lista
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-all ${viewMode === 'calendar' ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <i className="fas fa-calendar-alt mr-1"></i> Mes
            </button>
          </div>

          <button
            onClick={downloadICS}
            className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700 flex items-center gap-2 text-sm"
          >
            <i className="fas fa-file-export"></i> Exportar
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="bg-brand-primary text-white px-4 py-2 rounded hover:bg-red-800 flex items-center gap-2 text-sm"
          >
            <i className="fas fa-plus"></i> Nuevo
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <i className="fas fa-circle-notch fa-spin text-4xl text-brand-primary mb-4"></i>
          <p className="text-gray-500">Cargando agenda...</p>
        </div>
      ) : viewMode === 'list' ? (
        // LIST VIEW
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {events.length === 0 ? (
            <div className="col-span-full text-center py-12 bg-gray-50 rounded-lg border border-dashed border-gray-300">
              <i className="far fa-calendar-times text-4xl text-gray-400 mb-2"></i>
              <p className="text-gray-500">No hay eventos programados.</p>
            </div>
          ) : (
            events.map(event => (
              <div key={event._id} className="bg-white rounded-lg shadow-md p-6 border-l-4 border-brand-primary hover:shadow-lg transition-shadow">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-sm font-bold text-brand-primary uppercase tracking-wide">{event.type}</span>
                  <div className="flex gap-2">
                    <a
                      href={getGoogleCalendarUrl(event)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800"
                      title="Agregar a Google Calendar"
                    >
                      <i className="fab fa-google"></i>
                    </a>
                    <button onClick={() => handleDeleteEvent(event._id!)} className="text-gray-400 hover:text-red-600 transition-colors">
                      <i className="fas fa-trash"></i>
                    </button>
                  </div>
                </div>
                <h3 className="text-xl font-bold text-gray-800 mb-2">{event.title}</h3>
                <div className="space-y-2 text-gray-600">
                  <p className="flex items-center gap-2">
                    <i className="far fa-calendar-alt w-5"></i>
                    {new Date(event.date).toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Merida' })}
                  </p>
                  <p className="flex items-center gap-2">
                    <i className="far fa-clock w-5"></i>
                    {new Date(event.date).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Merida' })}
                  </p>
                  <p className="flex items-center gap-2">
                    <i className="fas fa-map-marker-alt w-5"></i>
                    {event.location}
                  </p>
                </div>
                {event.description && (
                  <p className="mt-4 text-gray-500 text-sm border-t pt-2">{event.description}</p>
                )}
              </div>
            ))
          )}
        </div>
      ) : (
        // CALENDAR VIEW
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
          {/* Calendar Header */}
          <div className="flex items-center justify-between p-4 bg-gray-50 border-b border-gray-200">
            <button
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              className="p-2 hover:bg-gray-200 rounded-full transition-colors"
            >
              <i className="fas fa-chevron-left text-gray-600"></i>
            </button>
            <h2 className="text-xl font-bold text-gray-800 capitalize">
              {format(currentMonth, 'MMMM yyyy', { locale: es })}
            </h2>
            <button
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              className="p-2 hover:bg-gray-200 rounded-full transition-colors"
            >
              <i className="fas fa-chevron-right text-gray-600"></i>
            </button>
          </div>

          {/* Days Header */}
          <div className="grid grid-cols-7 bg-gray-100 border-b border-gray-200">
            {weekDays.map(day => (
              <div key={day} className="py-2 text-center text-sm font-semibold text-gray-600 uppercase tracking-wider">
                {day}
              </div>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 auto-rows-fr bg-gray-200 gap-px border-b border-gray-200">
            {calendarDays.map((day, dayIdx) => {
              const dayEvents = events.filter(e => isSameDay(new Date(e.date), day));
              const isCurrentMonth = isSameMonth(day, currentMonth);
              const isTodayDate = isToday(day);

              return (
                <div
                  key={day.toString()}
                  className={`min-h-[120px] bg-white p-2 relative group transition-colors hover:bg-gray-50 ${!isCurrentMonth ? 'bg-gray-50/50 text-gray-400' : ''}`}
                >
                  <div className={`text-right text-sm font-medium mb-1 ${isTodayDate ? 'bg-brand-primary text-white w-7 h-7 rounded-full flex items-center justify-center ml-auto' : 'text-gray-700'}`}>
                    {format(day, 'd')}
                  </div>

                  <div className="space-y-1 overflow-y-auto max-h-[80px] custom-scrollbar">
                    {dayEvents.map(event => (
                      <div
                        key={event._id}
                        className="text-xs p-1.5 rounded bg-red-50 border-l-2 border-brand-primary truncate cursor-pointer hover:bg-red-100 transition-colors"
                        title={`${event.title} - ${format(new Date(event.date), 'HH:mm')}`}
                        onClick={() => {
                          // Optional: Open detail modal or scroll to list
                          Swal.fire({
                            title: event.title,
                            html: `
                               <div class="text-left">
                                 <p><strong>Hora:</strong> ${format(new Date(event.date), 'HH:mm')}</p>
                                 <p><strong>Lugar:</strong> ${event.location}</p>
                                 <p><strong>Tipo:</strong> ${event.type}</p>
                                 ${event.description ? `<p class="mt-2 text-sm text-gray-600">${event.description}</p>` : ''}
                               </div>
                             `,
                            confirmButtonColor: '#8B0000'
                          });
                        }}
                      >
                        <span className="font-bold mr-1">{format(new Date(event.date), 'HH:mm')}</span>
                        {event.title}
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Nuevo Evento</h2>
            <form onSubmit={handleAddEvent} className="space-y-4">
              <input
                type="text"
                placeholder="Título del evento"
                value={newEvent.title}
                onChange={e => setNewEvent({ ...newEvent, title: e.target.value })}
                className="w-full border p-2 rounded"
                required
              />
              <input
                type="datetime-local"
                value={newEvent.date}
                onChange={e => setNewEvent({ ...newEvent, date: e.target.value })}
                className="w-full border p-2 rounded"
                required
              />
              <input
                type="text"
                placeholder="Ubicación"
                value={newEvent.location}
                onChange={e => setNewEvent({ ...newEvent, location: e.target.value })}
                className="w-full border p-2 rounded"
                required
              />
              <select
                value={newEvent.type}
                onChange={e => setNewEvent({ ...newEvent, type: e.target.value })}
                className="w-full border p-2 rounded"
              >
                <option value="Reunión">Reunión</option>
                <option value="Gira">Gira</option>
                <option value="Audiencia">Audiencia</option>
                <option value="Evento">Evento</option>
              </select>
              <textarea
                placeholder="Descripción (opcional)"
                value={newEvent.description}
                onChange={e => setNewEvent({ ...newEvent, description: e.target.value })}
                className="w-full border p-2 rounded"
                rows={3}
              />
              <div className="flex justify-end gap-2 mt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-brand-primary text-white rounded hover:bg-red-800"
                >
                  Guardar Evento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div >
  );
};

export default CalendarPage;