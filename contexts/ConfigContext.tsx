import React, { createContext, useContext, useState, useEffect } from 'react';

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
    customFields: []
};

const ConfigContext = createContext<ConfigContextType | undefined>(undefined);

export const ConfigProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [config, setConfig] = useState<Config>(defaultConfig);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchConfig();
    }, []);

    // Apply theme to CSS variables
    useEffect(() => {
        const root = document.documentElement;
        root.style.setProperty('--color-primary', config.theme.primary);
        root.style.setProperty('--color-secondary', config.theme.secondary);
        root.style.setProperty('--color-accent', config.theme.accent);
    }, [config.theme]);

    const fetchConfig = async () => {
        try {
            const res = await fetch('http://localhost:3000/api/config');
            if (res.ok) {
                const data = await res.json();
                setConfig(data);
            }
        } catch (error) {
            console.error('Error fetching config:', error);
        } finally {
            setLoading(false);
        }
    };

    const updateConfig = async (newConfig: Config) => {
        try {
            const res = await fetch('http://localhost:3000/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newConfig)
            });

            if (res.ok) {
                const savedConfig = await res.json();
                setConfig(savedConfig);
            }
        } catch (error) {
            console.error('Error updating config:', error);
            throw error;
        }
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
