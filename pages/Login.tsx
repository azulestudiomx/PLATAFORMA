import React, { useState } from 'react';
import { User } from '../types';

interface LoginProps {
  onLogin: (user: User) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Get API URL from env or default to localhost
  const API_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3000';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg('');

    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: email, password }),
      });

      const data = await response.json();

      if (response.ok) {
        // Success
        onLogin(data.user);
      } else {
        // Error handling (401, 404, etc.)
        setErrorMsg(data.error || 'Credenciales inválidas');
      }
    } catch (error) {
      console.error('Login error:', error);
      setErrorMsg('No se pudo conectar con el servidor. Verifica que el backend esté corriendo.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4 bg-[url('https://picsum.photos/1920/1080?blur=2')] bg-cover bg-center">
      <div className="absolute inset-0 bg-brand-primary/80 backdrop-blur-sm"></div>
      
      <div className="bg-white rounded-2xl shadow-2xl overflow-hidden max-w-md w-full relative z-10">
        <div className="p-8 text-center border-b border-gray-100">
           <div className="w-20 h-20 bg-brand-primary text-white rounded-full mx-auto flex items-center justify-center text-3xl shadow-lg mb-4">
             <i className="fas fa-heart"></i>
           </div>
           <h2 className="text-2xl font-bold text-brand-primary">Plataforma Ciudadana</h2>
           <p className="text-gray-500 text-sm mt-1">Campeche</p>
        </div>

        <form onSubmit={handleSubmit} className="p-8 pt-6">
          
          {errorMsg && (
            <div className="mb-4 p-3 bg-red-100 border border-red-300 text-red-700 rounded text-sm text-center">
              <i className="fas fa-exclamation-circle mr-1"></i> {errorMsg}
            </div>
          )}

          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-bold mb-2">
              Correo Electrónico
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ejemplo@campeche.gob.mx"
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
            <p className="text-right mt-2">
              <a href="#" className="text-xs text-brand-primary hover:underline">¿Olvidaste tu contraseña?</a>
            </p>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-brand-primary text-white font-bold py-3 px-4 rounded-lg hover:bg-red-800 transition-colors shadow-lg transform active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                 <i className="fas fa-spinner fa-spin mr-2"></i> Validando...
              </>
            ) : 'Iniciar Sesión'}
          </button>
          
          <div className="mt-6 text-center text-xs text-gray-400 bg-gray-50 p-2 rounded border border-gray-200">
            <p className="font-bold mb-1">Credenciales por defecto (DB Real):</p>
            <p>Admin: admin@campeche.gob.mx / admin123</p>
            <p>Campo: campo@campeche.gob.mx / campo123</p>
          </div>
        </form>
        
        <div className="bg-gray-50 p-4 text-center border-t border-gray-100">
           <p className="text-xs text-gray-500">¿No tienes cuenta? <span className="font-bold text-brand-primary cursor-pointer">Registrarse como capturista</span></p>
        </div>
      </div>
    </div>
  );
};

export default Login;