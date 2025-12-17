import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../src/config';
import { db } from '../services/db';
import { NeedType, Report, LocationData } from '../types';
import { MapContainer, TileLayer, Marker, useMapEvents, GeoJSON, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useConfig } from '../contexts/ConfigContext';
import Swal from 'sweetalert2';

// Fix for map rendering issues
const MapResizer = () => {
  const map = useMap();
  useEffect(() => {
    setTimeout(() => {
      map.invalidateSize();
    }, 100);
  }, [map]);
  return null;
};

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
  const { config } = useConfig();
  const [formData, setFormData] = useState({
    municipio: '',
    comunidad: '',
    needType: NeedType.AGUA_POTABLE,
    description: '',
  });
  const [customData, setCustomData] = useState<Record<string, any>>({});
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
          Swal.fire('Error', 'No se pudo obtener la ubicación. Verifique los permisos.', 'error');
        },
        { enableHighAccuracy: true }
      );
    } else {
      setLoadingLoc(false);
      Swal.fire('Error', 'Geolocalización no soportada en este dispositivo.', 'error');
    }
  };


  const resizeImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 1024;
          const MAX_HEIGHT = 1024;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.7)); // Compress to 70% quality
        };
        img.onerror = (error) => reject(error);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const resizedBase64 = await resizeImage(file);
        setFormData(prev => ({ ...prev, evidenceBase64: resizedBase64 }));
        setImage(resizedBase64);
      } catch (error) {
        console.error("Error resizing image:", error);
        Swal.fire('Error', 'Error al procesar la imagen', 'error');
      }
    }
  };

  const handleCustomFieldChange = (id: string, value: any) => {
    setCustomData(prev => ({
      ...prev,
      [id]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!location) {
      Swal.fire('Atención', 'Por favor obtenga la ubicación GPS o selecciónela en el mapa antes de guardar.', 'warning');
      return;
    }

    setIsSaving(true);

    const newReport: Report = {
      municipio: formData.municipio,
      comunidad: formData.comunidad,
      location: location,
      needType: formData.needType,
      description: formData.description,
      evidenceBase64: image || undefined,
      timestamp: Date.now(),
      synced: 0, // 0 = false (not synced)
      status: 'Pendiente',
      customData: customData // Save custom fields
    };

    try {
      // 1. Save to IndexedDB (Offline First)
      const id = await db.reports.add(newReport);
      console.log(`Reporte guardado localmente con ID: ${id}`);

      // 2. Try to sync immediately if online
      if (navigator.onLine) {
        try {
          const res = await fetch(`${API_BASE_URL}/api/reports`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newReport)
          });

          if (res.ok) {
            const serverData = await res.json();
            // Update local record as synced
            await db.reports.update(id, { synced: 1 });
            console.log('Reporte sincronizado automáticamente');
          }
        } catch (err) {
          console.warn('No se pudo sincronizar inmediatamente, se queda en local.');
        }
      }

      setSuccessMsg('Reporte guardado exitosamente.');
      Swal.fire({
        title: '¡Éxito!',
        text: 'Reporte guardado exitosamente.',
        icon: 'success',
        timer: 2000,
        showConfirmButton: false
      });

      setFormData({
        municipio: '',
        comunidad: '',
        needType: NeedType.AGUA_POTABLE,
        description: '',
      });
      setCustomData({});
      setLocation(null);
      setImage(null);

      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (error) {
      console.error("Error al guardar reporte:", error);
      Swal.fire('Error', 'Hubo un error al guardar el reporte.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
      <div className="bg-brand-primary p-6 text-white">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <i className="fas fa-clipboard-list"></i> Nuevo Reporte
        </h2>
        <p className="text-red-100 mt-1">Complete la información del levantamiento en campo.</p>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-6">
        {successMsg && (
          <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded relative animate-fade-in">
            <strong className="font-bold"><i className="fas fa-check-circle mr-2"></i>¡Éxito!</strong>
            <span className="block sm:inline">{successMsg}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-gray-700 text-sm font-bold mb-2">Municipio</label>
            <select
              value={formData.municipio}
              onChange={(e) => setFormData({ ...formData, municipio: e.target.value })}
              className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:border-brand-primary focus:ring-2 focus:ring-red-200 outline-none transition-all"
              required
            >
              <option value="">Seleccione...</option>
              {MUNICIPALIOS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-gray-700 text-sm font-bold mb-2">Comunidad / Colonia</label>
            <input
              type="text"
              value={formData.comunidad}
              onChange={(e) => setFormData({ ...formData, comunidad: e.target.value })}
              className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:border-brand-primary focus:ring-2 focus:ring-red-200 outline-none transition-all"
              required
              placeholder="Ej. Centro"
            />
          </div>
        </div>

        <div>
          <label className="block text-gray-700 text-sm font-bold mb-2">Tipo de Necesidad</label>
          <select
            value={formData.needType}
            onChange={(e) => setFormData({ ...formData, needType: e.target.value as NeedType })}
            className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:border-brand-primary focus:ring-2 focus:ring-red-200 outline-none transition-all"
          >
            {config.needTypes.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>

        {/* Dynamic Fields Section */}
        {config.customFields.length > 0 && (
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
            <h3 className="text-sm font-bold text-gray-500 uppercase mb-4 border-b pb-2">Información Adicional</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {config.customFields.map((field) => (
                <div key={field.id}>
                  <label className="block text-gray-700 text-sm font-bold mb-2">{field.label}</label>
                  {field.type === 'select' ? (
                    <select
                      value={customData[field.id] || ''}
                      onChange={(e) => handleCustomFieldChange(field.id, e.target.value)}
                      className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:border-brand-primary focus:ring-2 focus:ring-red-200 outline-none"
                    >
                      <option value="">Seleccione...</option>
                      {field.options?.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={field.type}
                      value={customData[field.id] || ''}
                      onChange={(e) => handleCustomFieldChange(field.id, e.target.value)}
                      className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:border-brand-primary focus:ring-2 focus:ring-red-200 outline-none"
                      placeholder={field.label}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="block text-gray-700 text-sm font-bold mb-2">Descripción Detallada</label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:border-brand-primary focus:ring-2 focus:ring-red-200 outline-none transition-all h-24 resize-none"
            placeholder="Describa la situación..."
            required
          />
        </div>

        <div>
          <label className="block text-gray-700 text-sm font-bold mb-2">Evidencia Fotográfica</label>
          <div className="flex items-center justify-center w-full">
            <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <i className="fas fa-camera text-3xl text-gray-400 mb-2"></i>
                <p className="mb-2 text-sm text-gray-500"><span className="font-semibold">Toque para subir</span> o tomar foto</p>
              </div>
              <input type="file" className="hidden" accept="image/*" capture="environment" onChange={handleImageUpload} />
            </label>
          </div>
          {image && (
            <div className="mt-4 relative w-full h-48 rounded-lg overflow-hidden shadow-md">
              <img src={image} alt="Preview" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => setImage(null)}
                className="absolute top-2 right-2 bg-red-600 text-white p-1 rounded-full shadow-lg hover:bg-red-700 transition-colors"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
          )}
        </div>

        <div>
          <label className="block text-gray-700 text-sm font-bold mb-2">Ubicación GPS</label>
          <div className="flex gap-2 mb-4">
            <button
              type="button"
              onClick={getLocation}
              disabled={loadingLoc}
              className="flex-1 bg-gray-800 text-white px-4 py-2 rounded-lg hover:bg-gray-900 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loadingLoc ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-map-marker-alt"></i>}
              Obtener Ubicación
            </button>
          </div>

          <div className="h-64 rounded-lg overflow-hidden border border-gray-300 shadow-inner relative z-0">
            <MapContainer center={DEFAULT_CENTER} zoom={13} style={{ height: '100%', width: '100%' }}>
              <MapResizer />
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              />
              <GeoJSONWrapper />
              <LocationSelector location={location} onLocationSelect={setLocation} />
            </MapContainer>
          </div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Evidencia Fotográfica</label>
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:bg-gray-50 transition-colors relative">
            <input
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
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