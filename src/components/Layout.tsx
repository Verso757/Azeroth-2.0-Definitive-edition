import React, { useState } from 'react';
import { Link, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { LayoutDashboard, ListTodo, LogOut, PlusCircle, ShieldAlert, Menu, X, User, MessageSquare, FileText, BarChart2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import AIChat from './AIChat';
import { LogoIcon } from './LogoIcon';

export default function Layout() {
  const { profile, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/auth');
  };

  const navItems = [
    { name: 'Panel', path: '/', icon: LayoutDashboard },
    { name: 'Incidencias', path: '/issues', icon: ListTodo },
    { name: 'Nueva Incidencia', path: '/new-issue', icon: PlusCircle },
    { name: 'Cambios', path: '/exchanges', icon: ListTodo },
    { name: 'Responsivas', path: '/responsivas', icon: FileText },
    { name: 'Inventario', path: '/assets', icon: LayoutDashboard },
    { name: 'Reportes (BI)', path: '/reports', icon: BarChart2 },
  ];

  if (isAdmin) {
    navItems.push({ name: 'Administración', path: '/admin', icon: ShieldAlert });
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] font-sans flex flex-col">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-100 px-6 md:px-12 py-4 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 group">
            {/* LOGO: The image will load from /public/Logo.png. By default it shows an icon if not found. */}
            <div className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center text-white shadow-lg shadow-primary-200 group-hover:scale-105 transition-transform overflow-hidden border border-slate-100 p-1">
              <img src="/Logo.png" alt="Yaqui Logo" className="w-full h-full object-contain" />
            </div>
            <span className="text-xl font-black text-slate-900 tracking-tight">Azeroth</span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-2">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
                  location.pathname === item.path
                    ? "bg-primary-600 text-white shadow-lg shadow-primary-500/20"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                )}
              >
                <item.icon className="w-4 h-4" />
                {item.name}
              </Link>
            ))}
          </nav>

          {/* User Profile & Logout (Desktop) */}
          <div className="hidden md:flex items-center gap-4 pl-6 border-l border-slate-100">
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-[10px] font-black text-slate-900 uppercase tracking-tight">{profile?.displayName || 'Usuario'}</p>
                <p className="text-[9px] font-bold text-primary-500 uppercase tracking-widest">{profile?.role}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 overflow-hidden flex items-center justify-center text-primary-600 font-black shadow-sm">
                {profile?.photoURL ? (
                  <img src={profile.photoURL} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  profile?.displayName?.charAt(0) || <User className="w-5 h-5" />
                )}
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="p-2.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
              title="Desconectar"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>

          {/* Mobile Menu Button */}
          <button 
            className="md:hidden p-2 text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {isMenuOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMenuOpen(false)}
              className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm md:hidden"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 bottom-0 w-[80%] max-w-sm bg-white z-50 shadow-2xl p-8 md:hidden flex flex-col"
            >
              <div className="flex items-center justify-between mb-10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center text-white shadow-sm border border-slate-100 overflow-hidden p-1">
                    <img src="/Logo.png" alt="Yaqui Logo" className="w-full h-full object-contain" />
                  </div>
                  <span className="text-xl font-bold text-slate-900 tracking-tight">Azeroth</span>
                </div>
                <button 
                  onClick={() => setIsMenuOpen(false)}
                  className="p-2 text-slate-400 hover:bg-slate-100 rounded-xl"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="flex items-center gap-4 p-5 bg-slate-50 rounded-[2rem] mb-8 border border-slate-100">
                <div className="w-12 h-12 rounded-2xl bg-white shadow-sm flex items-center justify-center text-primary-600 font-black border border-slate-200">
                  {profile?.displayName?.charAt(0) || 'U'}
                </div>
                <div>
                  <p className="text-sm font-black text-slate-900 uppercase">{profile?.displayName || 'Usuario'}</p>
                  <p className="text-[10px] font-bold text-primary-600 uppercase">{profile?.role}</p>
                </div>
              </div>

              <nav className="flex-1 space-y-2">
                {navItems.map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setIsMenuOpen(false)}
                    className={cn(
                      "flex items-center gap-4 px-6 py-4 rounded-2xl text-sm font-black uppercase tracking-widest transition-all",
                      location.pathname === item.path
                        ? "bg-primary-600 text-white shadow-xl shadow-primary-500/20"
                        : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                    )}
                  >
                    <item.icon className="w-5 h-5" />
                    {item.name}
                  </Link>
                ))}
              </nav>

              <button
                onClick={handleLogout}
                className="mt-auto w-full flex items-center justify-center gap-3 py-5 rounded-2xl text-xs font-black text-red-500 bg-red-50 hover:bg-red-100 transition-all uppercase tracking-[0.2em]"
              >
                <LogOut className="w-4 h-4" />
                Cerrar Sesión
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <main className="flex-1 overflow-x-hidden bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:24px_24px]">
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className={cn(
            "p-6 md:p-12 mx-auto",
            location.pathname === '/reports' ? "max-w-full" : "max-w-7xl"
          )}
        >
          <Outlet />
        </motion.div>
      </main>
      <AIChat />
    </div>
  );
}
