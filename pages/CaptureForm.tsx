import React, { useState, useEffect } from 'react';
import { db } from '../services/db';
import { NeedType, Report, LocationData } from '../types';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';

// Fix Leaflet marker icons in React
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const MUNICIPALIOS = [
  "Campeche", "Carmen", "Champotón", "Escárcega", "Calkiní", 
  "Hecelchakán", "Hopelchén", "Tenabo", "Candelaria", 
  "Calakmul", "Palizada", "Seybaplaya", "Dzitbalché"
];

// Default center (Campeche City)
const DEFAULT_CENTER = { lat: 19.8301, lng: -90.5349 };

// Component to handle map clicks and location updates
const LocationSelector = ({ 
  location, 
  onLocationSelect 
}: { 
  location: LocationData | null, 
  onLocationSelect: (loc: LocationData) => void 
}) => {
  const map = useMapEvents({
    click(e) {
      onLocationSelect({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });

  useEffect(() => {
    if (location) {
      map.flyTo([location.lat, location.lng], map.getZoom());
    }
  }, [location, map]);

  return location ? <Marker position={[location.lat, location.lng]} /> : null;
};

const CaptureForm: React.FC = () => {
  const [formData, setFormData] = useState({
    municipio: '',
    comunidad: '',
    needType: NeedType.AGUA_POTABLE,
    description: '',
  });
  const [location, setLocation] = useState<LocationData | null>(null);
  const [loadingLoc, setLoadingLoc] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const getLocation = () => {
    setLoadingLoc(true);
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
          setLoadingLoc(false);
        },
        (error) => {
          console.error("Error getting location", error);
          setLoadingLoc(false);
          alert("No se pudo obtener la ubicación. Verifique los permisos.");
        },
        { enableHighAccuracy: true }
      );
    } else {
      setLoadingLoc(false);
      alert("Geolocalización no soportada en este dispositivo.");
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!location) {
      alert("Por favor obtenga la ubicación GPS o selecciónela en el mapa antes de guardar.");
      return;
    }
    
    setIsSaving(true);

    const newReport: Report = {
      ...formData,
      location,
      evidenceBase64: image,
      timestamp: Date.now(),
      synced: false, // Always false initially, sync service handles upload
      user: 'Usuario Actual' // In real app, get from auth context
    };

    try {
      // Offline-first approach: Always save to Dexie first
      await db.reports.add(newReport);
      
      setSuccessMsg("Reporte guardado localmente. Se sincronizará cuando haya conexión.");
      
      // Reset form
      setFormData({
        municipio: '',
        comunidad: '',
        needType: NeedType.AGUA_POTABLE,
        description: '',
      });
      setLocation(null);
      setImage(null);
      
    } catch (error) {
      console.error("Error al guardar:", error);
      alert("Error al guardar el reporte.");
    } finally {
      setIsSaving(false);
      setTimeout(() => setSuccessMsg(''), 5000);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold text-gray-800 mb-6 border-b-2 border-brand-accent pb-2 inline-block">
        Registrar Incidencia
      </h2>

      {successMsg && (
        <div className="mb-6 p-4 bg-green-100 border-l-4 border-green-500 text-green-700 rounded shadow-sm">
          <i className="fas fa-check-circle mr-2"></i>
          {successMsg}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white p-6 md:p-8 rounded-xl shadow-md border border-gray-100">
        
        {/* Municipio & Comunidad */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Municipio</label>
            <select
              required
              value={formData.municipio}
              onChange={e => setFormData({...formData, municipio: e.target.value})}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-primary focus:border-brand-primary bg-gray-50"
            >
              <option value="">Selecciona una opción</option>
              {MUNICIPALIOS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Comunidad</label>
            <input
              required
              type="text"
              value={formData.comunidad}
              onChange={e => setFormData({...formData, comunidad: e.target.value})}
              placeholder="Ej: Chiná, Lerma..."
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-primary focus:border-brand-primary bg-gray-50"
            />
          </div>
        </div>

        {/* GPS & Map */}
        <div className="mb-6">
          <label className="block text-sm font-semibold text-gray-700 mb-2">Ubicación (GPS)</label>
          
          {/* Coordinates Input & Button */}
          <div className="flex gap-4 mb-4">
            <input
              type="text"
              readOnly
              value={location ? `${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}` : ''}
              placeholder="Coordenadas no capturadas"
              className="flex-1 p-3 border border-gray-300 rounded-lg bg-gray-100 text-gray-600"
            />
            <button
              type="button"
              onClick={getLocation}
              disabled={loadingLoc}
              className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 rounded-lg transition-colors flex items-center justify-center min-w-[50px]"
              title="Obtener mi ubicación actual"
            >
              {loadingLoc ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-crosshairs"></i>}
            </button>
          </div>

          {/* Interactive Map */}
          <div className="h-64 w-full rounded-lg overflow-hidden border border-gray-300 relative z-0">
             <MapContainer 
                center={[DEFAULT_CENTER.lat, DEFAULT_CENTER.lng]} 
                zoom={9} 
                scrollWheelZoom={false}
                style={{ height: "100%", width: "100%" }}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <LocationSelector 
                location={location} 
                onLocationSelect={(loc) => setLocation(loc)} 
              />
            </MapContainer>
          </div>
          <p className="text-xs text-gray-500 mt-2 flex items-center gap-1">
             <i className="fas fa-info-circle"></i> 
             Toca el mapa para ajustar la ubicación manualmente.
          </p>
        </div>

        {/* Tipo de Necesidad */}
        <div className="mb-6">
          <label className="block text-sm font-semibold text-gray-700 mb-3">Tipo de Necesidad</label>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {Object.values(NeedType).map((type) => (
              <label 
                key={type} 
                className={`flex items-center p-3 border rounded-lg cursor-pointer transition-all ${
                  formData.needType === type 
                    ? 'border-brand-primary bg-red-50 text-brand-primary font-bold' 
                    : 'border-gray-200 hover:border-gray-300 text-gray-600'
                }`}
              >
                <input
                  type="radio"
                  name="needType"
                  value={type}
                  checked={formData.needType === type}
                  onChange={() => setFormData({...formData, needType: type})}
                  className="hidden"
                />
                <span className="text-sm">{type}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Descripción */}
        <div className="mb-6">
          <label className="block text-sm font-semibold text-gray-700 mb-2">Descripción Detallada</label>
          <textarea
            required
            rows={4}
            value={formData.description}
            onChange={e => setFormData({...formData, description: e.target.value})}
            placeholder="Describe con el mayor detalle posible la situación..."
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-primary focus:border-brand-primary bg-gray-50 resize-none"
          ></textarea>
        </div>

        {/* Evidencia */}
        <div className="mb-8">
          <label className="block text-sm font-semibold text-gray-700 mb-2">Evidencia Fotográfica</label>
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:bg-gray-50 transition-colors relative">
            <input
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            {image ? (
              <div className="flex flex-col items-center">
                 <img src={image} alt="Preview" className="h-32 object-contain mb-2 rounded shadow" />
                 <span className="text-xs text-green-600 font-bold">Imagen cargada</span>
              </div>
            ) : (
              <div className="text-gray-500">
                <i className="fas fa-cloud-upload-alt text-3xl mb-2 text-gray-400"></i>
                <p className="text-sm">Toca para subir una foto o tomarla</p>
                <p className="text-xs mt-1 text-gray-400">JPG, PNG hasta 10MB</p>
              </div>
            )}
          </div>
        </div>

        <button
          type="submit"
          disabled={isSaving}
          className="w-full bg-brand-primary hover:bg-red-800 text-white font-bold py-4 rounded-lg shadow-lg transition-transform transform active:scale-95 flex items-center justify-center gap-2"
        >
          {isSaving ? (
            <>
              <i className="fas fa-spinner fa-spin"></i> Guardando...
            </>
          ) : (
            <>
              <i className="fas fa-save"></i> Guardar Reporte
            </>
          )}
        </button>
      </form>
    </div>
  );
};

export default CaptureForm;