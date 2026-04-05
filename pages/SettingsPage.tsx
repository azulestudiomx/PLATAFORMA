import React, { useState, useEffect } from 'react';
import { useConfig, CustomField } from '../contexts/ConfigContext';
import changelogData from '../src/changelog.json';

const SettingsPage: React.FC = () => {
    const { config, updateConfig, loading: configLoading } = useConfig();
    const [localConfig, setLocalConfig] = useState(config);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
    const [newNeedType, setNewNeedType] = useState('');
    const [newEventType, setNewEventType] = useState('');
    const [showChangelog, setShowChangelog] = useState(false);

    useEffect(() => {
        if (!configLoading) {
            setLocalConfig(config);
        }
    }, [config, configLoading]);

    const handleAddEventType = () => {
        const trimmed = newEventType.trim();
        if (trimmed) {
            if (localConfig.eventTypes?.includes(trimmed)) {
                setMessage({ text: 'Ese tipo de actividad ya existe', ok: false });
                return;
            }
            setLocalConfig(prev => ({
                ...prev,
                eventTypes: [...(prev.eventTypes || []), trimmed]
            }));
            setNewEventType('');
        }
    };

    const handleRemoveEventType = (index: number) => {
        setLocalConfig(prev => ({
            ...prev,
            eventTypes: (prev.eventTypes || []).filter((_, i) => i !== index)
        }));
    };

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

    const handleAddNeedType = () => {
        const trimmed = newNeedType.trim();
        if (trimmed) {
            if (localConfig.needTypes.includes(trimmed)) {
                setMessage({ text: 'Ese tipo ya existe', ok: false });
                return;
            }
            setLocalConfig(prev => ({
                ...prev,
                needTypes: [...prev.needTypes, trimmed]
            }));
            setNewNeedType('');
        }
    };

    const handleRemoveNeedType = (index: number) => {
        setLocalConfig(prev => ({
            ...prev,
            needTypes: prev.needTypes.filter((_, i) => i !== index)
        }));
    };

    const handleSave = async () => {
        setSaving(true);
        setMessage(null);
        try {
            await updateConfig(localConfig);
            setMessage({ text: '✓ Configuración guardada exitosamente', ok: true });
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (error: any) {
            setMessage({ text: error.message || 'Error al guardar configuración', ok: false });
        } finally {
            setSaving(false);
        }
    };

    if (configLoading || !localConfig) {
        return (
            <div className="flex flex-col items-center justify-center p-20 gap-4">
                <i className="fas fa-circle-notch fa-spin text-4xl text-brand-primary"></i>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto px-2 sm:px-4 pb-20">
            {/* Header Area */}
            <div className="flex flex-col sm:flex-row shadow-sm sm:shadow-none bg-white sm:bg-transparent p-4 sm:p-0 rounded-2xl sm:items-center justify-between gap-4 mb-8 sticky top-0 sm:static z-20">
                <div>
                    <h2 className="font-brand font-bold text-xl sm:text-2xl text-gray-900 tracking-tight">Configuración</h2>
                    <p className="text-xs text-gray-400 mt-0.5">Control de marca y catálogo del sistema</p>
                </div>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="btn-primary w-full sm:w-auto shadow-glow-red py-3 px-8 text-sm"
                >
                    {saving ? (
                        <><i className="fas fa-circle-notch fa-spin mr-2"></i> Guardando...</>
                    ) : (
                        <><i className="fas fa-save mr-2"></i> Guardar Cambios</>
                    )}
                </button>
            </div>

            {message && (
                <div className={`mb-6 p-4 rounded-2xl flex items-center gap-3 animate-fade-in ${
                    message.ok ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'
                }`}>
                    <i className={`fas ${message.ok ? 'fa-check-circle' : 'fa-exclamation-circle'}`}></i>
                    <span className="text-sm font-medium">{message.text}</span>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                {/* ── Identidad Visual ── */}
                <div className="bg-white rounded-2xl shadow-card p-5 sm:p-6 border border-gray-50">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
                            <i className="fas fa-palette text-sm"></i>
                        </div>
                        <div>
                            <h3 className="font-semibold text-gray-800 text-base">Identidad Visual</h3>
                            <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold mt-0.5">Marca y Colores</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 gap-4">
                        <div className="flex items-center justify-between p-3.5 rounded-xl bg-gray-50/50 border border-gray-100">
                            <span className="text-xs font-bold text-gray-600">Primario</span>
                            <input
                                type="color"
                                value={localConfig.theme.primary}
                                onChange={e => handleColorChange('primary', e.target.value)}
                                className="h-9 w-16 rounded-lg cursor-pointer border-0 bg-transparent ring-2 ring-white"
                            />
                        </div>
                        <div className="flex items-center justify-between p-3.5 rounded-xl bg-gray-50/50 border border-gray-100">
                            <span className="text-xs font-bold text-gray-600">Secundario</span>
                            <input
                                type="color"
                                value={localConfig.theme.secondary}
                                onChange={e => handleColorChange('secondary', e.target.value)}
                                className="h-9 w-16 rounded-lg cursor-pointer border-0 bg-transparent ring-2 ring-white"
                            />
                        </div>
                        <div className="flex items-center justify-between p-3.5 rounded-xl bg-gray-50/50 border border-gray-100">
                            <span className="text-xs font-bold text-gray-600">Acento</span>
                            <input
                                type="color"
                                value={localConfig.theme.accent}
                                onChange={e => handleColorChange('accent', e.target.value)}
                                className="h-9 w-16 rounded-lg cursor-pointer border-0 bg-transparent ring-2 ring-white"
                            />
                        </div>
                    </div>
                </div>

                {/* ── Tipos de Necesidad ── */}
                <div className="bg-white rounded-2xl shadow-card p-5 sm:p-6 border border-gray-50">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                            <i className="fas fa-tags text-sm"></i>
                        </div>
                        <div>
                            <h3 className="font-semibold text-gray-800 text-base">Tipos de Necesidad</h3>
                            <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold mt-0.5">Catálogo de Reportes</p>
                        </div>
                    </div>

                    <div className="flex gap-2 mb-6">
                        <input
                            type="text"
                            value={newNeedType}
                            onChange={e => setNewNeedType(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleAddNeedType()}
                            placeholder="Ej. Bacheo"
                            className="input-modern flex-1 h-11 text-sm"
                        />
                        <button
                            onClick={handleAddNeedType}
                            className="w-11 h-11 flex-shrink-0 flex items-center justify-center bg-gray-100 hover:bg-brand-primary hover:text-white text-gray-600 rounded-xl transition-all"
                        >
                            <i className="fas fa-plus"></i>
                        </button>
                    </div>

                    <div className="flex flex-wrap gap-1.5 min-h-[100px] content-start">
                        {localConfig.needTypes.map((type, index) => (
                            <span 
                                key={`${type}-${index}`} 
                                className="inline-flex items-center gap-2 pl-3 pr-1.5 py-1.5 rounded-xl bg-gray-50 border border-gray-100 text-xs font-semibold text-slate-600 group"
                            >
                                {type}
                                <button
                                    onClick={() => handleRemoveNeedType(index)}
                                    className="w-5 h-5 rounded-lg flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all"
                                >
                                    <i className="fas fa-times text-[9px]"></i>
                                </button>
                            </span>
                        ))}
                    </div>
                </div>

                {/* ── Tipos de Actividad ── */}
                <div className="bg-white rounded-2xl shadow-card p-5 sm:p-6 border border-gray-50">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-xl bg-red-50 text-brand-primary flex items-center justify-center shrink-0">
                            <i className="fas fa-calendar-day text-sm"></i>
                        </div>
                        <div>
                            <h3 className="font-semibold text-gray-800 text-base">Tipos de Actividad</h3>
                            <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold mt-0.5">Catálogo de Jornadas</p>
                        </div>
                    </div>

                    <div className="flex gap-2 mb-6">
                        <input
                            type="text"
                            value={newEventType}
                            onChange={e => setNewEventType(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleAddEventType()}
                            placeholder="Ej. Brigada de Salud"
                            className="input-modern flex-1 h-11 text-sm"
                        />
                        <button
                            onClick={handleAddEventType}
                            className="w-11 h-11 flex-shrink-0 flex items-center justify-center bg-gray-100 hover:bg-brand-primary hover:text-white text-gray-600 rounded-xl transition-all"
                        >
                            <i className="fas fa-plus"></i>
                        </button>
                    </div>

                    <div className="flex flex-wrap gap-1.5 min-h-[100px] content-start">
                        {localConfig.eventTypes?.map((type, index) => (
                            <span 
                                key={`${type}-${index}`} 
                                className="inline-flex items-center gap-2 pl-3 pr-1.5 py-1.5 rounded-xl bg-gray-50 border border-gray-100 text-xs font-semibold text-slate-600 group"
                            >
                                {type}
                                <button
                                    onClick={() => handleRemoveEventType(index)}
                                    className="w-5 h-5 rounded-lg flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all"
                                >
                                    <i className="fas fa-times text-[9px]"></i>
                                </button>
                            </span>
                        ))}
                    </div>
                </div>

                {/* ── Campos Dinámicos ── */}
                <div className="md:col-span-1 lg:col-span-2 bg-white rounded-2xl shadow-card p-5 sm:p-6 border border-gray-50">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                                <i className="fas fa-list-alt text-sm"></i>
                            </div>
                            <div>
                                <h3 className="font-semibold text-gray-800 text-base">Campos Personalizados</h3>
                                <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold mt-0.5">Formulario de Captura</p>
                            </div>
                        </div>
                        <button
                            onClick={handleAddField}
                            className="btn-ghost text-xs py-2 px-4 h-10"
                        >
                            <i className="fas fa-plus mr-2"></i>
                            Nuevo Campo
                        </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
                        {localConfig.customFields.map((field) => (
                            <div
                                key={field.id}
                                className="group relative p-4 sm:p-5 rounded-2xl bg-gray-50 border border-gray-100 hover:border-brand-primary/20 hover:bg-white hover:shadow-xl transition-all duration-300"
                            >
                                <button
                                    onClick={() => handleRemoveField(field.id)}
                                    className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-white shadow-md flex items-center justify-center text-gray-300 hover:text-red-500 hover:scale-110 transition-all z-10 sm:opacity-0 group-hover:opacity-100"
                                >
                                    <i className="fas fa-trash-alt text-[10px]"></i>
                                </button>

                                <div className="space-y-4">
                                    <div>
                                        <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">Etiqueta</label>
                                        <input
                                            type="text"
                                            value={field.label}
                                            onChange={e => handleFieldChange(field.id, 'label', e.target.value)}
                                            className="input-modern bg-white text-xs h-10"
                                        />
                                    </div>

                                    <div>
                                        <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">Tipo</label>
                                        <select
                                            value={field.type}
                                            onChange={e => handleFieldChange(field.id, 'type', e.target.value as any)}
                                            className="input-modern bg-white text-xs h-10"
                                        >
                                            <option value="text">Texto</option>
                                            <option value="number">Número</option>
                                            <option value="date">Fecha</option>
                                            <option value="select">Lista</option>
                                        </select>
                                    </div>

                                    {field.type === 'select' && (
                                        <div className="animate-fade-in">
                                            <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">Opciones</label>
                                            <textarea
                                                value={field.options?.join(', ')}
                                                onChange={e => handleFieldChange(field.id, 'options', e.target.value.split(',').map(s => s.trim()))}
                                                className="input-modern bg-white text-[10px] h-14 resize-none"
                                                placeholder="A, B, C..."
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>

                    {localConfig.customFields.length === 0 && (
                        <div className="w-full flex flex-col items-center justify-center py-12 text-gray-300 border-2 border-dashed border-gray-50 rounded-2xl">
                            <i className="fas fa-layer-group text-3xl mb-3 opacity-20"></i>
                            <p className="text-xs font-bold uppercase tracking-widest">Sin campos extra</p>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Changelog Section ── */}
            <div className="bg-white rounded-3xl shadow-card border border-gray-50 overflow-hidden mb-12">
                <button 
                    onClick={() => setShowChangelog(!showChangelog)}
                    className="w-full p-6 flex items-center justify-between hover:bg-gray-50 transition-colors"
                >
                    <div className="flex items-center gap-3 text-left">
                        <div className="w-10 h-10 rounded-xl bg-slate-50 text-slate-600 flex items-center justify-center shrink-0">
                            <i className="fas fa-history text-sm"></i>
                        </div>
                        <div>
                            <h3 className="font-semibold text-gray-800 text-base">Historial de Actualizaciones</h3>
                            <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold mt-0.5">Versión Actual: {changelogData.currentVersion}</p>
                        </div>
                    </div>
                    <i className={`fas fa-chevron-${showChangelog ? 'up' : 'down'} text-gray-300`}></i>
                </button>

                {showChangelog && (
                    <div className="p-6 pt-0 space-y-8 animate-fade-in border-t border-gray-50">
                        {changelogData.history.map((release) => (
                            <div key={release.version} className="relative pl-8 border-l-2 border-gray-100 last:border-0 pb-2">
                                <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-white border-4 border-brand-primary/20 ring-1 ring-brand-primary"></div>
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                                    <div>
                                        <span className="text-xs font-bold text-brand-primary px-2 py-0.5 rounded bg-red-50">{release.version}</span>
                                        <span className="ml-3 text-xs font-bold text-slate-800">{release.type}</span>
                                    </div>
                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{new Date(release.date).toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                                </div>
                                <ul className="space-y-2">
                                    {release.changes.map((change, j) => (
                                        <li key={j} className="text-sm text-slate-600 flex gap-3">
                                            <i className="fas fa-check text-[10px] text-green-500 mt-1.5 shrink-0"></i>
                                            {change}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Bottom Save for Tablets */}
            <div className="flex justify-center mt-12 bg-white/60 backdrop-blur-md p-6 rounded-3xl border border-white/50 shadow-xl">
               <button
                    onClick={handleSave}
                    disabled={saving}
                    className="btn-primary w-full max-w-md shadow-glow-red py-4 text-base"
                >
                    {saving ? (
                        <><i className="fas fa-circle-notch fa-spin mr-3"></i> Guardando Todo...</>
                    ) : (
                        <><i className="fas fa-save mr-3"></i> Guardar Todos los Cambios</>
                    )}
                </button>
            </div>
        </div>
    );
};

export default SettingsPage;
