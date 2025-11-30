import React, { useState } from 'react';
import { CalendarEvent } from '../types';

const MOCK_EVENTS: CalendarEvent[] = [
  { id: '1', title: 'Reunión con líderes de colonia', date: '2023-10-25', location: 'San Román, Campeche', type: 'Reunión' },
  { id: '2', title: 'Visita de campo a escuela', date: '2023-10-26', location: 'Lerma', type: 'Visita' },
  { id: '3', title: 'Mitin en Plaza Principal', date: '2023-10-28', location: 'Escárcega', type: 'Mitin' },
];

const CalendarPage: React.FC = () => {
  const [events] = useState<CalendarEvent[]>(MOCK_EVENTS);
  const [filter, setFilter] = useState<'all' | 'Reunión' | 'Visita' | 'Mitin'>('all');

  const filteredEvents = filter === 'all' 
    ? events 
    : events.filter(e => e.type === filter);

  const getTypeColor = (type: string) => {
    switch(type) {
      case 'Reunión': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'Visita': return 'bg-brand-accent/20 text-yellow-800 border-yellow-200';
      case 'Mitin': return 'bg-red-100 text-brand-primary border-red-200';
      default: return 'bg-gray-100';
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
        <h2 className="text-2xl font-bold text-gray-800 border-b-2 border-brand-accent pb-2">
          Agenda de Eventos
        </h2>
        
        <div className="flex bg-white rounded-lg p-1 shadow-sm border border-gray-200">
          {['all', 'Reunión', 'Visita', 'Mitin'].map((f) => (
             <button
               key={f}
               onClick={() => setFilter(f as any)}
               className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                 filter === f 
                  ? 'bg-brand-primary text-white shadow-sm' 
                  : 'text-gray-600 hover:bg-gray-50'
               }`}
             >
               {f === 'all' ? 'Todos' : f}
             </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="grid grid-cols-1 divide-y divide-gray-100">
          {filteredEvents.map((evt) => (
            <div key={evt.id} className="p-6 hover:bg-gray-50 transition-colors flex flex-col md:flex-row gap-4 items-start md:items-center">
              
              {/* Date Box */}
              <div className="flex-shrink-0 w-16 h-16 bg-gray-50 rounded-lg border border-gray-200 flex flex-col items-center justify-center text-center">
                <span className="text-xs font-bold text-gray-500 uppercase">
                  {new Date(evt.date).toLocaleString('es-MX', { month: 'short' })}
                </span>
                <span className="text-xl font-bold text-brand-primary leading-none">
                  {new Date(evt.date).getDate() + 1 /* Fix timezone offset for demo */}
                </span>
              </div>

              {/* Content */}
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${getTypeColor(evt.type)}`}>
                    {evt.type}
                  </span>
                  <span className="text-xs text-gray-400">
                    <i className="far fa-clock mr-1"></i> 10:00 AM
                  </span>
                </div>
                <h3 className="font-bold text-gray-800 text-lg mb-1">{evt.title}</h3>
                <p className="text-sm text-gray-500 flex items-center gap-1">
                  <i className="fas fa-map-marker-alt text-gray-400"></i> {evt.location}
                </p>
              </div>

              {/* Action */}
              <button className="text-gray-400 hover:text-brand-primary transition-colors">
                <i className="fas fa-chevron-right text-xl"></i>
              </button>
            </div>
          ))}
          
          {filteredEvents.length === 0 && (
            <div className="p-12 text-center text-gray-400">
              <i className="far fa-calendar-times text-4xl mb-3"></i>
              <p>No hay eventos programados en esta categoría.</p>
            </div>
          )}
        </div>
      </div>
      
      <div className="mt-6 flex justify-end">
        <button className="bg-brand-primary text-white px-6 py-3 rounded-lg shadow-lg hover:bg-red-800 transition flex items-center gap-2">
           <i className="fas fa-plus"></i> Nuevo Evento
        </button>
      </div>
    </div>
  );
};

export default CalendarPage;