import { API_BASE_URL } from '../src/config';
import { CalendarEvent } from '../types';
import Swal from 'sweetalert2';

export const CalendarPage: React.FC = () => {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
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
      const res = await fetch('${API_BASE_URL}/api/events');
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
      const res = await fetch('${API_BASE_URL}/api/events', {
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

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-800">Calendario de Eventos</h1>
        <div className="flex gap-2">
          <button
            onClick={downloadICS}
            className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700 flex items-center gap-2"
          >
            <i className="fas fa-file-export"></i> Exportar Todo
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="bg-brand-primary text-white px-4 py-2 rounded hover:bg-red-800 flex items-center gap-2"
          >
            <i className="fas fa-plus"></i> Nuevo Evento
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <p>Cargando eventos...</p>
        ) : events.map(event => (
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
        ))}
      </div>

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