import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { useSyncReports } from '../services/syncHook';

// Fix Leaflet marker icons in React
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Mock Data for Dashboard
const STATS = [
  { label: 'Total de Reportes', value: '1,250' },
  { label: 'Municipios Visitados', value: '11' },
  { label: 'Personas Registradas', value: '850' },
  { label: 'Problema + Reportado', value: 'Infraestructura Vial' },
];

const CHART_DATA = [
  { name: 'Agua', value: 400 },
  { name: 'Luz', value: 300 },
  { name: 'Salud', value: 200 },
  { name: 'Educación', value: 150 },
  { name: 'Seguridad', value: 100 },
];

const MAP_MARKERS = [
  { id: 1, lat: 19.8301, lng: -90.5349, title: "Campeche - Baches" },
  { id: 2, lat: 18.6475, lng: -91.8292, title: "Carmen - Alumbrado" },
  { id: 3, lat: 19.3551, lng: -90.7259, title: "Champotón - Agua" },
  { id: 4, lat: 20.3794, lng: -90.0494, title: "Calkiní - Salud" },
];

const COLORS = ['#8B0000', '#FFD700', '#A52A2A', '#D2691E', '#CD5C5C'];

const Dashboard: React.FC = () => {
  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-800 mb-6 border-b-2 border-brand-accent pb-2 inline-block">
        Panel de Control
      </h2>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {STATS.map((stat, idx) => (
          <div key={idx} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">{stat.label}</p>
            <p className="text-3xl font-extrabold text-brand-primary">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Map Section */}
        <div className="lg:col-span-2 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-gray-700">Mapa de Reportes</h3>
            <span className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-500">Últimos 7 días</span>
          </div>
          <div className="h-[400px] w-full rounded-lg overflow-hidden relative z-0">
            <MapContainer 
                center={[19.8301, -90.5349]} 
                zoom={8} 
                scrollWheelZoom={false}
                style={{ height: "100%", width: "100%" }}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {MAP_MARKERS.map(m => (
                <Marker key={m.id} position={[m.lat, m.lng]}>
                  <Popup>{m.title}</Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>
        </div>

        {/* Chart Section */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <h3 className="font-bold text-gray-700 mb-6">Necesidades Reportadas</h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={CHART_DATA}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{fontSize: 12}} axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} />
                <Tooltip 
                  contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)'}}
                  cursor={{fill: '#f3f4f6'}}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {CHART_DATA.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          
          <div className="mt-4 space-y-3">
             <h4 className="text-sm font-bold text-gray-600">Notificaciones Recientes</h4>
             <div className="flex items-start gap-3 text-sm">
                <i className="fas fa-exclamation-circle text-brand-primary mt-1"></i>
                <div>
                  <p className="font-semibold">Nuevo reporte en Carmen</p>
                  <p className="text-gray-500 text-xs">Falta de alumbrado público · Hace 2 horas</p>
                </div>
             </div>
             <div className="flex items-start gap-3 text-sm">
                <i className="fas fa-calendar-check text-brand-primary mt-1"></i>
                <div>
                  <p className="font-semibold">Reunión comunitaria en Champotón</p>
                  <p className="text-gray-500 text-xs">Mañana a las 10:00 AM</p>
                </div>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;