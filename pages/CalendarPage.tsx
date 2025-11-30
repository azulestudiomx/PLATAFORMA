import React, { useState, useEffect } from 'react';
import { CalendarEvent } from '../types';

const CalendarPage: React.FC = () => {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [filter, setFilter] = useState<'all' | 'Reunión' | 'Visita' | 'Mitin'>('all');
  const [loading, setLoading] = useState(true);

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
      const res = await fetch('http://localhost:3000/api/events');
      const data = await res.json();
      setEvents(data);
    } catch (error) {
      console.error('Error fetching events:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('http://localhost:3000/api/events', {
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
      }
    } catch (error) {
      alert('Error al crear evento');
    }
  };

  const filteredEvents = filter === 'all'
    ? events
    : events.filter(e => e.type === filter);

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'Reunión': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'Visita': return 'bg-brand-accent/20 text-yellow-800 border-yellow-200';
      case 'Mitin': return 'bg-red-100 text-brand-primary border-red-200';
      default: return 'bg-gray-100';
    }
  };

  return (
    <div className="max-w-4xl mx-auto relative">
      <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
        <h2 className="text-2xl font-bold text-gray-800 border-b-2 border-brand-accent pb-2">
          Agenda de Eventos
        </h2>

        <div className="flex bg-white rounded-lg p-1 shadow-sm border border-gray-200">
          {['all', 'Reunión', 'Visita', 'Mitin'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f as any)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${filter === f
                ? 'bg-brand-primary text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-50'
                }`}
            >
              {f === 'all' ? 'Todos' : f}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden min-h-[300px]">
        {loading ? (
          <div className="flex justify-center items-center h-40">
            <i className="fas fa-spinner fa-spin text-brand-primary text-2xl"></i>
          </div>
        ) : (
          <div className="grid grid-cols-1 divide-y divide-gray-100">
            {filteredEvents.map((evt) => (
              <div key={evt._id || evt.id} className="p-6 hover:bg-gray-50 transition-colors flex flex-col md:flex-row gap-4 items-start md:items-center">

                {/* Date Box */}
                <div className="flex-shrink-0 w-16 h-16 bg-gray-50 rounded-lg border border-gray-200 flex flex-col items-center justify-center text-center">
                  <span className="text-xs font-bold text-gray-500 uppercase">
                    {new Date(evt.date).toLocaleString('es-MX', { month: 'short', timeZone: 'America/Merida' })}
                  </span>
                  <span className="text-xl font-bold text-brand-primary leading-none">
                    {new Date(evt.date).toLocaleDateString('es-MX', { day: 'numeric', timeZone: 'America/Merida' })}
                  </span>
                </div>

                {/* Content */}
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${getTypeColor(evt.type)}`}>
                      {evt.type}
                    </span>
                    <span className="text-xs text-gray-400">
                      <i className="far fa-clock mr-1"></i>
                      {new Date(evt.date).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Merida' })}
                    </span>
                  </div>
                  <h3 className="font-bold text-gray-800 text-lg mb-1">{evt.title}</h3>
                  <p className="text-sm text-gray-500 flex items-center gap-1">
                    <i className="fas fa-map-marker-alt text-gray-400"></i> {evt.location}
                  </p>
                </div>
              </div>
            ))}

            {filteredEvents.length === 0 && (
              <div className="p-12 text-center text-gray-400">
                <i className="far fa-calendar-times text-4xl mb-3"></i>
                <p>No hay eventos programados en esta categoría.</p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-6 flex justify-end">
        <button
          onClick={() => setShowModal(true)}
          className="bg-brand-primary text-white px-6 py-3 rounded-lg shadow-lg hover:bg-red-800 transition flex items-center gap-2"
        >
          <i className="fas fa-plus"></i> Nuevo Evento
        </button>
      </div>

      {/* Modal de Creación */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="bg-brand-primary p-4 text-white flex justify-between items-center">
              <h3 className="font-bold">Nuevo Evento</h3>
              <button onClick={() => setShowModal(false)}><i className="fas fa-times"></i></button>
            </div>
            <form onSubmit={handleCreateEvent} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Título</label>
                <input
                  required
                  type="text"
                  value={newEvent.title}
                  onChange={e => setNewEvent({ ...newEvent, title: e.target.value })}
                  className="w-full p-2 border rounded"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Fecha y Hora</label>
                  <input
                    required
                    type="datetime-local"
                    value={newEvent.date}
                    onChange={e => setNewEvent({ ...newEvent, date: e.target.value })}
                    className="w-full p-2 border rounded"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Tipo</label>
                  <select
                    value={newEvent.type}
                    onChange={e => setNewEvent({ ...newEvent, type: e.target.value })}
                    className="w-full p-2 border rounded"
                  >
                    <option value="Reunión">Reunión</option>
                    <option value="Visita">Visita</option>
                    <option value="Mitin">Mitin</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Ubicación</label>
                <input
                  required
                  type="text"
                  value={newEvent.location}
                  onChange={e => setNewEvent({ ...newEvent, location: e.target.value })}
                  className="w-full p-2 border rounded"
                />
              </div>
              <button type="submit" className="w-full bg-brand-primary text-white font-bold py-3 rounded hover:bg-red-800">
                Guardar Evento
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CalendarPage;