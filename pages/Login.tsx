import React, { useState } from 'react';
import { User } from '../types';
import { API_BASE_URL } from '../src/config';

interface LoginProps {
  onLogin: (user: User) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: email, password })
      });

      const data = await response.json();

      if (response.ok) {
        onLogin(data.user);
      } else {
        setError(data.error || 'Error al iniciar sesión');
      }
    } catch (err) {
      console.error(err);
      setError('Error de conexión con el servidor');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{
        backgroundImage: 'url("https://images.unsplash.com/photo-1590523278135-1e290381802d?ixlib=rb-4.0.3&auto=format&fit=crop&w=1920&q=80")', // Placeholder: Campeche/Mexico style
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {/* Red Blur Overlay */}
      <div className="absolute inset-0 bg-red-900/40 backdrop-blur-sm z-0"></div>

      <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-md border-t-4 border-brand-primary z-10 relative">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-brand-primary mb-2">PLATAFORMA</h1>
          <p className="text-gray-500 font-medium">Ciudadana Campeche</p>
        </div>

        <form onSubmit={handleSubmit}>
          {error && (
            <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg text-sm flex items-center">
              <i className="fas fa-exclamation-circle mr-2"></i>
              {error}
            </div>
          )}
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-bold mb-2">
              Usuario o Correo Electrónico
            </label>
            <input
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ausuario o correo"
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-brand-primary focus:ring-2 focus:ring-red-200 outline-none transition-all"
              required
            />
          </div>
          <div className="mb-6">
            <label className="block text-gray-700 text-sm font-bold mb-2">
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-brand-primary focus:ring-2 focus:ring-red-200 outline-none transition-all"
              required
            />
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className={`w-full bg-brand-primary text-white font-bold py-3 rounded-lg hover:bg-red-800 transition-all transform hover:scale-[1.02] active:scale-95 shadow-lg flex justify-center items-center ${isLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
          >
            {isLoading ? (
              <>
                <i className="fas fa-circle-notch fa-spin mr-2"></i>
                Iniciando sesión...
              </>
            ) : (
              'Ingresar al Sistema'
            )}
          </button>
        </form>

        <div className="mt-6 text-center">
          <div className="text-xs text-gray-400 mb-4">
            <p className="font-bold">Versión 3.1</p>
          </div>
          <p className="text-gray-500 text-sm">
            ¿Olvidaste tu contraseña? <a href="#" className="text-brand-primary hover:underline font-medium">Contactar Soporte</a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;