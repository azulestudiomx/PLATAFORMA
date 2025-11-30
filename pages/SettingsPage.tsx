import React, { useState, useEffect } from 'react';
import { useConfig, CustomField } from '../contexts/ConfigContext';

const SettingsPage: React.FC = () => {
    const { config, updateConfig, loading } = useConfig();
    const [localConfig, setLocalConfig] = useState(config);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        setLocalConfig(config);
    }, [config]);

    const handleColorChange = (key: 'primary' | 'secondary' | 'accent', value: string) => {
        setLocalConfig(prev => ({
            ...prev,
            theme: { ...prev.theme, [key]: value }
        }));
    };

    const handleAddField = () => {
        const newField: CustomField = {
            id: `field_${Date.now()}`,
            label: 'Nuevo Campo',
            type: 'text',
            options: []
        };
        setLocalConfig(prev => ({
            ...prev,
            customFields: [...prev.customFields, newField]
        }));
    };

    const handleRemoveField = (id: string) => {
        setLocalConfig(prev => ({
            ...prev,
            customFields: prev.customFields.filter(f => f.id !== id)
        }));
    };

    const handleFieldChange = (id: string, key: keyof CustomField, value: any) => {
        setLocalConfig(prev => ({
            ...prev,
            customFields: prev.customFields.map(f =>
                f.id === id ? { ...f, [key]: value } : f
            )
        }));
    };

    const handleSave = async () => {
        setSaving(true);
        setMessage('');
        try {
            await updateConfig(localConfig);
            setMessage('Configuración guardada exitosamente');
        } catch (error) {
            setMessage('Error al guardar configuración');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="p-8 text-center">Cargando configuración...</div>;

    return (
        <div className="max-w-4xl mx-auto p-6">
            <h1 className="text-3xl font-bold text-gray-800 mb-8 border-b pb-4">Configuración del Sistema</h1>

            {message && (
                <div className={`mb-6 p-4 rounded-lg ${message.includes('exitosamente') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {message}
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Sección de Temas */}
                <div className="bg-white p-6 rounded-xl shadow-md border border-gray-100">
                    <h2 className="text-xl font-bold mb-6 text-brand-primary flex items-center gap-2">
                        <i className="fas fa-palette"></i> Personalización de Tema
                    </h2>

                    <div className="space-y-6">
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">Color Primario (Encabezados, Botones)</label>
                            <div className="flex items-center gap-3">
                                <input
                                    type="color"
                                    value={localConfig.theme.primary}
                                    onChange={e => handleColorChange('primary', e.target.value)}
                                    className="h-10 w-20 rounded cursor-pointer border-0"
                                />
                                <span className="text-gray-500 font-mono">{localConfig.theme.primary}</span>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">Color Secundario (Fondos, Textos)</label>
                            <div className="flex items-center gap-3">
                                <input
                                    type="color"
                                    value={localConfig.theme.secondary}
                                    onChange={e => handleColorChange('secondary', e.target.value)}
                                    className="h-10 w-20 rounded cursor-pointer border-0"
                                />
                                <span className="text-gray-500 font-mono">{localConfig.theme.secondary}</span>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">Color de Acento (Detalles, Bordes)</label>
                            <div className="flex items-center gap-3">
                                <input
                                    type="color"
                                    value={localConfig.theme.accent}
                                    onChange={e => handleColorChange('accent', e.target.value)}
                                    className="h-10 w-20 rounded cursor-pointer border-0"
                                />
                                <span className="text-gray-500 font-mono">{localConfig.theme.accent}</span>
                            </div>
                        </div>
                    </div>

                    <div className="mt-8 p-4 bg-gray-50 rounded-lg border border-gray-200">
                        <h3 className="text-sm font-bold text-gray-500 mb-2 uppercase">Vista Previa</h3>
                        <div className="flex gap-2">
                            <button
                                style={{ backgroundColor: localConfig.theme.primary }}
                                className="px-4 py-2 text-white rounded shadow"
                            >
                                Botón Primario
                            </button>
                            <button
                                style={{ borderColor: localConfig.theme.accent, color: localConfig.theme.primary }}
                                className="px-4 py-2 bg-white border-2 rounded shadow-sm"
                            >
                                Botón Secundario
                            </button>
                        </div>
                    </div>
                </div>

                {/* Sección de Tipos de Necesidad */}
                <div className="bg-white p-6 rounded-xl shadow-md border border-gray-100">
                    <h2 className="text-xl font-bold mb-6 text-brand-primary flex items-center gap-2">
                        <i className="fas fa-tags"></i> Tipos de Necesidad
                    </h2>

                    <div className="flex gap-2 mb-4">
                        <input
                            type="text"
                            id="newNeedType"
                            placeholder="Nuevo tipo (ej. Internet)"
                            className="flex-1 p-2 border rounded focus:ring-2 focus:ring-brand-primary outline-none"
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    const val = (e.target as HTMLInputElement).value;
                                    if (val.trim()) {
                                        setLocalConfig(prev => ({
                                            ...prev,
                                            needTypes: [...prev.needTypes, val.trim()]
                                        }));
                                        (e.target as HTMLInputElement).value = '';
                                    }
                                }
                            }}
                        />
                        <button
                            onClick={() => {
                                const input = document.getElementById('newNeedType') as HTMLInputElement;
                                if (input.value.trim()) {
                                    setLocalConfig(prev => ({
                                        ...prev,
                                        needTypes: [...prev.needTypes, input.value.trim()]
                                    }));
                                    input.value = '';
                                }
                            }}
                            className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded transition-colors"
                        >
                            <i className="fas fa-plus"></i>
                        </button>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        {localConfig.needTypes.map((type, index) => (
                            <span key={index} className="bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-sm flex items-center gap-2 group">
                                {type}
                                <button
                                    onClick={() => setLocalConfig(prev => ({
                                        ...prev,
                                        needTypes: prev.needTypes.filter((_, i) => i !== index)
                                    }))}
                                    className="text-gray-400 hover:text-red-500 transition-colors"
                                >
                                    <i className="fas fa-times"></i>
                                </button>
                            </span>
                        ))}
                    </div>
                </div>

                {/* Sección de Campos Dinámicos */}
                <div className="bg-white p-6 rounded-xl shadow-md border border-gray-100">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-xl font-bold text-brand-primary flex items-center gap-2">
                            <i className="fas fa-list-alt"></i> Campos de Captura
                        </h2>
                        <button
                            onClick={handleAddField}
                            className="text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1 rounded transition-colors"
                        >
                            <i className="fas fa-plus mr-1"></i> Agregar Campo
                        </button>
                    </div>

                    <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
                        {localConfig.customFields.length === 0 && (
                            <p className="text-center text-gray-400 py-8 italic">No hay campos personalizados configurados.</p>
                        )}

                        {localConfig.customFields.map((field, index) => (
                            <div key={field.id} className="p-4 border border-gray-200 rounded-lg bg-gray-50 relative group">
                                <button
                                    onClick={() => handleRemoveField(field.id)}
                                    className="absolute top-2 right-2 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    <i className="fas fa-trash"></i>
                                </button>

                                <div className="grid grid-cols-1 gap-3">
                                    <div>
                                        <label className="text-xs font-bold text-gray-500 uppercase">Etiqueta del Campo</label>
                                        <input
                                            type="text"
                                            value={field.label}
                                            onChange={e => handleFieldChange(field.id, 'label', e.target.value)}
                                            className="w-full p-2 border rounded mt-1 focus:ring-2 focus:ring-brand-primary outline-none"
                                            placeholder="Ej. Nombre del Testigo"
                                        />
                                    </div>

                                    <div>
                                        <label className="text-xs font-bold text-gray-500 uppercase">Tipo de Dato</label>
                                        <select
                                            value={field.type}
                                            onChange={e => handleFieldChange(field.id, 'type', e.target.value)}
                                            className="w-full p-2 border rounded mt-1 bg-white"
                                        >
                                            <option value="text">Texto Corto</option>
                                            <option value="number">Numérico</option>
                                            <option value="date">Fecha</option>
                                            <option value="select">Selección (Lista)</option>
                                        </select>
                                    </div>

                                    {field.type === 'select' && (
                                        <div>
                                            <label className="text-xs font-bold text-gray-500 uppercase">Opciones (separadas por coma)</label>
                                            <input
                                                type="text"
                                                value={field.options?.join(', ')}
                                                onChange={e => handleFieldChange(field.id, 'options', e.target.value.split(',').map(s => s.trim()))}
                                                className="w-full p-2 border rounded mt-1 focus:ring-2 focus:ring-brand-primary outline-none"
                                                placeholder="Opción 1, Opción 2, Opción 3"
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="mt-8 flex justify-end">
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="bg-brand-primary text-white px-8 py-3 rounded-lg shadow-lg hover:bg-red-800 transition-all transform hover:scale-105 disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2"
                >
                    {saving ? (
                        <><i className="fas fa-circle-notch fa-spin"></i> Guardando...</>
                    ) : (
                        <><i className="fas fa-save"></i> Guardar Cambios</>
                    )}
                </button>
            </div>
        </div>
    );
};

export default SettingsPage;
