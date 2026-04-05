import React, { useState } from 'react';
import changelog from '../src/changelog.json';

interface LoginProps {
  onLogin: (username: string, password: string) => Promise<any>;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPass, setShowPass] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      await onLogin(username, password);
    } catch (err: any) {
      setError(err.message || 'Error al iniciar sesión');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{
        backgroundImage: 'url("https://res.cloudinary.com/dheyxobwr/image/upload/v1764813384/camp_wqz3u4.jpg")',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {/* Gradient overlay */}
      <div
        className="absolute inset-0 z-0"
        style={{ background: 'linear-gradient(135deg, rgba(60,0,0,0.85) 0%, rgba(20,0,0,0.70) 100%)' }}
      />

      {/* Decorative orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full blur-3xl opacity-20 z-0"
        style={{ background: 'radial-gradient(circle, #8B0000, transparent)' }} />
      <div className="absolute bottom-1/4 right-1/4 w-64 h-64 rounded-full blur-3xl opacity-15 z-0"
        style={{ background: 'radial-gradient(circle, #FFD700, transparent)' }} />

      {/* Card */}
      <div
        className="relative z-10 w-full max-w-md animate-slide-in-up"
        style={{
          background: 'rgba(255,255,255,0.97)',
          borderRadius: '24px',
          boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
          overflow: 'hidden',
        }}
      >
        {/* Top accent bar */}
        <div style={{ height: '4px', background: 'linear-gradient(90deg, #8B0000, #FFD700)' }} />

        <div className="px-8 py-9">
          {/* Logo / Brand */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-gradient shadow-glow-red mb-4">
              <i className="fas fa-landmark text-white text-xl"></i>
            </div>
            <h1 className="font-brand font-bold text-2xl text-gray-900 tracking-tight">Plataforma Ciudadana</h1>
            <p className="text-[10px] text-gray-400 mt-2 font-bold tracking-widest uppercase flex items-center justify-center gap-2">
              <span>Campeche</span>
              <span className="w-1 h-1 rounded-full bg-gray-200"></span>
              <span className="bg-gray-100 px-2 py-0.5 rounded text-brand-primary">v{changelog.currentVersion}</span>
            </p>
          </div>

          {/* Error alert */}
          {error && (
            <div className="mb-5 p-3.5 rounded-xl bg-red-50 border border-red-100 flex items-start gap-3 animate-fade-in">
              <div className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center shrink-0 mt-0.5">
                <i className="fas fa-exclamation text-red-500 text-[10px]"></i>
              </div>
              <p className="text-sm text-red-700 font-medium">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Usuario
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
                  <i className="fas fa-user text-sm"></i>
                </span>
                <input
                  id="login-username"
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="Ingresa tu usuario"
                  className="input-modern pl-10"
                  required
                  autoComplete="username"
                  autoFocus
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Contraseña
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
                  <i className="fas fa-lock text-sm"></i>
                </span>
                <input
                  id="login-password"
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="input-modern pl-10 pr-10"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPass(v => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <i className={`fas ${showPass ? 'fa-eye-slash' : 'fa-eye'} text-sm`}></i>
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              id="login-submit"
              type="submit"
              disabled={isLoading || !username || !password}
              className="w-full mt-2 py-3 rounded-xl font-semibold text-white text-sm transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: isLoading || !username || !password
                  ? '#ccc'
                  : 'linear-gradient(135deg, #8B0000 0%, #4a0000 100%)',
                boxShadow: isLoading || !username || !password ? 'none' : '0 4px 16px rgba(139,0,0,0.35)',
              }}
            >
              {isLoading ? (
                <>
                  <i className="fas fa-circle-notch fa-spin"></i>
                  Verificando...
                </>
              ) : (
                <>
                  <i className="fas fa-arrow-right-to-bracket"></i>
                  Ingresar al Sistema
                </>
              )}
            </button>
          </form>

          {/* Footer */}
          <div className="mt-8 pt-5 border-t border-gray-100 text-center">
            <p className="text-[11px] text-gray-300 font-medium tracking-widest uppercase">
              Desarrollado por{' '}
              <span className="text-brand-primary font-bold">Azul Estudios MX</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;