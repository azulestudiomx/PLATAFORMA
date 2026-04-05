import React, { useState, useEffect, useRef } from 'react';
import { peopleApi } from '../services/api';
import { db } from '../services/db'; // Using the centralized Dexie DB
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';
import * as XLSX from 'xlsx';
import Webcam from 'react-webcam';
import Swal from 'sweetalert2';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for map rendering issues
const MapResizer = () => {
    const map = useMap();
    useEffect(() => {
        setTimeout(() => { map.invalidateSize(); }, 200);
    }, [map]);
    return null;
};

// Fix Leaflet marker icons in React
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface Person {
    id?: number;
    _id?: string;
    name: string;
    phone: string;
    address: string;
    ine: string;
    photo?: string;
    inePhoto?: string;
    lat?: number;
    lng?: number;
    synced?: number;
}

const PeoplePage: React.FC = () => {
    const [people, setPeople] = useState<Person[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formData, setFormData] = useState<Person>({
        name: '',
        phone: '',
        address: '',
        ine: '',
        photo: '',
        inePhoto: ''
    });
    const [saving, setSaving] = useState(false);
    const [cameraMode, setCameraMode] = useState<'photo' | 'ine' | null>(null);
    const [showMap, setShowMap] = useState(false);
    const webcamRef = useRef<Webcam>(null);
    
    const closeModal = () => {
        setShowModal(false);
        setEditingId(null);
        setFormData({ name: '', phone: '', address: '', ine: '', photo: '', inePhoto: '' });
    };

    useEffect(() => {
        fetchPeople();
    }, []);

    const fetchPeople = async () => {
        setLoading(true);
        try {
            // 1. Get all local records
            const localAll = await db.people.toArray();
            
            // 2. Fetch from server (API)
            try {
                const serverData = await peopleApi.list();
                
                // 3. Smart Merge: Start with local data
                const combined = [...localAll];
                
                // Add server records if they don't exist locally (by INE or _id)
                serverData.forEach((s: any) => {
                    const existsLocally = combined.some(l => l.ine === s.ine || l._id === s.id);
                    if (!existsLocally) {
                        combined.push({ 
                          ...s, 
                          id: undefined, 
                          _id: s.id, 
                          synced: 1 
                        });
                    } else {
                        // Update local record with server _id if matched by INE
                        const idx = combined.findIndex(l => l.ine === s.ine);
                        if (idx !== -1 && !combined[idx]._id) {
                            combined[idx]._id = s.id;
                        }
                    }
                });

                setPeople(combined);
            } catch (err) {
                console.warn('Backend server unreachable, showing local data only.', err);
                setPeople(localAll);
            }
        } catch (error) {
            console.error('Error in fetchPeople:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSync = async () => {
        const localRaw = await db.people.toArray();
        const unsynced = localRaw.filter(r => r.synced !== 1);
        
        if (unsynced.length === 0) {
            Swal.fire({ title: 'Sincronizado', text: 'No hay datos nuevos para enviar.', icon: 'info' });
            return;
        }

        let syncedCount = 0;
        for (const person of unsynced) {
            try {
                await peopleApi.create(person);
                await db.people.update(person.id!, { synced: 1 });
                syncedCount++;
            } catch (err) {
                console.error('Sync failed for:', person.name, err);
            }
        }
        
        Swal.fire({
            title: 'Sincronización Completada',
            text: `Se enviaron ${syncedCount} registros.`,
            icon: 'success'
        });
        fetchPeople();
    };

    const handleExportPDF = () => {
        const doc = new jsPDF();
        doc.text('Padrón de Ciudadanos - Campeche', 14, 15);
        const tableData = people.map(p => [p.name, p.ine, p.phone, p.address]);
        autoTable(doc, { head: [['Nombre', 'Folio INE', 'Teléfono', 'Dirección']], body: tableData, startY: 20 });
        doc.save('padron_ciudadanos_campeche.pdf');
    };

    const handleEdit = (person: Person) => {
        setEditingId(person._id || (person.id ? String(person.id) : null));
        setFormData({ ...person });
        setShowModal(true);
    };

    const capturePhoto = () => {
        const imageSrc = webcamRef.current?.getScreenshot();
        if (imageSrc) {
            if (cameraMode === 'photo') setFormData({ ...formData, photo: imageSrc });
            if (cameraMode === 'ine') setFormData({ ...formData, inePhoto: imageSrc });
            setCameraMode(null);
        }
    };

    const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setLoading(true);
        try {
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data);
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(worksheet);
            let importedCount = 0;
            for (const row of jsonData as any[]) {
                const name = row['Nombre'] || row['nombre'] || row['Name'];
                const ine = row['INE'] || row['ine'] || row['Clave'] || '';
                const phone = row['Telefono'] || row['telefono'] || row['Phone'] || '';
                const address = row['Direccion'] || row['direccion'] || row['Address'] || '';
                if (!name) continue;
                const newPerson: Person = {
                    name, 
                    ine: ine.toString().toUpperCase(), 
                    phone: phone.toString(), 
                    address, 
                    synced: 0
                };
                await db.people.add(newPerson);
                importedCount++;
            }
            Swal.fire('Éxito', `Se importaron ${importedCount} registros correctamente.`, 'success');
            fetchPeople();
            handleSync(); // Attempt to sync in background
        } catch (error) {
            Swal.fire('Error', 'No se pudo procesar el archivo Excel.', 'error');
        } finally {
            setLoading(false);
            if (e.target) e.target.value = '';
        }
    };

    const handleDownloadTemplate = () => {
        const ws = XLSX.utils.json_to_sheet([
            { Nombre: 'Juan Pérez', INE: 'ABC1234567890', Telefono: '9811234567', Direccion: 'Centro, Campeche' }
        ]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Plantilla");
        XLSX.writeFile(wb, "plantilla_padron.xlsx");
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        const personData = { ...formData, synced: 0 };

        try {
            let finalId = personData.id;

            if (editingId) {
                // Update Local (Dexie)
                if (personData.id) {
                    await db.people.update(personData.id, personData);
                } else {
                    // Fallback search by INE if somehow ID is missing but we're editing
                    const existing = await db.people.where('ine').equals(personData.ine).first();
                    if (existing) await db.people.update(existing.id!, personData);
                }
                
                // Update Remote if synced
                if (personData._id) {
                    try {
                        await peopleApi.update(personData._id, personData);
                        if (personData.id) await db.people.update(personData.id, { synced: 1 });
                    } catch (syncErr) {
                        console.warn('Remote update failed, kept locally.');
                    }
                }
            } else {
                // Create New Local
                const newId = await db.people.add(personData);
                finalId = newId;

                // Immediate Sync Attempt
                try {
                    const saved = await peopleApi.create(personData);
                    await db.people.update(newId, { synced: 1, _id: saved.id });
                } catch (syncErr) {
                    console.warn('Sync failed, saved locally only.');
                }
            }

            setShowModal(false);
            setEditingId(null);
            setFormData({ name: '', phone: '', address: '', ine: '', photo: '', inePhoto: '' });
            fetchPeople();
            Swal.fire({ 
                title: editingId ? '¡Actualizado!' : '¡Guardado!', 
                text: editingId ? 'Cambios guardados.' : 'Registro completado.', 
                icon: 'success', 
                timer: 1500, 
                showConfirmButton: false 
            });
        } catch (error) {
            console.error('Save error:', error);
            Swal.fire({ title: 'Error', text: 'No se pudo guardar el registro.', icon: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        const result = await Swal.fire({
            title: '¿Confirmar eliminación?',
            text: "Esta acción removerá a la persona del padrón nacional.",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#8B0000',
            confirmButtonText: 'Sí, eliminar',
            cancelButtonText: 'Cancelar'
        });

        if (result.isConfirmed) {
            try {
                await peopleApi.delete(id);
                fetchPeople();
                Swal.fire('Eliminado', 'El registro ha sido removido.', 'success');
            } catch (error) {
                Swal.fire('Error', 'Hubo un fallo al intentar eliminar.', 'error');
            }
        }
    };

    const generateCredential = async (person: Person) => {
        try {
            const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [85.6, 53.98] });
            
            // Premium background & Header
            doc.setFillColor(252, 252, 252); doc.rect(0, 0, 85.6, 53.98, 'F');
            doc.setFillColor(139, 0, 0); doc.rect(0, 0, 85.6, 12, 'F');
            
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(8); doc.setFont('helvetica', 'bold');
            doc.text('PLATAFORMA CIUDADANA CAMPECHE', 42.8, 7, { align: 'center' });

            // Photo with rounded-like rect
            if (person.photo) {
                doc.addImage(person.photo, 'JPEG', 4, 15, 22, 22);
            } else {
                doc.setDrawColor(230); doc.rect(4, 15, 22, 22);
                doc.setFontSize(6); doc.setTextColor(180); doc.text('SIN FOTO', 15, 26, { align: 'center' });
            }

            // Text Info
            doc.setTextColor(30, 30, 30);
            doc.setFontSize(9); doc.setFont('helvetica', 'bold');
            doc.text(person.name.toUpperCase(), 30, 20);

            doc.setFontSize(6); doc.setTextColor(120); doc.setFont('helvetica', 'normal');
            doc.text('FOLIO INE:', 30, 25);
            doc.setTextColor(139, 0, 0); doc.setFont('helvetica', 'bold');
            doc.text(person.ine || 'PENDIENTE', 30, 28);

            doc.setFontSize(6); doc.setTextColor(120); doc.setFont('helvetica', 'normal');
            doc.text('TELEFONO:', 30, 33);
            doc.setTextColor(0, 0, 0); doc.setFont('helvetica', 'bold');
            doc.text(person.phone || 'NO PROPORCIONADO', 30, 36);

            // QR Code
            const qrData = `INE:${person.ine}|NAME:${person.name}|PLATAFORMA`;
            const qrUrl = await QRCode.toDataURL(qrData);
            doc.addImage(qrUrl, 'PNG', 62, 18, 20, 20);

            // Footer branding
            doc.setFontSize(4); doc.setTextColor(200);
            doc.text('DESARROLLADO POR AZUL ESTUDIOS MX', 42.8, 51, { align: 'center' });

            doc.save(`Credencial_${person.name.replace(/\s+/g, '_')}.pdf`);
        } catch (error) {
            Swal.fire({ title: 'Error', text: 'No se pudo generar la credencial.', icon: 'error' });
        }
    };

    const filteredPeople = people.filter(p =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.ine.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="max-w-7xl mx-auto space-y-6 pb-20">
            {/* Header Area */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                <div>
                    <h2 className="font-brand font-bold text-2xl text-gray-900 tracking-tight">Padrón de Ciudadanos</h2>
                    <p className="text-sm text-gray-400 mt-0.5">Base de datos unificada de beneficiarios y afiliados</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
                    <button onClick={handleSync} className="btn-ghost py-2 text-xs h-10 border border-gray-100 bg-white flex-1 lg:flex-none">
                        <i className="fas fa-sync-alt mr-2 text-blue-500"></i> Sincronizar
                    </button>
                    <div className="relative flex-1 lg:flex-none">
                        <input
                            type="file"
                            accept=".xlsx, .xls, .csv"
                            onChange={handleImport}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                        <button className="btn-ghost w-full py-2 text-xs h-10 border border-gray-100 bg-white">
                            <i className="fas fa-file-excel mr-2 text-green-600"></i> Importar Excel
                        </button>
                    </div>
                    <button onClick={handleDownloadTemplate} className="btn-ghost py-2 text-xs h-10 border border-gray-100 bg-white flex-1 lg:flex-none" title="Descargar Plantilla">
                        <i className="fas fa-download mr-2 text-gray-400"></i> Plantilla
                    </button>
                    <button 
                        onClick={() => { setEditingId(null); setFormData({ name: '', phone: '', address: '', ine: '', photo: '', inePhoto: '' }); setShowModal(true); }}
                        className="btn-primary py-2 text-xs h-10 shadow-glow-red flex-1 lg:flex-none"
                    >
                        <i className="fas fa-plus mr-2"></i> Agregar Registro
                    </button>
                </div>
            </div>

            {/* Dashboard Mini Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-2xl shadow-card border border-gray-50 flex items-center gap-4 group cursor-pointer hover:border-brand-primary/20 transition-all">
                    <div className="w-12 h-12 rounded-xl bg-red-50 text-brand-primary flex items-center justify-center shrink-0">
                        <i className="fas fa-users text-lg"></i>
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none mb-1">Total Padrón</p>
                        <p className="text-xl font-brand font-bold text-slate-800 leading-none">{people.length}</p>
                    </div>
                </div>
                <div className="bg-white p-4 rounded-2xl shadow-card border border-gray-50 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                        <i className="fas fa-cloud-upload-alt text-lg"></i>
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none mb-1">Pendientes</p>
                        <p className="text-xl font-brand font-bold text-slate-800 leading-none">{people.filter(p => !p.synced).length}</p>
                    </div>
                </div>
                <button onClick={() => setShowMap(!showMap)} className="bg-white p-4 rounded-2xl shadow-card border border-gray-50 flex items-center gap-4 hover:bg-slate-50 transition-colors">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${showMap ? 'bg-brand-primary text-white' : 'bg-green-50 text-green-600'}`}>
                        <i className={`fas ${showMap ? 'fa-list-ul' : 'fa-map-marked-alt'} text-lg`}></i>
                    </div>
                    <div className="text-left">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none mb-1">Visualización</p>
                        <p className="text-base font-brand font-bold text-slate-800 leading-none">{showMap ? 'Ver Lista' : 'Ver Mapa'}</p>
                    </div>
                </button>
                <button onClick={handleExportPDF} className="bg-white p-4 rounded-2xl shadow-card border border-gray-50 flex items-center gap-4 hover:bg-slate-50 transition-colors">
                    <div className="w-12 h-12 rounded-xl bg-slate-50 text-slate-600 flex items-center justify-center shrink-0">
                        <i className="fas fa-file-export text-lg"></i>
                    </div>
                    <div className="text-left">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none mb-1">Herramientas</p>
                        <p className="text-base font-brand font-bold text-slate-800 leading-none">Exportar PDF</p>
                    </div>
                </button>
            </div>

            {/* List & Search */}
            <div className="bg-white rounded-3xl shadow-card border border-gray-50 overflow-hidden min-h-[500px]">
                <div className="p-4 sm:p-6 border-b border-gray-50 flex flex-col sm:flex-row gap-4 items-center">
                    <div className="relative flex-1 w-full">
                        <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-xs translate-y-[-1px]"></i>
                        <input
                            type="text"
                            placeholder="Buscar en el padrón por nombre o INE..."
                            className="input-modern pl-10 h-11 text-sm"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                {showMap ? (
                    <div className="h-[600px] w-full relative z-0">
                        <MapContainer center={[19.8301, -90.5349]} zoom={8} style={{ height: "100%", width: "100%" }}>
                            <MapResizer />
                            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                            {people.map((person, idx) => (
                                (person.lat && person.lng) && (
                                    <Marker key={idx} position={[person.lat, person.lng]}>
                                        <Popup>
                                            <div className="p-1 text-center">
                                                {person.photo && <img src={person.photo} className="w-16 h-16 rounded-xl mx-auto mb-2 object-cover" />}
                                                <h3 className="font-bold text-sm text-brand-primary">{person.name}</h3>
                                                <p className="text-[10px] uppercase font-bold text-gray-400">{person.ine}</p>
                                            </div>
                                        </Popup>
                                    </Marker>
                                )
                            ))}
                        </MapContainer>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-50 table-fixed lg:table-auto">
                            <thead>
                                <tr className="bg-slate-50/50">
                                    <th className="px-6 py-4 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest w-1/3">Ciudadano</th>
                                    <th className="px-6 py-4 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">INE / Clave</th>
                                    <th className="px-6 py-4 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest hidden sm:table-cell">Teléfono</th>
                                    <th className="px-6 py-4 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">Sinc</th>
                                    <th className="px-6 py-4 text-right text-[10px] font-bold text-gray-400 uppercase tracking-widest">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {loading ? (
                                    <tr><td colSpan={5} className="py-20 text-center"><i className="fas fa-circle-notch fa-spin text-2xl text-brand-primary"></i></td></tr>
                                ) : filteredPeople.length === 0 ? (
                                    <tr><td colSpan={5} className="py-20 text-center text-gray-400 italic">No hay registros que coincidan con la búsqueda.</td></tr>
                                ) : (
                                    filteredPeople.map((p, i) => (
                                        <tr key={p.id || p.id} className="hover:bg-slate-50/50 transition-colors group">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-xl bg-gray-100 overflow-hidden shrink-0">
                                                        {p.photo ? <img src={p.photo} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-gray-300"><i className="fas fa-user"></i></div>}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-bold text-slate-800 truncate">{p.name}</p>
                                                        <p className="text-[10px] text-gray-400 truncate">{p.address || 'Sin dirección'}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="font-mono text-xs font-bold text-brand-primary bg-red-50 px-2 py-1 rounded-lg">{p.ine}</span>
                                            </td>
                                            <td className="px-6 py-4 hidden sm:table-cell">
                                                <p className="text-xs font-semibold text-slate-600">{p.phone || '—'}</p>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className={`w-2 h-2 rounded-full ${p.synced ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)] animate-pulse'}`} title={p.synced ? 'Sincronizado' : 'Pendiente'}></div>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex justify-end gap-1.5 translate-x-2 group-hover:translate-x-0 transition-transform">
                                                    <button onClick={() => generateCredential(p)} className="w-8 h-8 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center hover:bg-violet-600 hover:text-white transition-all">
                                                        <i className="fas fa-id-card text-xs"></i>
                                                    </button>
                                                    <button onClick={() => handleEdit(p)} className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center hover:bg-blue-600 hover:text-white transition-all">
                                                        <i className="fas fa-edit text-xs"></i>
                                                    </button>
                                                    <button onClick={() => p.id && handleDelete(String(p.id))} className="w-8 h-8 rounded-lg bg-red-50 text-red-400 flex items-center justify-center hover:bg-red-600 hover:text-white transition-all">
                                                        <i className="fas fa-trash-alt text-xs"></i>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Modal de Captura */}
            {showModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
                    <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden animate-fade-in sm:translate-y-[-20px] transform transition-all">
                        <div className="bg-brand-primary p-6 text-white flex justify-between items-center bg-brand-gradient">
                            <h3 className="font-brand font-bold text-lg">{editingId ? 'Editar Perfil' : 'Nuevo Registro'}</h3>
                            <button onClick={closeModal} className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center hover:bg-white/25 transition-all">
                                <i className="fas fa-times text-xs"></i>
                            </button>
                        </div>

                        {cameraMode ? (
                            <div className="p-8 bg-slate-900 flex flex-col items-center">
                                <div className="w-full aspect-[4/3] rounded-2xl overflow-hidden border-2 border-white/20 mb-6 shadow-2xl">
                                    <Webcam 
                                        audio={false} 
                                        ref={webcamRef} 
                                        screenshotFormat="image/jpeg" 
                                        className="w-full h-full object-cover" 
                                        videoConstraints={{ facingMode: "environment" }}
                                        mirrored={false}
                                        imageSmoothing={true}
                                        disablePictureInPicture={true}
                                        forceScreenshotSourceSize={false}
                                        onUserMedia={() => {}}
                                        onUserMediaError={() => {}}
                                        screenshotQuality={0.92}
                                    />
                                </div>
                                <div className="flex gap-4">
                                    <button onClick={capturePhoto} className="btn-primary bg-white text-brand-primary px-8 shadow-glow-white">
                                        <i className="fas fa-camera mr-2"></i> Capturar Foto
                                    </button>
                                    <button onClick={() => setCameraMode(null)} className="text-white/60 hover:text-white px-4 text-xs font-bold uppercase tracking-widest">Regresar</button>
                                </div>
                            </div>
                        ) : (
                            <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-5 overflow-y-auto max-h-[75vh]">
                                {/* Photo Pickers */}
                                <div className="grid grid-cols-2 gap-4">
                                    <button type="button" onClick={() => setCameraMode('photo')} className="relative aspect-square rounded-2xl border-2 border-dashed border-gray-100 bg-gray-50 flex flex-col items-center justify-center group overflow-hidden hover:bg-gray-100 transition-all">
                                        {formData.photo ? <img src={formData.photo} className="w-full h-full object-cover" /> : (
                                            <>
                                                <i className="fas fa-user-circle text-2xl text-gray-300 group-hover:text-brand-primary transition-colors"></i>
                                                <span className="text-[10px] font-bold text-gray-400 uppercase mt-2">Foto Ciudadano</span>
                                            </>
                                        )}
                                    </button>
                                    <button type="button" onClick={() => setCameraMode('ine')} className="relative aspect-square rounded-2xl border-2 border-dashed border-gray-100 bg-gray-50 flex flex-col items-center justify-center group overflow-hidden hover:bg-gray-100 transition-all">
                                        {formData.inePhoto ? <img src={formData.inePhoto} className="w-full h-full object-cover" /> : (
                                            <>
                                                <i className="fas fa-id-card text-2xl text-gray-300 group-hover:text-brand-primary transition-colors"></i>
                                                <span className="text-[10px] font-bold text-gray-400 uppercase mt-2">Foto INE / Doc</span>
                                            </>
                                        )}
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-4">
                                        <div>
                                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block ml-1">Nombre Completo</label>
                                            <input required type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="input-modern" placeholder="Ej. Juan Pérez" />
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <div>
                                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block ml-1">Folio INE</label>
                                                <input required type="text" value={formData.ine} onChange={e => setFormData({ ...formData, ine: e.target.value.toUpperCase() })} className="input-modern font-mono text-brand-primary" placeholder="IDMEX..." />
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block ml-1">Teléfono</label>
                                                <input type="tel" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} className="input-modern" placeholder="981..." />
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="space-y-4">
                                        <div>
                                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block ml-1">Dirección / Colonia</label>
                                            <textarea rows={4} value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} className="input-modern resize-none" placeholder="Calle, Número, Colonia..."></textarea>
                                        </div>
                                    </div>
                                </div>

                                <div className="pt-4 flex gap-3">
                                    <button type="button" onClick={closeModal} className="btn-ghost text-xs px-6">Cancelar</button>
                                    <button type="submit" disabled={saving} className="btn-primary flex-1 shadow-glow-red">
                                        {saving ? <i className="fas fa-sync fa-spin"></i> : (editingId ? 'Actualizar Perfil' : 'Guardar y Sincronizar')}
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default PeoplePage;
