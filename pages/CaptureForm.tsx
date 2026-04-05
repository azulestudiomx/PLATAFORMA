import React, { useState, useEffect, useRef } from 'react';
import CameraModal from '../components/CameraModal';
import { db } from '../services/db';
import { Report, LocationData } from '../types';
import { reportsApi } from '../services/api';
import { MapContainer, TileLayer, Marker, useMapEvents, GeoJSON, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useConfig } from '../contexts/ConfigContext';
import { useAuth } from '../hooks/useAuth';
import Swal from 'sweetalert2';

// Fix for map rendering issues
const MapResizer = () => {
    const map = useMap();
    useEffect(() => {
        setTimeout(() => { map.invalidateSize(); }, 200);
    }, [map]);
    return null;
};

const GeoJSONWrapper = () => {
    const [geoData, setGeoData] = useState<any>(null);
    useEffect(() => {
        fetch('/campeche.json')
            .then(res => res.json())
            .then(data => setGeoData(data))
            .catch(err => console.warn('GeoJSON non-critical error:', err));
    }, []);
    if (!geoData) return null;
    return (
        <GeoJSON
            data={geoData}
            style={{ color: '#8B0000', weight: 1, fillColor: '#8B0000', fillOpacity: 0.05 }}
        />
    );
};

// Fix Leaflet marker icons in React
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const LocationSelector = ({ location, onLocationSelect }: { location: LocationData | null, onLocationSelect: (loc: LocationData) => void }) => {
    const map = useMapEvents({
        click(e) { onLocationSelect({ lat: e.latlng.lat, lng: e.latlng.lng }); },
    });
    useEffect(() => {
        if (location) { map.flyTo([location.lat, location.lng], map.getZoom()); }
    }, [location, map]);
    return location ? <Marker position={[location.lat, location.lng]} /> : null;
};

const MUNICIPALIOS = [
    "Campeche", "Carmen", "Champotón", "Escárcega", "Calkiní",
    "Hecelchakán", "Hopelchén", "Tenabo", "Candelaria",
    "Calakmul", "Palizada", "Seybaplaya", "Dzitbalché"
];

const DEFAULT_CENTER = { lat: 19.8301, lng: -90.5349 };

