import { API_BASE_URL } from '../src/config';
import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { MapContainer, TileLayer, Marker, Popup, GeoJSON, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Report } from '../types';

const GeoJSONWrapper = () => {
  const [geoData, setGeoData] = useState<any>(null);

  useEffect(() => {
    fetch('/campeche.json')
      .then(res => res.json())
      .then(data => setGeoData(data))
      .catch(err => console.error('Error loading GeoJSON:', err));
  }, []);

  if (!geoData) return null;

  return (
    <GeoJSON
      data={geoData}
      style={{
        color: '#8B0000',
        weight: 2,
        fillColor: '#8B0000',
        fillOpacity: 0.1
      }}
    />
  );
};

// Fix Leaflet marker icons in React
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Mock Data for Dashboard Stats (Keep these for now or replace with real counts later)
// Mock Data for Dashboard Stats (Keep these for now or replace with real counts later)
const getStats = (reportsCount: number, peopleCount: number, uniqueMunicipalities: number) => [
  { label: 'Total de Reportes', value: reportsCount.toLocaleString() },
  { label: 'Municipios Visitados', value: uniqueMunicipalities.toLocaleString() },
  { label: 'Personas Registradas', value: peopleCount.toLocaleString() },
  { label: 'Problema + Reportado', value: 'Infraestructura Vial' },
];

const CHART_DATA = [
  { name: 'Agua', value: 400 },
  { name: 'Luz', value: 300 },
  { name: 'Salud', value: 200 },
  { name: 'Educación', value: 150 },
  { name: 'Seguridad', value: 100 },
];

const COLORS = ['#8B0000', '#FFD700', '#A52A2A', '#D2691E', '#CD5C5C'];

import 'leaflet.heat';

const HeatmapLayer = ({ points }: { points: [number, number, number][] }) => {
  const map = useMap();

  useEffect(() => {
    if (!points.length) return;

    // @ts-ignore
    const heat = L.heatLayer(points, {
      radius: 25,
      blur: 15,
      maxZoom: 10,
      gradient: { 0.4: 'blue', 0.65: 'lime', 1: 'red' }
    }).addTo(map);

    return () => {
      map.removeLayer(heat);
    };
  }, [points, map]);

  return null;
};

const Dashboard: React.FC = () => {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [peopleCount, setPeopleCount] = useState<number>(0);
  const [showHeatmap, setShowHeatmap] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [reportsRes, peopleRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/reports?limit=100`),
        fetch(`${API_BASE_URL}/api/people`)
      ]);

      if (reportsRes.ok) {
        const data = await reportsRes.json();
        setReports(data.data || []);
      }

      if (peopleRes.ok) {
        const peopleData = await peopleRes.json();
        setPeopleCount(peopleData.length);
      }
    } catch (error) {
      console.error('Error connecting to backend:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // Auto-refresh every 30s
    return () => clearInterval(interval);
  }, []);

  // Calculate dynamic stats
  const stats = {
    byMunicipio: Object.entries(
      reports.reduce((acc, curr) => {
        acc[curr.municipio] = (acc[curr.municipio] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    ).map(([name, value]) => ({ name, value })),
    byNeed: Object.entries(
      reports.reduce((acc, curr) => {
        acc[curr.needType] = (acc[curr.needType] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    ).map(([name, value]) => ({ name, value }))
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6 border-b-2 border-brand-accent pb-2">
        <h2 className="text-2xl font-bold text-gray-800">
          Panel de Control
        </h2>
        <button
          onClick={fetchData}
          className="text-brand-primary hover:text-red-800 transition flex items-center gap-2 text-sm font-bold"
          title="Actualizar datos"
        >
          <i className={`fas fa-sync-alt ${loading ? 'animate-spin' : ''}`}></i> Actualizar
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {(() => {
          const uniqueMunicipalities = new Set(reports.map(r => r.municipio)).size;
          return getStats(reports.length, peopleCount, uniqueMunicipalities).map((stat, idx) => (
            <div key={idx} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">{stat.label}</p>
              <p className="text-3xl font-extrabold text-brand-primary">{stat.value}</p>
            </div>
          ));
        })()}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Map Section */}
        <div className="lg:col-span-2 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-gray-700">Mapa de Reportes (En Vivo)</h3>
            <div className="flex gap-2 items-center">
              {/* Toggle Heatmap */}
              <div className="bg-gray-100 p-1 rounded-lg flex text-xs font-bold">
                <button
                  onClick={() => setShowHeatmap(false)}
                  className={`px-3 py-1 rounded transition ${!showHeatmap ? 'bg-white shadow text-brand-primary' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  Marcadores
                </button>
                <button
                  onClick={() => setShowHeatmap(true)}
                  className={`px-3 py-1 rounded transition ${showHeatmap ? 'bg-brand-primary shadow text-white' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  Mapa de Calor
                </button>
              </div>

              <button
                onClick={() => {
                  navigator.geolocation.getCurrentPosition(
                    (pos) => alert(`Ubicación capturada: ${pos.coords.latitude}, ${pos.coords.longitude}`),
                    (err) => alert('Error al obtener ubicación: ' + err.message)
                  );
                }}
                className="bg-brand-primary text-white px-3 py-1 rounded text-xs font-bold hover:bg-red-800 transition"
              >
                <i className="fas fa-map-marker-alt mr-1"></i> Capturar
              </button>
            </div>
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

              {/* Offline GeoJSON Layer */}
              <GeoJSONWrapper />

              {showHeatmap ? (
                <HeatmapLayer
                  points={reports
                    .filter(r => r.location && r.location.lat && r.location.lng)
                    .map(r => [r.location.lat, r.location.lng, 1])} // lat, lng, intensity
                />
              ) : (
                reports.map((report) => (
                  report.location && (
                    <Marker
                      key={report._id || report.id}
                      position={[report.location.lat, report.location.lng]}
                    >
                      <Popup>
                        <div className="p-1">
                          <h4 className="font-bold text-brand-primary mb-1">{report.municipio}</h4>
                          <span className="text-xs font-semibold bg-gray-100 px-2 py-0.5 rounded text-gray-600 mb-2 inline-block">
                            {report.needType}
                          </span>
                          <p className="text-sm text-gray-700 leading-snug">{report.description}</p>
                          <p className="text-xs text-gray-400 mt-2">
                            {new Date(report.timestamp).toLocaleDateString()}
                          </p>
                        </div>
                      </Popup>
                    </Marker>
                  )
                ))
              )}
            </MapContainer>
          </div>
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:col-span-1 gap-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 h-96">
            <h3 className="font-bold text-gray-700 mb-4">Reportes por Municipio</h3>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.byMunicipio}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  cursor={{ fill: '#f3f4f6' }}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {stats.byMunicipio.map((entry, index) => (
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