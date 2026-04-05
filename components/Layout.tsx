import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { User, UserRole } from '../types';
import { useSyncReports } from '../services/syncHook';
import { usePWAInstall } from '../hooks/usePWAInstall';
import changelog from '../src/changelog.json';

interface LayoutProps {
  children: React.ReactNode;
  user: User | null;
  onLogout: () => void;
}

const Layout: React.FC<LayoutProps> = ({ children, user, onLogout }) => {
  const location = useLocation();
  const { isOnline, pendingCount, isSyncing, syncReports } = useSyncReports();
  const { isInstallable, install } = usePWAInstall();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (!user) return <>{children}</>;

  const navItems = [
    { path: '/',             label: 'Dashboard',    icon: 'fa-chart-pie',     roles: [UserRole.ADMIN] },
    { path: '/capture',      label: 'Capturar',     icon: 'fa-camera',        roles: [UserRole.ADMIN, UserRole.CAPTURIST] },
    { path: '/people',       label: 'Padrón',       icon: 'fa-address-book',  roles: [UserRole.ADMIN, UserRole.CAPTURIST] },
    { path: '/reports',      label: 'Expedientes',  icon: 'fa-folder-open',   roles: [UserRole.ADMIN, UserRole.CAPTURIST] },
    { path: '/calendar',     label: 'Calendario',   icon: 'fa-calendar-alt',  roles: [UserRole.ADMIN, UserRole.CAPTURIST] },
    { path: '/users',        label: 'Usuarios',     icon: 'fa-users',         roles: [UserRole.ADMIN] },
    { path: '/configuracion',label: 'Configuración',icon: 'fa-sliders-h',     roles: [UserRole.ADMIN] },
  ];

  const visibleItems = navItems.filter(item => item.roles.includes(user.role));
  const initials = user.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

  const SidebarContent = () => (
    <>
      {/* Brand */}
      <div className="px-6 py-7">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-lg bg-brand-accent/20 flex items-center justify-center">
            <i className="fas fa-landmark text-brand-accent text-sm"></i>
          </div>
          <div>
            <p className="font-brand font-bold text-white text-sm leading-tight tracking-wide">PLATAFORMA</p>
            <p className="text-[10px] text-white/40 font-medium tracking-widest uppercase">Ciudadana Campeche</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-0 pb-4">
        <p className="text-[10px] font-bold text-white/30 tracking-widest uppercase px-8 mb-2">Menú</p>
        {visibleItems.map(item => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => setSidebarOpen(false)}
              className={`nav-item ${isActive ? 'active' : ''}`}
            >
              <i className={`fas ${item.icon}`}></i>
              <span>{item.label}</span>
              {isActive && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-brand-accent"></span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* User card */}
      <div className="mx-3 mb-3 p-3 rounded-2xl bg-white/5 border border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-white/20 to-white/10 flex items-center justify-center font-bold text-white text-sm shrink-0">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">{user.name}</p>
            <p className="text-[11px] text-white/40 capitalize">{user.role.toLowerCase()}</p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="px-3 pb-4 space-y-1.5">
        {isInstallable && (
          <button
            onClick={install}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl bg-white/8 hover:bg-white/14 text-white/80 hover:text-white text-sm font-medium transition-all"
          >
            <i className="fas fa-download w-4 text-center text-xs"></i>
            Instalar App
          </button>
        )}
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl bg-white/6 hover:bg-red-900/40 text-white/60 hover:text-white text-sm font-medium transition-all"
        >
          <i className="fas fa-sign-out-alt w-4 text-center text-xs"></i>
          Cerrar Sesión
        </button>
      </div>

      <div className="px-6 py-4 border-t border-white/5 opacity-50 flex items-center justify-between">
        <span className="text-[9px] font-bold text-white uppercase tracking-widest">Versión</span>
        <span className="text-[9px] font-mono text-white/80 px-2 py-0.5 rounded bg-white/10">{changelog.currentVersion}</span>
      </div>
    </>
  );

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#F1F5F9' }}>

      {/* ── Desktop Sidebar ── */}
      <aside
        className="sidebar-glass hidden lg:flex flex-col shrink-0 animate-slide-in-left"
        style={{ width: 'var(--sidebar-w)' }}
      >
        <SidebarContent />
      </aside>

      {/* ── Mobile/Tablet Sidebar Overlay ── */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
          <aside
            className="sidebar-glass relative z-10 flex flex-col animate-slide-in-left"
            style={{ width: 'var(--sidebar-w)' }}
          >
            <button
              onClick={() => setSidebarOpen(false)}
              className="absolute top-4 right-4 text-white/50 hover:text-white transition-colors"
            >
              <i className="fas fa-times text-lg"></i>
            </button>
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* ── Main Area ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* ── Top Header ── */}
        <header className="header-glass h-14 flex items-center px-5 gap-4 shrink-0 z-10">
          {/* Mobile menu button */}
          <button
            className="lg:hidden text-slate-500 hover:text-slate-800 transition-colors"
            onClick={() => setSidebarOpen(true)}
          >
            <i className="fas fa-bars text-lg"></i>
          </button>

          {/* Page title (mobile/tablet) */}
          <span className="lg:hidden font-brand font-bold text-brand-primary text-base tracking-wide">
            PLATAFORMA
          </span>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Sync / Network status */}
          <div className="flex items-center gap-2">
            {/* Online badge */}
            <div className={`badge ${isOnline ? 'badge-green' : 'badge-gray'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'dot-online' : 'dot-offline'}`}></span>
              {isOnline ? 'En Línea' : 'Offline'}
            </div>

            {/* Sync badge */}
            {isSyncing ? (
              <div className="badge badge-blue">
                <i className="fas fa-sync fa-spin text-[9px]"></i>
                Sincronizando
              </div>
            ) : pendingCount > 0 ? (
              <button
                onClick={syncReports}
                className="badge badge-orange cursor-pointer hover:bg-orange-100 transition-colors"
                title="Clic para sincronizar"
              >
                <i className="fas fa-cloud-upload-alt text-[9px]"></i>
                {pendingCount} pendiente{pendingCount > 1 ? 's' : ''}
              </button>
            ) : (
              <div className="badge badge-green">
                <i className="fas fa-check-circle text-[9px]"></i>
                Sincronizado
              </div>
            )}

            {/* Avatar */}
            <div className="w-8 h-8 rounded-lg bg-brand-gradient flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-sm ml-1">
              {initials}
            </div>
          </div>
        </header>

        {/* ── Main content ── */}
        <main className="flex-1 overflow-auto p-4 md:p-7 pb-24 md:pb-7">
          {/* PWA Banner */}
          {isInstallable && (
            <div className="md:hidden mb-4 p-4 rounded-2xl bg-brand-gradient text-white flex items-center gap-4 shadow-lg animate-fade-in">
              <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                <i className="fas fa-mobile-alt text-lg"></i>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">Instalar la App</p>
                <p className="text-xs text-white/70">Accede desde tu pantalla de inicio</p>
              </div>
              <button
                onClick={install}
                className="shrink-0 bg-white text-brand-primary text-xs font-bold px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Instalar
              </button>
            </div>
          )}

          {/* Page wrapper with entry animation */}
          <div key={location.pathname} className="page-enter">
            {children}
          </div>
        </main>

        {/* ── Mobile Bottom Nav ── */}
        <nav className="mobile-nav lg:hidden fixed bottom-0 inset-x-0 z-40 flex justify-around items-center py-2 px-2">
          {visibleItems.slice(0, 5).map(item => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition-all ${
                  isActive
                    ? 'text-brand-primary bg-red-50'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <i className={`fas ${item.icon} text-base`}></i>
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            );
          })}
          <button
            onClick={onLogout}
            className="flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl text-slate-400 hover:text-red-500 transition-colors"
          >
            <i className="fas fa-sign-out-alt text-base"></i>
            <span className="text-[10px] font-medium">Salir</span>
          </button>
        </nav>

      </div>
    </div>
  );
};

export default Layout;