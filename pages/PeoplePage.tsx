import React, { useState, useEffect, useRef } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import Webcam from 'react-webcam';
import Dexie, { Table } from 'dexie';

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
            const res = await fetch('http://localhost:3000/api/people');
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

                const res = await fetch('http://localhost:3000/api/people', {
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
                    ? `http://localhost:3000/api/people/${editingId}`
                    : 'http://localhost:3000/api/people';
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

        } catch (error) {
            alert('Error al guardar');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('¿Estás seguro de eliminar a esta persona?')) return;
        try {
            await fetch(`http://localhost:3000/api/people/${id}`, { method: 'DELETE' });
            fetchPeople();
        } catch (error) {
            alert('Error al eliminar');
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
                                            <button onClick={() => handleEdit(person)} className="text-blue-500 hover:text-blue-700 p-2"><i className="fas fa-edit"></i></button>
                                            <button onClick={() => person._id && handleDelete(person._id)} className="text-red-500 hover:text-red-700 p-2"><i className="fas fa-trash-alt"></i></button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
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
