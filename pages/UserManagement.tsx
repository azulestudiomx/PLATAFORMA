import React, { useState, useEffect } from 'react';
import { UserRole } from '../types';

interface User {
    _id: string;
    username: string;
    name: string;
    role: UserRole;
}

const UserManagement: React.FC = () => {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [newUser, setNewUser] = useState({
        username: '',
        password: '',
        name: '',
        role: UserRole.CAPTURIST
    });
    const [creating, setCreating] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        try {
            const res = await fetch('http://localhost:3000/api/users');
            const data = await res.json();
            setUsers(data);
        } catch (error) {
            console.error('Error fetching users:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setCreating(true);
        setMessage('');

        try {
            const res = await fetch('http://localhost:3000/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newUser)
            });

            if (res.ok) {
                setMessage('Usuario creado exitosamente');
                setNewUser({ username: '', password: '', name: '', role: UserRole.CAPTURIST });
                fetchUsers(); // Refresh list
            } else {
                const data = await res.json();
                setMessage(data.error || 'Error al crear usuario');
            }
        } catch (error) {
            setMessage('Error de conexión');
        } finally {
            setCreating(false);
        }
    };

    return (
        <div className="p-6 max-w-6xl mx-auto">
            <h1 className="text-3xl font-bold text-gray-800 mb-8">Gestión de Usuarios</h1>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* Formulario de Creación */}
                <div className="bg-white p-6 rounded-xl shadow-md border border-gray-100 h-fit">
                    <h2 className="text-xl font-bold mb-4 text-brand-primary border-b pb-2">Nuevo Usuario</h2>

                    {message && (
                        <div className={`mb-4 p-3 rounded text-sm ${message.includes('exitosamente') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {message}
                        </div>
                    )}

                    <form onSubmit={handleCreate} className="space-y-4">
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Nombre Completo</label>
                            <input
                                type="text"
                                required
                                value={newUser.name}
                                onChange={e => setNewUser({ ...newUser, name: e.target.value })}
                                className="w-full p-2 border rounded focus:ring-2 focus:ring-brand-primary outline-none"
                                placeholder="Ej. Juan Pérez"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Usuario (Login)</label>
                            <input
                                type="text"
                                required
                                value={newUser.username}
                                onChange={e => setNewUser({ ...newUser, username: e.target.value })}
                                className="w-full p-2 border rounded focus:ring-2 focus:ring-brand-primary outline-none"
                                placeholder="Ej. juan.perez"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Contraseña</label>
                            <input
                                type="password"
                                required
                                value={newUser.password}
                                onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                                className="w-full p-2 border rounded focus:ring-2 focus:ring-brand-primary outline-none"
                                placeholder="••••••••"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Rol</label>
                            <select
                                value={newUser.role}
                                onChange={e => setNewUser({ ...newUser, role: e.target.value as UserRole })}
                                className="w-full p-2 border rounded focus:ring-2 focus:ring-brand-primary outline-none"
                            >
                                <option value={UserRole.CAPTURIST}>Capturista</option>
                                <option value={UserRole.ADMIN}>Administrador</option>
                            </select>
                        </div>

                        <button
                            type="submit"
                            disabled={creating}
                            className="w-full bg-brand-primary text-white font-bold py-2 rounded hover:bg-red-800 transition-colors"
                        >
                            {creating ? 'Creando...' : 'Crear Usuario'}
                        </button>
                    </form>
                </div>

                {/* Lista de Usuarios */}
                <div className="md:col-span-2 bg-white p-6 rounded-xl shadow-md border border-gray-100">
                    <h2 className="text-xl font-bold mb-4 text-gray-800 border-b pb-2">Usuarios Existentes</h2>

                    {loading ? (
                        <div className="text-center py-8 text-gray-500">Cargando usuarios...</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="bg-gray-50 text-gray-600 text-sm uppercase">
                                        <th className="p-3">Nombre</th>
                                        <th className="p-3">Usuario</th>
                                        <th className="p-3">Rol</th>
                                        <th className="p-3">Estado</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {users.map(user => (
                                        <tr key={user._id} className="hover:bg-gray-50">
                                            <td className="p-3 font-medium">{user.name}</td>
                                            <td className="p-3 text-gray-600">{user.username}</td>
                                            <td className="p-3">
                                                <span className={`px-2 py-1 rounded-full text-xs font-bold ${user.role === UserRole.ADMIN
                                                        ? 'bg-purple-100 text-purple-700'
                                                        : 'bg-blue-100 text-blue-700'
                                                    }`}>
                                                    {user.role}
                                                </span>
                                            </td>
                                            <td className="p-3">
                                                <span className="text-green-600 text-xs font-bold flex items-center gap-1">
                                                    <div className="w-2 h-2 bg-green-500 rounded-full"></div> Activo
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            {users.length === 0 && (
                                <div className="text-center py-8 text-gray-400">No hay usuarios registrados</div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default UserManagement;
