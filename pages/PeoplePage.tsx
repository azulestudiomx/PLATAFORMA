import React, { useState, useEffect, useRef } from 'react';
import { API_BASE_URL } from '../src/config';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';
import * as XLSX from 'xlsx';
import Webcam from 'react-webcam';
import Dexie, { Table } from 'dexie';
import Swal from 'sweetalert2';

import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
// Fix for default marker icon
import L from 'leaflet';

// Fix for default marker icon
const iconUrl = 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png';
const shadowUrl = 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: iconUrl,
    shadowUrl: shadowUrl,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

// --- Dexie Database Setup ---
interface Person {
    id?: number; // Dexie auto-increment ID
    _id?: string; // Optional for local, required for server
    name: string;
    phone: string;
    address: string;
    ine: string;
    photo?: string;
    inePhoto?: string;
    location?: { lat: number; lng: number }; // Geolocation
    synced?: number; // 0 = Pending, 1 = Synced
}

class PeopleDatabase extends Dexie {
    people!: Table<Person>;

    constructor() {
        super('PeopleDatabase');
        this.version(1).stores({
            people: '++id, _id, name, ine, synced' // Indexed fields
        });
    }
}

const db = new PeopleDatabase();

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

    useEffect(() => {
        fetchPeople();
    }, []);

    const fetchPeople = async () => {
        setLoading(true);
        try {
            // 1. Get local unsynced data first
            const localUnsynced = await db.people.where('synced').equals(0).toArray();

            // 2. Try to fetch from server
            const res = await fetch(`${API_BASE_URL}/api/people`);
            if (res.ok) {
                const serverData = await res.json();

                // 3. Merge: Server data + Local Unsynced data
                // We prioritize local unsynced for display if there's a conflict, 
                // but generally they should be distinct sets until synced.
                // Filter out any server records that might conflict with local unsynced (by _id if available)
                const serverDataFiltered = serverData.filter((s: Person) =>
                    !localUnsynced.some(l => l._id === s._id)
                );

                setPeople([...localUnsynced, ...serverDataFiltered]);
            } else {
                throw new Error('Server error');
            }
        } catch (error) {
            console.log('Offline mode or server error, loading from Dexie...');
            const localData = await db.people.toArray();
            setPeople(localData);
        } finally {
            setLoading(false);
        }
    };

    const handleSync = async () => {
        const unsynced = await db.people.where('synced').equals(0).toArray();
        if (unsynced.length === 0) {
            alert('No hay datos pendientes de sincronizar.');
            return;
        }

        let syncedCount = 0;
        for (const person of unsynced) {
            try {
                // Send with synced: 1 to ensure server stores it as synced (if server respects it)
                // or just rely on local update.
                const personToSync = { ...person, synced: 1 };

                const res = await fetch(`${API_BASE_URL}/api/people`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(personToSync)
                });
                if (res.ok) {
                    const saved = await res.json();
                    // Update local record to synced
                    await db.people.update(person.id!, { synced: 1, _id: saved._id });
                    syncedCount++;
                }
            } catch (err) {
                console.error('Sync failed for:', person.name);
            }
        }
        alert(`Sincronizados ${syncedCount} de ${unsynced.length} registros.`);
        fetchPeople();
    };

    const handleEdit = (person: Person) => {
        setEditingId(person._id || null); // Use _id if available
        setFormData({ ...person });
        setShowModal(true);
    };

    const handleExportPDF = () => {
        const doc = new jsPDF();
        doc.text('Padrón de Personas - Plataforma Ciudadana', 14, 15);
        const tableData = people.map(p => [p.name, p.ine, p.phone, p.address]);
        autoTable(doc, {
            head: [['Nombre', 'INE', 'Teléfono', 'Dirección']],
            body: tableData,
            startY: 20,
        });
        doc.save('padron_personas.pdf');
    };

    const generateCredential = async (person: Person) => {
        try {
            const doc = new jsPDF({
                orientation: 'landscape',
                unit: 'mm',
                format: [85.6, 53.98] // Standard ID-1 card size
            });

            // Background
            doc.setFillColor(245, 245, 245);
            doc.rect(0, 0, 85.6, 53.98, 'F');

            // Header Strip
            doc.setFillColor(139, 0, 0); // Brand Red
            doc.rect(0, 0, 85.6, 10, 'F');

            doc.setTextColor(255, 255, 255);
            doc.setFontSize(8);
            doc.setFont('helvetica', 'bold');
            doc.text('PLATAFORMA CIUDADANA', 42.8, 6, { align: 'center' });

            // Photo
            if (person.photo) {
                try {
                    doc.addImage(person.photo, 'JPEG', 3, 13, 25, 25);
                } catch (e) {
                    console.error('Error adding photo', e);
                    doc.rect(3, 13, 25, 25); // Placeholder
                }
            } else {
                doc.setDrawColor(200);
                doc.rect(3, 13, 25, 25);
                doc.setFontSize(6);
                doc.setTextColor(150);
                doc.text('Sin Foto', 15.5, 25, { align: 'center' });
            }

            // Info
            doc.setTextColor(0, 0, 0);
            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            doc.text(person.name.substring(0, 25), 30, 18);

            doc.setFontSize(6);
            doc.setFont('helvetica', 'normal');
            doc.text('CLAVE INE:', 30, 23);
            doc.setFont('helvetica', 'bold');
            doc.text(person.ine || 'N/A', 30, 26);

            doc.setFont('helvetica', 'normal');
            doc.text('TELÉFONO:', 30, 31);
            doc.setFont('helvetica', 'bold');
            doc.text(person.phone || 'N/A', 30, 34);

            // QR Code
            const qrData = `ID:${person._id}|INE:${person.ine}|NAME:${person.name}`;
            const qrUrl = await QRCode.toDataURL(qrData);
            doc.addImage(qrUrl, 'PNG', 62, 13, 20, 20);

            // Footer
            doc.setFontSize(5);
            doc.setTextColor(100);
            doc.text(`ID: ${person._id?.slice(-6) || 'LOCAL'}`, 3, 50);
            doc.text('Documento oficial de identificación', 82, 50, { align: 'right' });

            doc.save(`Credencial_${person.name.replace(/\s+/g, '_')}.pdf`);
        } catch (error) {
            console.error('Error generating credential:', error);
            Swal.fire('Error', 'No se pudo generar la credencial', 'error');
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
            let errorCount = 0;

            for (const row of jsonData as any[]) {
                // Map columns (adjust keys as needed based on expected Excel format)
                const name = row['Nombre'] || row['nombre'] || row['Name'];
                const ine = row['INE'] || row['ine'] || row['Clave'] || '';
                const phone = row['Telefono'] || row['telefono'] || row['Phone'] || '';
                const address = row['Direccion'] || row['direccion'] || row['Address'] || '';

                if (!name) {
                    errorCount++;
                    continue;
                }

                const newPerson: Person = {
                    name,
                    ine: ine.toString().toUpperCase(),
                    phone: phone.toString(),
                    address,
                    synced: 0
                };

                // Add to Dexie (Offline First)
                await db.people.add(newPerson);
                importedCount++;
            }

            Swal.fire({
                title: 'Importación Completada',
                text: `Se importaron ${importedCount} registros. ${errorCount > 0 ? `${errorCount} errores.` : ''}`,
                icon: 'success'
            });

            fetchPeople(); // Refresh list

            // Trigger sync attempt in background
            handleSync();

        } catch (error) {
            console.error('Error importing file:', error);
            Swal.fire('Error', 'No se pudo procesar el archivo', 'error');
        } finally {
            setLoading(false);
            // Reset input
            e.target.value = '';
        }
    };

    const capturePhoto = () => {
        const imageSrc = webcamRef.current?.getScreenshot();
        if (imageSrc) {
            if (cameraMode === 'photo') setFormData({ ...formData, photo: imageSrc });
            if (cameraMode === 'ine') setFormData({ ...formData, inePhoto: imageSrc });
            setCameraMode(null);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);

        const newPerson = { ...formData, synced: 0 }; // Default to unsynced for local storage

        try {
            // 1. Save to Dexie (Offline First)
            const id = await db.people.add(newPerson);

            // 2. Try to send to Server
            try {
                const url = editingId
                    ? `${API_BASE_URL}/api/people/${editingId}`
                    : `${API_BASE_URL}/api/people`;
                const method = editingId ? 'PUT' : 'POST';

                // When sending to server, we want it to be marked as synced
                const personToSend = { ...newPerson, synced: 1 };

                const res = await fetch(url, {
                    method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(personToSend)
                });

                if (res.ok) {
                    const saved = await res.json();
                    // Update Dexie as synced
                    await db.people.update(id, { synced: 1, _id: saved._id });
                }
            } catch (serverError) {
                console.log('Server unreachable, saved locally.');
            }

            setShowModal(false);
            setFormData({ name: '', phone: '', address: '', ine: '', photo: '', inePhoto: '' });
            setEditingId(null);
            fetchPeople();
            Swal.fire({
                title: '¡Guardado!',
                text: 'El registro ha sido guardado exitosamente.',
                icon: 'success',
                timer: 2000,
                showConfirmButton: false
            });

        } catch (error) {
            console.error('Error al guardar:', error);
            Swal.fire({
                title: 'Error',
                text: 'Error al guardar el registro.',
                icon: 'error',
                confirmButtonText: 'Ok'
            });
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        const result = await Swal.fire({
            title: '¿Estás seguro?',
            text: "No podrás revertir esta acción",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#6b7280',
            confirmButtonText: 'Sí, eliminar',
            cancelButtonText: 'Cancelar'
        });

        if (result.isConfirmed) {
            try {
                await fetch(`${API_BASE_URL}/api/people/${id}`, { method: 'DELETE' });
                fetchPeople();
                Swal.fire(
                    '¡Eliminado!',
                    'El registro ha sido eliminado.',
                    'success'
                );
            } catch (error) {
                console.error('Error al eliminar:', error);
                Swal.fire({
                    title: 'Error',
                    text: 'Error al eliminar el registro.',
                    icon: 'error',
                    confirmButtonText: 'Ok'
                });
            }
        }
    };

    const filteredPeople = people.filter(p =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.ine.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="max-w-6xl mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
                <h2 className="text-2xl font-bold text-gray-800 border-b-2 border-brand-accent pb-2">
                    Padrón de Personas
                </h2>
                <div className="flex gap-4 w-full md:w-auto">
                    <div className="relative flex-1 md:w-64">
                        <i className="fas fa-search absolute left-3 top-3 text-gray-400"></i>
                        <input
                            type="text"
                            placeholder="Buscar por nombre o INE..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-brand-primary outline-none"
                        />
                    </div>
                    <button onClick={handleSync} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition flex items-center gap-2">
                        <i className="fas fa-sync"></i> Sincronizar
                    </button>
                    <button onClick={handleExportPDF} className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 transition flex items-center gap-2">
                        <i className="fas fa-file-pdf text-red-600"></i> PDF
                    </button>
                    <div className="relative">
                        <input
                            type="file"
                            accept=".xlsx, .xls, .csv"
                            onChange={handleImport}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            title="Importar Excel"
                        />
                        <button className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition flex items-center gap-2">
                            <i className="fas fa-file-excel"></i> Importar
                        </button>
                    </div>
                    <button
                        onClick={() => setShowMap(!showMap)}
                        className={`px-4 py-2 rounded-lg transition flex items-center gap-2 ${showMap ? 'bg-brand-primary text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                    >
                        <i className={`fas ${showMap ? 'fa-list' : 'fa-map-marked-alt'}`}></i> {showMap ? 'Ver Lista' : 'Ver Mapa'}
                    </button>
                    <button
                        onClick={() => {
                            setEditingId(null);
                            setFormData({ name: '', phone: '', address: '', ine: '', photo: '', inePhoto: '' });
                            setShowModal(true);
                        }}
                        className="bg-brand-primary text-white px-4 py-2 rounded-lg hover:bg-red-800 transition flex items-center gap-2"
                    >
                        <i className="fas fa-user-plus"></i> Agregar
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                {showMap ? (
                    <div className="h-[500px] w-full relative z-0">
                        <MapContainer
                            center={[19.8301, -90.5349]} // Campeche Center
                            zoom={8}
                            style={{ height: "100%", width: "100%" }}
                        >
                            <TileLayer
                                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                            />
                            {people.map((person, idx) => (
                                person.location && (
                                    <Marker key={idx} position={[person.location.lat, person.location.lng]}>
                                        <Popup>
                                            <div className="text-center">
                                                {person.photo && <img src={person.photo} className="w-12 h-12 rounded-full mx-auto mb-2 object-cover" />}
                                                <h3 className="font-bold text-sm">{person.name}</h3>
                                                <p className="text-xs text-gray-600">{person.address}</p>
                                                <p className="text-xs font-mono mt-1">{person.ine}</p>
                                            </div>
                                        </Popup>
                                    </Marker>
                                )
                            ))}
                        </MapContainer>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                    <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase">Nombre</th>
                                    <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase">INE</th>
                                    <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase">Teléfono</th>
                                    <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase">Estado</th>
                                    <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {loading ? (
                                    <tr><td colSpan={5} className="text-center py-8">Cargando...</td></tr>
                                ) : filteredPeople.length === 0 ? (
                                    <tr><td colSpan={5} className="text-center py-8 text-gray-500">No se encontraron registros.</td></tr>
                                ) : (
                                    filteredPeople.map((person, idx) => (
                                        <tr key={person._id || idx} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-6 py-4 font-medium text-gray-900 flex items-center gap-2">
                                                {person.photo && <img src={person.photo} alt="Foto" className="w-8 h-8 rounded-full object-cover" />}
                                                {person.name}
                                            </td>
                                            <td className="px-6 py-4 text-gray-600 font-mono text-sm">{person.ine}</td>
                                            <td className="px-6 py-4 text-gray-600">{person.phone}</td>
                                            <td className="px-6 py-4">
                                                {person.synced === 0 ? (
                                                    <span className="text-orange-600 text-xs font-bold bg-orange-100 px-2 py-1 rounded">Pendiente</span>
                                                ) : (
                                                    <span className="text-green-600 text-xs font-bold bg-green-100 px-2 py-1 rounded">Sincronizado</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-right flex justify-end gap-2">
                                                <button onClick={() => generateCredential(person)} className="text-purple-600 hover:text-purple-800 p-2" title="Generar Credencial">
                                                    <i className="fas fa-id-card"></i>
                                                </button>
                                                <button onClick={() => handleEdit(person)} className="text-blue-500 hover:text-blue-700 p-2"><i className="fas fa-edit"></i></button>
                                                <button onClick={() => person._id && handleDelete(person._id)} className="text-red-500 hover:text-red-700 p-2"><i className="fas fa-trash-alt"></i></button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-fade-in-up my-8">
                        <div className="bg-brand-primary p-4 text-white flex justify-between items-center">
                            <h3 className="font-bold text-lg">{editingId ? 'Editar Persona' : 'Registrar Persona'}</h3>
                            <button onClick={() => setShowModal(false)} className="hover:text-gray-200"><i className="fas fa-times"></i></button>
                        </div>

                        {cameraMode ? (
                            <div className="p-4 bg-black flex flex-col items-center">
                                {/* @ts-ignore */}
                                <Webcam
                                    audio={false}
                                    ref={webcamRef}
                                    screenshotFormat="image/jpeg"
                                    className="w-full rounded-lg mb-4"
                                    videoConstraints={{ facingMode: "user" }}
                                />
                                <div className="flex gap-4">
                                    <button onClick={capturePhoto} className="bg-white text-black px-6 py-2 rounded-full font-bold hover:bg-gray-200">
                                        <i className="fas fa-camera"></i> Capturar
                                    </button>
                                    <button onClick={() => setCameraMode(null)} className="text-white px-4 py-2">Cancelar</button>
                                </div>
                            </div>
                        ) : (
                            <form onSubmit={handleSubmit} className="p-6 space-y-4">
                                {/* Photos Section */}
                                <div className="grid grid-cols-2 gap-4 mb-4">
                                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:bg-gray-50 cursor-pointer" onClick={() => setCameraMode('photo')}>
                                        {formData.photo ? (
                                            <img src={formData.photo} alt="Persona" className="w-full h-32 object-cover rounded" />
                                        ) : (
                                            <div className="text-gray-400 py-8">
                                                <i className="fas fa-user-circle text-3xl mb-2"></i>
                                                <p className="text-xs">Foto Persona</p>
                                            </div>
                                        )}
                                    </div>
                                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:bg-gray-50 cursor-pointer" onClick={() => setCameraMode('ine')}>
                                        {formData.inePhoto ? (
                                            <img src={formData.inePhoto} alt="INE" className="w-full h-32 object-cover rounded" />
                                        ) : (
                                            <div className="text-gray-400 py-8">
                                                <i className="fas fa-id-card text-3xl mb-2"></i>
                                                <p className="text-xs">Foto INE</p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Nombre Completo</label>
                                    <input required type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="w-full p-2 border rounded focus:ring-2 focus:ring-brand-primary outline-none" />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1">INE (Clave)</label>
                                        <input required type="text" value={formData.ine} onChange={e => setFormData({ ...formData, ine: e.target.value.toUpperCase() })} className="w-full p-2 border rounded focus:ring-2 focus:ring-brand-primary outline-none uppercase" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1">Teléfono</label>
                                        <input type="tel" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} className="w-full p-2 border rounded focus:ring-2 focus:ring-brand-primary outline-none" />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Dirección</label>
                                    <textarea rows={3} value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} className="w-full p-2 border rounded focus:ring-2 focus:ring-brand-primary outline-none resize-none"></textarea>
                                </div>
                                <div className="flex justify-between items-center">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            navigator.geolocation.getCurrentPosition(
                                                (pos) => {
                                                    setFormData({
                                                        ...formData,
                                                        location: { lat: pos.coords.latitude, lng: pos.coords.longitude }
                                                    });
                                                    Swal.fire('Ubicación Capturada', '', 'success');
                                                },
                                                (err) => Swal.fire('Error', 'No se pudo obtener la ubicación', 'error')
                                            );
                                        }}
                                        className={`text-sm font-bold flex items-center gap-2 ${formData.location ? 'text-green-600' : 'text-gray-500 hover:text-brand-primary'}`}
                                    >
                                        <i className="fas fa-map-marker-alt"></i>
                                        {formData.location ? 'Ubicación Guardada' : 'Capturar Ubicación GPS'}
                                    </button>
                                </div>
                                <div className="pt-2 flex justify-end gap-2">
                                    <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded transition-colors">Cancelar</button>
                                    <button type="submit" disabled={saving} className="bg-brand-primary text-white px-6 py-2 rounded shadow hover:bg-red-800 transition-colors disabled:opacity-70">
                                        {saving ? 'Guardando...' : (editingId ? 'Actualizar' : 'Guardar Registro')}
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
