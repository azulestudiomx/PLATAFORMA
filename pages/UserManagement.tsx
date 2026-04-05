import React, { useState, useEffect } from 'react';
import { UserRole } from '../types';
import { authApi } from '../services/api';
import Swal from 'sweetalert2';

interface ManagedUser {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  createdAt?: string;
}

const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    name: '',
    role: UserRole.CAPTURIST
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const data = await authApi.listUsers();
      setUsers(Array.isArray(data) ? data : []);
    } catch (error: any) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      if (editingId) {
        await authApi.update(editingId, formData);
        setMessage({ text: '✓ Usuario actualizado exitosamente', ok: true });
      } else {
        await authApi.register(formData);
        setMessage({ text: '✓ Usuario creado exitosamente', ok: true });
      }
      setFormData({ username: '', password: '', name: '', role: UserRole.CAPTURIST });
      setEditingId(null);
      fetchUsers();
    } catch (error: any) {
      setMessage({ text: error.message || 'Error al procesar solicitud', ok: false });
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (user: ManagedUser) => {
    setEditingId(user.id);
    setFormData({
      username: user.username,
      password: '', // Leave blank for update unless changing
      name: user.name,
      role: user.role
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id: string, name: string) => {
    const result = await Swal.fire({
      title: `¿Eliminar a ${name}?`,
      text: "Esta acción no se puede deshacer.",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
      try {
        await authApi.delete(id);
        Swal.fire('Eliminado', 'El usuario ha sido removido.', 'success');
        fetchUsers();
      } catch (error: any) {
        Swal.fire('Error', error.message || 'No se pudo eliminar el usuario', 'error');
      }
    }
  };

  const initials = (name: string) =>
    name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="max-w-6xl mx-auto pb-20">
      {/* Page Header */}
      <div className="mb-8">
        <h2 className="font-brand font-bold text-2xl text-gray-900 tracking-tight">Gestión de Usuarios</h2>
        <p className="text-sm text-gray-400 mt-0.5">{users.length} usuario{users.length !== 1 ? 's' : ''} con acceso al sistema</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* ── Formulario de CRUD ── */}
        <div className="lg:col-span-4 bg-white rounded-3xl shadow-card p-6 border border-gray-50 sticky top-4">
          <div className="mb-6 flex items-center gap-3">
             <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${editingId ? 'bg-amber-50 text-amber-600' : 'bg-brand-primary/5 text-brand-primary'}`}>
                <i className={`fas ${editingId ? 'fa-user-edit' : 'fa-user-plus'} text-sm`}></i>
             </div>
             <div>
                <h3 className="font-bold text-gray-800">{editingId ? 'Editar Usuario' : 'Nuevo Usuario'}</h3>
                <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">{editingId ? 'Actualizar permisos' : 'Agrega acceso al sistema'}</p>
             </div>
          </div>

          {message && (
            <div className={`mb-6 p-4 rounded-2xl text-sm flex items-start gap-3 animate-fade-in ${
              message.ok
                ? 'bg-green-50 text-green-700 border border-green-100'
                : 'bg-red-50 text-red-700 border border-red-100'
            }`}>
              <i className={`fas ${message.ok ? 'fa-check-circle' : 'fa-exclamation-circle'} mt-0.5`}></i>
              <span className="font-medium">{message.text}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">
                Nombre Completo
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                className="input-modern"
                placeholder="Ej. Juan Pérez"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">
                Nombre de Usuario
              </label>
              <input
                type="text"
                required
                value={formData.username}
                onChange={e => setFormData({ ...formData, username: e.target.value })}
                className="input-modern"
                placeholder="Ej. juan.perez"
                autoComplete="off"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">
                Contraseña {editingId && <span className="normal-case opacity-50">(Opcional para actualizar)</span>}
              </label>
              <input
                type="password"
                required={!editingId}
                value={formData.password}
                onChange={e => setFormData({ ...formData, password: e.target.value })}
                className="input-modern"
                placeholder={editingId ? '••••••••' : 'Mínimo 6 caracteres'}
                autoComplete="new-password"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">
                Rol de Sistema
              </label>
              <select
                value={formData.role}
                onChange={e => setFormData({ ...formData, role: e.target.value as UserRole })}
                className="input-modern"
              >
                <option value={UserRole.CAPTURIST}>Capturista de Campo</option>
                <option value={UserRole.ADMIN}>Administrador General</option>
              </select>
            </div>

            <div className="pt-2 space-y-2">
                <button
                type="submit"
                disabled={saving}
                className={`btn-primary w-full ${editingId ? 'bg-amber-600 hover:bg-amber-700 shadow-glow-amber' : 'shadow-glow-red'}`}
                >
                {saving ? (
                    <><i className="fas fa-circle-notch fa-spin mr-2"></i> Procesando...</>
                ) : (
                    <><i className={`fas ${editingId ? 'fa-save' : 'fa-user-plus'} mr-2`}></i> {editingId ? 'Guardar Cambios' : 'Crear Usuario'}</>
                )}
                </button>
                {editingId && (
                    <button
                        type="button"
                        onClick={() => { setEditingId(null); setFormData({ username: '', password: '', name: '', role: UserRole.CAPTURIST }); }}
                        className="btn-ghost w-full"
                    >
                        Cancelar Edición
                    </button>
                )}
            </div>
          </form>
        </div>

        {/* ── Lista de Usuarios ── */}
        <div className="lg:col-span-8 bg-white rounded-3xl shadow-card overflow-hidden border border-gray-50 min-h-[500px]">
          <div className="p-6 border-b border-gray-50 flex items-center justify-between bg-slate-50/30">
            <div>
              <h3 className="font-bold text-gray-800">Cuentas Activas</h3>
              <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">Listado de personal autorizado</p>
            </div>
            <button
              onClick={fetchUsers}
              className="w-10 h-10 rounded-xl bg-white border border-gray-100 text-gray-400 flex items-center justify-center hover:text-brand-primary transition-all shadow-sm"
              title="Refrescar"
            >
              <i className={`fas fa-sync-alt text-xs ${loading ? 'animate-spin' : ''}`}></i>
            </button>
          </div>

          {loading ? (
             <div className="p-12 space-y-4">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4 animate-pulse">
                        <div className="w-12 h-12 bg-gray-100 rounded-2xl"></div>
                        <div className="flex-1 space-y-2">
                             <div className="h-4 bg-gray-100 rounded w-1/3"></div>
                             <div className="h-3 bg-gray-50 rounded w-1/4"></div>
                        </div>
                    </div>
                ))}
             </div>
          ) : users.length === 0 ? (
            <div className="text-center py-24">
              <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <i className="fas fa-users-slash text-3xl text-slate-200"></i>
              </div>
              <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">No hay usuarios registrados</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {users.map(user => (
                <div
                  key={user.id}
                  className="group flex flex-col sm:flex-row sm:items-center gap-4 p-5 sm:p-6 hover:bg-slate-50 transition-colors"
                >
                  {/* User Profile */}
                  <div className="flex items-center gap-4 flex-1">
                    <div
                        className="w-12 h-12 rounded-2xl flex items-center justify-center text-white text-sm font-bold shrink-0 shadow-lg"
                        style={{
                        background: user.role === UserRole.ADMIN
                            ? 'linear-gradient(135deg, #8B0000, #4a0000)'
                            : 'linear-gradient(135deg, #1e293b, #0f172a)'
                        }}
                    >
                        {initials(user.name)}
                    </div>

                    <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                            <p className="text-base font-bold text-slate-800 truncate">{user.name}</p>
                            <span className={`badge text-[9px] ${
                                user.role === UserRole.ADMIN
                                ? 'bg-red-50 text-red-700'
                                : 'bg-slate-100 text-slate-600'
                            }`}>
                                {user.role === UserRole.ADMIN ? 'ADM' : 'CAP'}
                            </span>
                        </div>
                        <p className="text-xs text-gray-400 font-medium">@{user.username}</p>
                    </div>
                  </div>

                  {/* Details / Actions */}
                  <div className="flex items-center justify-between sm:justify-end gap-6 pl-14 sm:pl-0">
                    <div className="hidden sm:block text-right">
                        <div className="flex items-center gap-1.5 text-green-500 text-[10px] font-bold uppercase tracking-wider mb-0.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                            Activo
                        </div>
                        <p className="text-[10px] text-gray-300 font-bold uppercase">Desde {new Date(user.createdAt || '').toLocaleDateString('es-MX')}</p>
                    </div>

                    <div className="flex items-center gap-2">
                        <button 
                            onClick={() => handleEdit(user)}
                            className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center hover:bg-blue-600 hover:text-white transition-all shadow-sm" 
                            title="Editar permisos"
                        >
                            <i className="fas fa-edit text-xs"></i>
                        </button>
                        <button 
                            onClick={() => handleDelete(user.id, user.name)}
                            className="w-9 h-9 rounded-xl bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-600 hover:text-white transition-all shadow-sm" 
                            title="Eliminar usuario"
                        >
                            <i className="fas fa-trash-alt text-xs"></i>
                        </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UserManagement;