const CaptureForm: React.FC = () => {
    const { config } = useConfig();
    const { user } = useAuth();
    const [isCameraOpen, setIsCameraOpen] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [formData, setFormData] = useState({
        municipio: '',
        comunidad: '',
        needType: '',
        description: '',
    });
    const [customData, setCustomData] = useState<Record<string, any>>({});
    const [location, setLocation] = useState<LocationData | null>(null);
    const [loadingLoc, setLoadingLoc] = useState(false);
    const [images, setImages] = useState<string[]>([]);
    const [isSaving, setIsSaving] = useState(false);

    // Default to the first available needType when config loads
    useEffect(() => {
        if (!formData.needType && config.needTypes.length > 0) {
            setFormData(prev => ({ ...prev, needType: config.needTypes[0] }));
        }
    }, [config.needTypes, formData.needType]);

    const getLocation = () => {
        setLoadingLoc(true);
        if ('geolocation' in navigator) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                    setLoadingLoc(false);
                },
                (err) => {
                    console.error(err);
                    setLoadingLoc(false);
                    Swal.fire('Error', 'No se pudo obtener la ubicación. Verifique los permisos.', 'error');
                },
                { enableHighAccuracy: true }
            );
        } else {
            setLoadingLoc(false);
            Swal.fire('Error', 'Geolocalización no soportada.', 'error');
        }
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && images.length < 4) {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target?.result as string;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const MAX = 1024;
                    let w = img.width, h = img.height;
                    if (w > h) { if (w > MAX) { h *= MAX / w; w = MAX; } }
                    else { if (h > MAX) { w *= MAX / h; h = MAX; } }
                    canvas.width = w; canvas.height = h;
                    canvas.getContext('2d')?.drawImage(img, 0, 0, w, h);
                    const base64 = canvas.toDataURL('image/jpeg', 0.7);
                    setImages(prev => [...prev, base64].slice(0, 4));
                };
            };
        }
    };

    const removeImage = (index: number) => {
        setImages(prev => prev.filter((_, i) => i !== index));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!location) {
            Swal.fire('Ubicación requerida', 'Por favor selecciona una ubicación en el mapa o usa el botón de GPS.', 'warning');
            return;
        }

        setIsSaving(true);
        const newReport: any = {
            ...formData,
            location,
            evidenceBase64: images[0] || undefined,
            evidenceGallery: images,
            timestamp: Date.now(),
            synced: 0,
            status: 'Pendiente',
            user: user?.username || 'Desconocido',
            customData
        };

        try {
            // 1. Local Persistence (Offline Safe)
            const id = await db.reports.add(newReport);

            // 2. Immediate Sincronización
            try {
                await reportsApi.create(newReport);
                await db.reports.update(id, { synced: 1 });
            } catch (syncErr) {
                console.warn('Sync failed, report remains local:', syncErr);
            }

            Swal.fire({
                title: '¡Guardado!',
                text: 'El reporte se ha registrado exitosamente.',
                icon: 'success',
                timer: 2000,
                showConfirmButton: false,
                backdrop: `rgba(0,0,0,0.4)`
            });

            // Reset Form (maintain first needType)
            setFormData({
                municipio: '',
                comunidad: '',
                needType: config.needTypes[0] || '',
                description: '',
            });
            setCustomData({});
            setLocation(null);
            setImages([]);
        } catch (error) {
            console.error(error);
            Swal.fire('Error', 'Hubo un error al guardar el reporte.', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="max-w-5xl mx-auto pb-10">
            {/* Header Area */}
            <div className="mb-8">
                <h2 className="font-brand font-bold text-2xl text-gray-900 tracking-tight">Nuevo Levantamiento</h2>
                <p className="text-sm text-gray-400 mt-0.5">Captura información del ciudadano y evidencia del entorno</p>
            </div>

            <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 transition-all">
                
                {/* ── Left Side: Main Data ── */}
                <div className="lg:col-span-7 space-y-6">
                    <div className="bg-white rounded-2xl shadow-card p-4 sm:p-6 overflow-hidden">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 rounded-xl bg-red-50 text-brand-primary flex items-center justify-center shrink-0">
                                <i className="fas fa-file-invoice"></i>
                            </div>
                            <h3 className="font-semibold text-gray-800 text-base sm:text-lg">Datos Generales</h3>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">
                            <div>
                                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1.5 ml-1">Municipio</label>
                                <select
                                    value={formData.municipio}
                                    onChange={e => setFormData({ ...formData, municipio: e.target.value })}
                                    className="input-modern"
                                    required
                                >
                                    <option value="">Seleccione...</option>
                                    {MUNICIPALIOS.map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1.5 ml-1">Comunidad / Colonia</label>
                                <input
                                    type="text"
                                    value={formData.comunidad}
                                    onChange={e => setFormData({ ...formData, comunidad: e.target.value })}
                                    className="input-modern"
                                    placeholder="Ej. Centro"
                                    required
                                />
                            </div>
                        </div>

                        <div className="mb-5">
                            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1.5 ml-1">Tipo de Necesidad</label>
                            <select
                                value={formData.needType}
                                onChange={e => setFormData({ ...formData, needType: e.target.value })}
                                className="input-modern font-bold text-brand-primary"
                                required
                            >
                                {config.needTypes.map(type => (
                                    <option key={type} value={type}>{type}</option>
                                ))}
                                {config.needTypes.length === 0 && <option value="">Cargando catálogo...</option>}
                            </select>
                        </div>

                        <div>
                            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1.5 ml-1">Descripción del Ciudadano</label>
                            <textarea
                                value={formData.description}
                                onChange={e => setFormData({ ...formData, description: e.target.value })}
                                className="input-modern h-32 resize-none leading-relaxed"
                                placeholder="Describe el reporte o solicitud del ciudadano..."
                                required
                            />
                        </div>
                    </div>

                    {/* Dynamic Fields */}
                    {config.customFields.length > 0 && (
                        <div className="bg-white rounded-2xl shadow-card p-6">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                                    <i className="fas fa-plus-circle"></i>
                                </div>
                                <h3 className="font-semibold text-gray-800">Información Específica</h3>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                {config.customFields.map(field => (
                                    <div key={field.id}>
                                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1.5 ml-1">{field.label}</label>
                                        {field.type === 'select' ? (
                                            <select
                                                value={customData[field.id] || ''}
                                                onChange={e => setCustomData({ ...customData, [field.id]: e.target.value })}
                                                className="input-modern"
                                            >
                                                <option value="">Seleccione...</option>
                                                {field.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                            </select>
                                        ) : (
                                            <input
                                                type={field.type}
                                                value={customData[field.id] || ''}
                                                onChange={e => setCustomData({ ...customData, [field.id]: e.target.value })}
                                                className="input-modern"
                                                placeholder={field.label}
                                            />
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* ── Right Side: Map & Image ── */}
                <div className="lg:col-span-5 space-y-5 sm:space-y-6 group">
                    
                    {/* Evidence Capture */}
                    <div className="bg-white rounded-2xl shadow-card p-5 sm:p-6 h-full lg:h-auto">
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-6">
                            <h3 className="font-semibold text-gray-800 text-sm">Evidencia Fotográfica</h3>
                            <div className="flex items-center gap-2 w-full sm:w-auto">
                                <button
                                    type="button"
                                    onClick={() => setIsCameraOpen(true)}
                                    className="flex-1 sm:flex-none h-10 px-4 rounded-xl bg-brand-primary text-white font-bold text-[10px] hover:bg-brand-dark transition-all flex items-center justify-center gap-2 shadow-glow-red"
                                >
                                    <i className="fas fa-camera"></i> ABRIR CÁMARA
                                </button>
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    className="flex-1 sm:flex-none h-10 px-4 rounded-xl border border-gray-100 text-gray-400 font-bold text-[10px] hover:bg-gray-50 transition-all flex items-center justify-center gap-2"
                                >
                                    <i className="fas fa-file-upload"></i> SUBIR ARCHIVO
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 min-h-[160px]">
                            {images.map((img, idx) => (
                                <div key={idx} className="relative aspect-video rounded-xl overflow-hidden group border border-gray-100 shadow-sm">
                                    <img src={img} alt={`Evidencia ${idx + 1}`} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                                    <button 
                                        type="button" 
                                        onClick={() => removeImage(idx)}
                                        className="absolute top-2 right-2 w-7 h-7 rounded-lg bg-black/50 text-white flex items-center justify-center backdrop-blur-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                                    >
                                        <i className="fas fa-trash-alt text-[10px]"></i>
                                    </button>
                                    <div className="absolute bottom-0 inset-x-0 p-2 bg-gradient-to-t from-black/60 to-transparent">
                                        <p className="text-[8px] text-white font-bold uppercase tracking-widest">Foto {idx + 1}</p>
                                    </div>
                                </div>
                            ))}
                            
                            {images.length < 4 && (
                                <div 
                                    className="aspect-video rounded-xl border-2 border-dashed border-gray-100 bg-gray-50 flex flex-col items-center justify-center group cursor-pointer hover:bg-gray-100 transition-all"
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    <div className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center mb-2 text-slate-300 group-hover:text-brand-primary transition-colors">
                                        <i className="fas fa-camera text-sm"></i>
                                    </div>
                                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter">Capturar {images.length + 1}/4</p>
                                </div>
                            )}

                            {images.length === 0 && (
                                <div className="col-span-2 py-8 text-center bg-slate-50/50 rounded-xl border border-dashed border-gray-100">
                                     <i className="fas fa-images text-2xl text-slate-200 mb-2"></i>
                                     <p className="text-[10px] text-slate-400 font-bold uppercase">Sin evidencias capturadas</p>
                                </div>
                            )}

                            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" capture="environment" onChange={handleImageUpload} />
                        </div>
                    </div>

                    {/* Geolocation Section */}
                    <div className="bg-white rounded-2xl shadow-card overflow-hidden">
                        <div className="p-6 pb-0">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-semibold text-gray-800 text-sm">Ubicación GPS</h3>
                                <button
                                    type="button"
                                    onClick={getLocation}
                                    disabled={loadingLoc}
                                    className={`badge ${location ? 'badge-green' : 'badge-orange'} cursor-pointer hover:scale-105 active:scale-95 transition-all`}
                                >
                                    <i className={`fas ${loadingLoc ? 'fa-sync fa-spin' : 'fa-crosshairs'} text-[9px]`}></i>
                                    {loadingLoc ? 'Obteniendo...' : location ? 'Listo' : 'Obtener'}
                                </button>
                            </div>
                        </div>

                        <div className="h-64 sm:h-72 w-full relative z-0 mt-4 border-t border-gray-50">
                            <MapContainer center={DEFAULT_CENTER} zoom={13} style={{ height: '100%', width: '100%' }}>
                                <MapResizer />
                                <TileLayer 
                                    url="https://s.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                                />
                                <GeoJSONWrapper />
                                <LocationSelector location={location} onLocationSelect={setLocation} />
                            </MapContainer>
                        </div>
                        
                        <div className="p-4 bg-gray-50/50 flex flex-col gap-1">
                            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest pl-1">Coordenadas</p>
                            <div className="flex items-center gap-4">
                                <div className="text-xs font-mono text-slate-500">
                                    <span className="text-slate-400 mr-1">LAT:</span> {location?.lat.toFixed(6) || '—'}
                                </div>
                                <div className="text-xs font-mono text-slate-500">
                                    <span className="text-slate-400 mr-1">LNG:</span> {location?.lng.toFixed(6) || '—'}
                                </div>
                            </div>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={isSaving}
                        className="w-full btn-primary py-4 rounded-2xl shadow-glow-red font-bold text-base"
                    >
                        {isSaving ? (
                            <><i className="fas fa-circle-notch fa-spin"></i> Guardando Expediente...</>
                        ) : (
                            <><i className="fas fa-save"></i> Guardar Reporte</>
                        )}
                    </button>
                </div>
            </form>

            {isCameraOpen && (
                <CameraModal 
                    onCapture={(base64) => {
                        setImages(prev => [...prev, base64].slice(0, 4));
                        setIsCameraOpen(false);
                    }}
                    onClose={() => setIsCameraOpen(false)}
                />
            )}
        </div>
    );
};

export default CaptureForm;