import React, { createContext, useContext, useState, useEffect } from 'react';
import { configApi } from '../services/api';

interface Theme {
    primary: string;
    secondary: string;
    accent: string;
}

export interface CustomField {
    _id?: string;
    id: string;
    label: string;
    type: 'text' | 'number' | 'date' | 'select';
    options?: string[];
}

interface Config {
    theme: Theme;
    needTypes: string[];
    eventTypes: string[];
    customFields: CustomField[];
}

interface ConfigContextType {
    config: Config;
    updateConfig: (newConfig: Config) => Promise<void>;
    loading: boolean;
}

const defaultConfig: Config = {
    theme: { primary: '#8B0000', secondary: '#FFFFFF', accent: '#FFD700' },
    needTypes: ['Agua Potable', 'Luz Eléctrica', 'Drenaje', 'Salud', 'Educación', 'Seguridad', 'Otro'],
    eventTypes: ['Jornada de Captura', 'Visita de Campo', 'Reunión Vecinal', 'Entrega de Apoyo'],
    customFields: []
};

const ConfigContext = createContext<ConfigContextType | undefined>(undefined);

export const ConfigProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [config, setConfig] = useState<Config>(defaultConfig);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchConfig();
    }, []);

    // Apply theme to CSS variables whenever config changes
    useEffect(() => {
        const root = document.documentElement;
        root.style.setProperty('--color-primary', config.theme.primary);
        root.style.setProperty('--color-secondary', config.theme.secondary);
        root.style.setProperty('--color-accent', config.theme.accent);
    }, [config.theme]);

    const fetchConfig = async () => {
        try {
            const data = await configApi.get();
            // Data cleaning: remove empty strings from arrays
            if (data && data.needTypes) {
                data.needTypes = data.needTypes.filter((t: any) => typeof t === 'string' && t.trim() !== '');
            }
            if (data && data.eventTypes) {
                data.eventTypes = data.eventTypes.filter((t: any) => typeof t === 'string' && t.trim() !== '');
            }
            setConfig(data);
        } catch (error) {
            console.error('Error fetching config:', error);
        } finally {
            setLoading(false);
        }
    };

    const updateConfig = async (newConfig: Config) => {
        const saved = await configApi.update(newConfig);
        setConfig(saved);
    };

    return (
        <ConfigContext.Provider value={{ config, updateConfig, loading }}>
            {children}
        </ConfigContext.Provider>
    );
};

export const useConfig = () => {
    const context = useContext(ConfigContext);
    if (!context) {
        throw new Error('useConfig must be used within a ConfigProvider');
    }
    return context;
};
