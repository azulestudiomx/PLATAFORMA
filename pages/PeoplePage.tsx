import React, { useState, useEffect } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface Person {
    _id: string;
    name: string;
    phone: string;
    address: string;
    ine: string;
}

const PeoplePage: React.FC = () => {
    const [people, setPeople] = useState<Person[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formData, setFormData] = useState({
        name: '',
        phone: '',
        address: '',
        ine: ''
    });
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        console.log('PeoplePage mounted');
        fetchPeople();
    }, []);

    const fetchPeople = async () => {
        try {
            const res = await fetch('http://localhost:3000/api/people');
            if (!res.ok) throw new Error('Error fetching people');
            const data = await res.json();
            if (Array.isArray(data)) {
                setPeople(data);
            } else {
                console.error('Data is not an array:', data);
                setPeople([]);
            }
        } catch (error) {
            console.error('Error fetching people:', error);
            setPeople([]);
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (person: Person) => {
        setEditingId(person._id);
        setFormData({
            name: person.name,
            phone: person.phone,
            address: person.address,
            ine: person.ine
        });
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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            const url = editingId
                ? `http://localhost:3000/api/people/${editingId}`
                : 'http://localhost:3000/api/people';

            const method = editingId ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            if (res.ok) {
                setShowModal(false);
                setFormData({ name: '', phone: '', address: '', ine: '' });
                setEditingId(null);
                fetchPeople();
            } else {
                const err = await res.json();
                alert(err.error || 'Error al guardar');
            }
        } catch (error) {
            alert('Error de conexión');
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
                    <button
                        onClick={handleExportPDF}
                        className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 transition flex items-center gap-2 whitespace-nowrap"
                    >
                        <i className="fas fa-file-pdf text-red-600"></i> Exportar PDF
                    </button>
                    <button
                        onClick={() => {
                            setEditingId(null);
                            setFormData({ name: '', phone: '', address: '', ine: '' });
                            setShowModal(true);
                        }}
                        className="bg-brand-primary text-white px-4 py-2 rounded-lg hover:bg-red-800 transition flex items-center gap-2 whitespace-nowrap"
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
                                <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase">Dirección</th>
                                <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {loading ? (
                                <tr><td colSpan={5} className="text-center py-8">Cargando...</td></tr>
                            ) : filteredPeople.length === 0 ? (
                                <tr><td colSpan={5} className="text-center py-8 text-gray-500">No se encontraron registros.</td></tr>
                            ) : (
                                filteredPeople.map(person => (
                                    <tr key={person._id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4 font-medium text-gray-900">{person.name}</td>
                                        <td className="px-6 py-4 text-gray-600 font-mono text-sm">{person.ine}</td>
                                        <td className="px-6 py-4 text-gray-600">{person.phone}</td>
                                        <td className="px-6 py-4 text-gray-600 truncate max-w-xs" title={person.address}>{person.address}</td>
                                        <td className="px-6 py-4 text-right flex justify-end gap-2">
                                            <button
                                                onClick={() => handleEdit(person)}
                                                className="text-blue-500 hover:text-blue-700 p-2 rounded-full hover:bg-blue-50 transition-colors"
                                                title="Editar"
                                            >
                                                <i className="fas fa-edit"></i>
                                            </button>
                                            <button
                                                onClick={() => handleDelete(person._id)}
                                                className="text-red-500 hover:text-red-700 p-2 rounded-full hover:bg-red-50 transition-colors"
                                                title="Eliminar"
                                            >
                                                <i className="fas fa-trash-alt"></i>
                                            </button>
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
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-fade-in-up">
                        <div className="bg-brand-primary p-4 text-white flex justify-between items-center">
                            <h3 className="font-bold text-lg">{editingId ? 'Editar Persona' : 'Registrar Persona'}</h3>
                            <button onClick={() => setShowModal(false)} className="hover:text-gray-200"><i className="fas fa-times"></i></button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Nombre Completo</label>
                                <input
                                    required
                                    type="text"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full p-2 border rounded focus:ring-2 focus:ring-brand-primary outline-none"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">INE (Clave)</label>
                                    <input
                                        required
                                        type="text"
                                        value={formData.ine}
                                        onChange={e => setFormData({ ...formData, ine: e.target.value.toUpperCase() })}
                                        className="w-full p-2 border rounded focus:ring-2 focus:ring-brand-primary outline-none uppercase"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Teléfono</label>
                                    <input
                                        type="tel"
                                        value={formData.phone}
                                        onChange={e => setFormData({ ...formData, phone: e.target.value })}
                                        className="w-full p-2 border rounded focus:ring-2 focus:ring-brand-primary outline-none"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Dirección</label>
                                <textarea
                                    rows={3}
                                    value={formData.address}
                                    onChange={e => setFormData({ ...formData, address: e.target.value })}
                                    className="w-full p-2 border rounded focus:ring-2 focus:ring-brand-primary outline-none resize-none"
                                ></textarea>
                            </div>
                            <div className="pt-2 flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="bg-brand-primary text-white px-6 py-2 rounded shadow hover:bg-red-800 transition-colors disabled:opacity-70"
                                >
                                    {saving ? 'Guardando...' : (editingId ? 'Actualizar' : 'Guardar Registro')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PeoplePage;
