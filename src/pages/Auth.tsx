import React, { useState } from 'react';
import { useAuth } from '../AuthContext';
import { Navigate } from 'react-router-dom';
import { ShieldAlert, ArrowRight, Building } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { LogoIcon } from '../components/LogoIcon';

export default function AuthPage() {
  const { loginWithGoogle, profile, loading } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [guildId, setGuildId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
    </div>
  );
  
  if (profile) return <Navigate to="/" />;

  const handleGoogleAuth = async () => {
    setError(null);
    setAuthLoading(true);

    try {
      if (!isLogin && !guildId) throw new Error('Se requiere un Código de Franquicia válido para registrarse.');
      await loginWithGoogle(!isLogin, guildId);
    } catch (err: any) {
      setError(err.message || 'Ocurrió un error en la autenticación');
      if (err.message?.includes('únete primero con un Código')) {
        setIsLogin(false);
      }
    } finally {
      setAuthLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-white rounded-[2.5rem] shadow-sm p-10 border border-slate-100"
      >
        <div className="text-center mb-8">
          <div className="inline-flex w-24 h-24 rounded-[2rem] bg-white text-primary-600 mb-6 border border-slate-100 shadow-xl overflow-hidden relative items-center justify-center p-3">
            <img src="/Logo.png" alt="Yaqui Logo" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Azeroth</h1>
          <p className="text-slate-500 mt-2 font-medium text-sm">Gestión Operativa e Incidencias</p>
        </div>

        <div className="flex bg-slate-50 p-1 rounded-2xl mb-8 border border-slate-100">
          <button 
            onClick={() => setIsLogin(true)}
            className={`flex-1 py-3 text-xs font-black rounded-xl transition-all uppercase tracking-widest ${isLogin ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
          >
            Ingresar
          </button>
          <button 
            onClick={() => setIsLogin(false)}
            className={`flex-1 py-3 text-xs font-black rounded-xl transition-all uppercase tracking-widest ${!isLogin ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
          >
            Registrarse
          </button>
        </div>

        <div className="space-y-5">
          <AnimatePresence mode="wait">
            {!isLogin && (
              <motion.div 
                key="signup-fields"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-5 overflow-hidden"
              >
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Código de Franquicia / Grupo</label>
                  <div className="relative">
                    <Building className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      required={!isLogin}
                      type="text"
                      className="w-full pl-12 pr-4 py-4 rounded-2xl bg-white border border-slate-200 text-slate-900 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none font-bold uppercase tracking-widest transition-all placeholder:text-slate-400 placeholder:font-medium placeholder:normal-case shadow-sm"
                      placeholder="Ej: EMPRESA_01"
                      value={guildId}
                      onChange={e => setGuildId(e.target.value.toUpperCase())}
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {error && (
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="p-4 bg-red-50 text-red-600 rounded-2xl text-xs font-bold border border-red-100 leading-relaxed"
            >
              {error}
            </motion.div>
          )}

          <button
            onClick={handleGoogleAuth}
            disabled={authLoading}
            className="w-full bg-white border border-slate-200 text-slate-900 py-4 rounded-2xl font-black shadow-sm hover:bg-slate-50 active:scale-[0.98] transition-all flex items-center justify-center gap-3 group text-sm tracking-widest"
          >
            {authLoading ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-600"></div>
            ) : (
              <>
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                {isLogin ? 'ACCEDER CON GOOGLE' : 'REGISTRARSE CON GOOGLE'}
              </>
            )}
          </button>
        </div>

        <p className="mt-8 text-center text-slate-500 text-sm font-medium">
          {isLogin ? '¿Aún no tienes cuenta? ' : '¿Ya eres miembro? '}
          <button 
            onClick={() => setIsLogin(!isLogin)} 
            className="text-primary-600 font-bold hover:underline"
          >
            {isLogin ? 'Regístrate' : 'Inicia sesión'}
          </button>
        </p>
      </motion.div>
    </div>
  );
}
