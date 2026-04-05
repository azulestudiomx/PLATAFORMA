import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, 
  PieChart, Pie, AreaChart, Area, Legend
} from 'recharts';
import { MapContainer, TileLayer, Marker, Popup, GeoJSON, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.heat';
import { Report } from '../types';
import { reportsApi, peopleApi } from '../services/api';

// Helper for GeoJSON layer
const GeoJSONWrapper = () => {
    const [geoData, setGeoData] = useState<any>(null);
    useEffect(() => {
        fetch('https://raw.githubusercontent.com/gcornejoa/mexico-geojson/master/estados/campeche.json')
            .then(res => res.json())
            .then(data => setGeoData(data))
            .catch(err => console.error('Error loading GeoJSON:', err));
    }, []);
    if (!geoData) return null;
    return (
        <GeoJSON 
            data={geoData} 
            style={{ color: '#8B0000', weight: 1.5, fillColor: '#8B0000', fillOpacity: 0.05 }} 
        />
    );
};

// Heatmap logic
const HeatmapLayer = ({ points }: { points: [number, number, number][] }) => {
    const map = useMap();
    useEffect(() => {
        if (!points.length) return;
        // @ts-ignore
        const heat = L.heatLayer(points, { radius: 20, blur: 15, max: 1.0, gradient: { 0.4: 'blue', 0.6: 'cyan', 0.7: 'lime', 0.8: 'yellow', 1: 'red' } }).addTo(map);
        return () => { map.removeLayer(heat); };
    }, [points, map]);
    return null;
};

// Fix Leaflet marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const COLORS = ['#8B0000', '#D97706', '#059669', '#2563EB', '#7C3AED', '#DB2777', '#4B5563'];

const Dashboard: React.FC = () => {
    const [showHeatmap, setShowHeatmap] = useState(false);

    const { data: reportsData, isLoading: loadingReports, refetch } = useQuery({
        queryKey: ['reports', 'dashboard'],
        queryFn: () => reportsApi.list(1, 500), // Get a larger sample for stats
        refetchInterval: 60000,
    });

    const { data: peopleData } = useQuery({
        queryKey: ['people', 'stats'],
        queryFn: () => peopleApi.list(),
    });

    const reports: Report[] = reportsData?.data || [];
    const peopleCount = peopleData?.length || 0;
    const loading = loadingReports;

    // --- Analytics Logic ---
    
    // 1. Need Type Distribution (Pie Chart)
    const needStats = Object.entries(
        reports.reduce((acc, r) => {
            acc[r.needType] = (acc[r.needType] || 0) + 1;
            return acc;
        }, {} as Record<string, number>)
    ).map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

    // 2. Reports Timeline (Area Chart)
    const timelineData = Object.entries(
        reports.reduce((acc, r) => {
            const date = new Date(r.timestamp).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit' });
            acc[date] = (acc[date] || 0) + 1;
            return acc;
        }, {} as Record<string, number>)
    ).map(([name, value]) => ({ name, value }))
    .slice(-10); // Last 10 days

    // 3. Municipality Breakdown
    const munStats = Object.entries(
        reports.reduce((acc, r) => {
            acc[r.municipio] = (acc[r.municipio] || 0) + 1;
            return acc;
        }, {} as Record<string, number>)
    ).map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

    const resolvedCount = reports.filter(r => r.status === 'Resuelto').length;
    const completionRate = reports.length > 0 ? Math.round((resolvedCount / reports.length) * 100) : 0;

    return (
        <div className="max-w-7xl mx-auto space-y-6 pb-20">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className="font-brand font-bold text-2xl text-gray-900 tracking-tight">Monitor de Gestión Ciudadana</h2>
                    <p className="text-sm text-gray-400 mt-0.5">Indicadores de impacto y distribución territorial en tiempo real</p>
                </div>
                <button onClick={() => refetch()} className="btn-ghost py-2 text-xs h-10 border border-gray-100 bg-white">
                    <i className={`fas fa-sync-alt mr-2 ${loading ? 'animate-spin' : ''}`}></i> Actualizar Datos
                </button>
            </div>

            {/* KPI Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white p-5 rounded-2xl shadow-card border border-gray-50 group hover:border-brand-primary/20 transition-all">
                    <div className="flex justify-between items-start mb-3">
                        <div className="w-10 h-10 rounded-xl bg-red-50 text-brand-primary flex items-center justify-center">
                            <i className="fas fa-file-signature text-sm"></i>
                        </div>
                        <span className="text-[10px] font-bold text-green-500 bg-green-50 px-2 py-0.5 rounded-full">+12%</span>
                    </div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Expedientes Totales</p>
                    <p className="text-3xl font-brand font-bold text-slate-800 leading-none">{reports.length}</p>
                </div>
                <div className="bg-white p-5 rounded-2xl shadow-card border border-gray-50 group hover:border-brand-primary/20 transition-all">
                    <div className="flex justify-between items-start mb-3">
                        <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                            <i className="fas fa-hourglass-half text-sm"></i>
                        </div>
                        <span className="text-[10px] font-bold text-amber-500 bg-amber-50 px-2 py-0.5 rounded-full">Activos</span>
                    </div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Pendientes</p>
                    <p className="text-3xl font-brand font-bold text-slate-800 leading-none">{reports.filter(r => r.status !== 'Resuelto').length}</p>
                </div>
                <div className="bg-white p-5 rounded-2xl shadow-card border border-gray-50 group hover:border-brand-primary/20 transition-all">
                    <div className="flex justify-between items-start mb-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                            <i className="fas fa-check-double text-sm"></i>
                        </div>
                        <span className="text-[10px] font-bold text-emerald-500 bg-emerald-50 px-2 py-0.5 rounded-full">{completionRate}%</span>
                    </div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Tasa de Resolución</p>
                    <p className="text-3xl font-brand font-bold text-slate-800 leading-none">{resolvedCount}</p>
                </div>
                <div className="bg-white p-5 rounded-2xl shadow-card border border-gray-50 group hover:border-brand-primary/20 transition-all">
                    <div className="flex justify-between items-start mb-3">
                        <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                            <i className="fas fa-users text-sm"></i>
                        </div>
                        <span className="text-[10px] font-bold text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-full">Padrón</span>
                    </div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Ciudadanos</p>
                    <p className="text-3xl font-brand font-bold text-slate-800 leading-none">{peopleCount}</p>
                </div>
            </div>

            {/* Main Visuals Row */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Map Control */}
                <div className="lg:col-span-8 bg-white rounded-3xl shadow-card border border-gray-50 overflow-hidden min-h-[500px] flex flex-col">
                    <div className="p-5 border-b border-gray-50 flex justify-between items-center bg-slate-50/30">
                        <div>
                            <h3 className="font-bold text-slate-800">Distribución Territorial</h3>
                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Geolocalización de solicitudes</p>
                        </div>
                        <div className="flex gap-2">
                             <button onClick={() => setShowHeatmap(false)} className={`px-4 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all ${!showHeatmap ? 'bg-brand-primary text-white shadow-glow-red' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}>Marcadores</button>
                             <button onClick={() => setShowHeatmap(true)} className={`px-4 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all ${showHeatmap ? 'bg-brand-primary text-white shadow-glow-red' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}>Calor</button>
                        </div>
                    </div>
                    <div className="flex-1 relative z-0">
                        <MapContainer center={[19.8301, -90.5349]} zoom={8} style={{ height: "100%", width: "100%" }}>
                            <TileLayer 
                                url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                            />
                            <GeoJSONWrapper />
                            {showHeatmap ? (
                                <HeatmapLayer points={reports.filter(r => r.location?.lat).map(r => [r.location!.lat, r.location!.lng, 1])} />
                            ) : (
                                reports.map((r, i) => r.location?.lat && (
                                    <Marker key={i} position={[r.location.lat, r.location.lng]}>
                                        <Popup>
                                            <div className="p-1">
                                                <p className="text-xs font-bold text-brand-primary mb-1">{r.municipio}</p>
                                                <p className="text-[10px] font-bold uppercase text-gray-400 mb-1">{r.needType}</p>
                                                <p className="text-[11px] text-slate-600 line-clamp-2">{r.description}</p>
                                            </div>
                                        </Popup>
                                    </Marker>
                                ))
                            )}
                        </MapContainer>
                    </div>
                </div>

                {/* Vertical Distribution Charts */}
                <div className="lg:col-span-4 space-y-6">
                    {/* Need types Doughnut */}
                    <div className="bg-white rounded-3xl shadow-card border border-gray-50 p-6 flex flex-col h-[300px]">
                        <h3 className="font-bold text-slate-800 text-sm mb-1">Categorías</h3>
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-4">Tipos de necesidad</p>
                        <div className="flex-1 min-h-0">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={needStats} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                                        {needStats.map((_, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip contentStyle={{ borderRadius: '15px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="grid grid-cols-2 gap-2 mt-2">
                             {needStats.slice(0, 4).map((s, i) => (
                                 <div key={i} className="flex items-center gap-1.5">
                                     <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }}></div>
                                     <span className="text-[9px] font-bold text-gray-500 truncate">{s.name}</span>
                                 </div>
                             ))}
                        </div>
                    </div>

                    {/* Timeline Area Chart */}
                    <div className="bg-white rounded-3xl shadow-card border border-gray-50 p-6 flex flex-col h-[300px]">
                        <h3 className="font-bold text-slate-800 text-sm mb-1">Actividad Reciente</h3>
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-4">Reportes por día</p>
                        <div className="flex-1 min-h-0">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={timelineData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#8B0000" stopOpacity={0.2}/>
                                            <stop offset="95%" stopColor="#8B0000" stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#94a3b8' }} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#94a3b8' }} />
                                    <Tooltip contentStyle={{ borderRadius: '15px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }} />
                                    <Area type="monotone" dataKey="value" stroke="#8B0000" fillOpacity={1} fill="url(#colorVal)" strokeWidth={3} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom Row - Municipality breakdown */}
            <div className="bg-white rounded-3xl shadow-card border border-gray-50 p-6">
                 <div className="flex justify-between items-center mb-6">
                    <div>
                        <h3 className="font-bold text-slate-800 text-base">Impacto por Municipio</h3>
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Ranking de solicitudes levantadas</p>
                    </div>
                    <i className="fas fa-chart-line text-brand-primary/20 text-2xl"></i>
                 </div>
                 <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={munStats} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                            <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                            <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b', fontWeight: 'bold' }} width={80} />
                            <Tooltip contentStyle={{ borderRadius: '15px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }} />
                            <Bar dataKey="value" radius={[0, 10, 10, 0]} barSize={20}>
                                {munStats.map((_, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                 </div>
            </div>
        </div>
    );
};

export default Dashboard;