import React, { useState } from 'react';
import { useAuth } from '../AuthContext';
import { Navigate } from 'react-router-dom';
import { ShieldAlert, ArrowRight, Building, Globe, Copy, Check, ExternalLink, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import firebaseConfig from '../../firebase-applet-config.json';

interface AuthErrorInfo {
  title: string;
  message: string;
  isDomainError?: boolean;
  domain?: string;
}

export default function AuthPage() {
  const { loginWithGoogle, profile, loading } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [guildId, setGuildId] = useState('');
  const [errorInfo, setErrorInfo] = useState<AuthErrorInfo | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
    </div>
  );
  
  if (profile) return <Navigate to="/" />;

  const currentHost = typeof window !== 'undefined' ? window.location.hostname : 'azeroth.familiagarcia.site';
  const projectId = firebaseConfig?.projectId || 'gen-lang-client-0521902576';
  const firebaseSettingsUrl = `https://console.firebase.google.com/project/${projectId}/authentication/settings`;

  const copyDomain = () => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(currentHost);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleGoogleAuth = async () => {
    setErrorInfo(null);
    setAuthLoading(true);

    try {
      if (!isLogin && !guildId) throw new Error('Se requiere un Código de Franquicia válido para registrarse.');
      await loginWithGoogle(!isLogin, guildId);
    } catch (err: any) {
      const code = err?.code || '';
      const msg = err?.message || '';

      if (code === 'auth/unauthorized-domain' || msg.includes('unauthorized-domain')) {
        setErrorInfo({
          title: 'Dominio no autorizado en Firebase',
          message: `El dominio "${currentHost}" no está en la lista de dominios autorizados de Firebase Authentication.`,
          isDomainError: true,
          domain: currentHost
        });
      } else if (code === 'auth/popup-blocked') {
        setErrorInfo({
          title: 'Ventana emergente bloqueada',
          message: 'Tu navegador bloqueó la ventana emergente de inicio de sesión de Google. Habilita los pop-ups para este sitio e inténtalo nuevamente.'
        });
      } else if (code === 'auth/popup-closed-by-user') {
        setErrorInfo({
          title: 'Ventana cerrada',
          message: 'La ventana de inicio de sesión con Google se cerró antes de completar la autenticación.'
        });
      } else if (code === 'auth/network-request-failed') {
        setErrorInfo({
          title: 'Error de red',
          message: 'No se pudo contactar a los servidores de autenticación. Verifica tu conexión a internet o extensiones bloqueadoras de anuncios.'
        });
      } else {
        if (msg.includes('únete primero con un Código')) {
          setIsLogin(false);
        }
        setErrorInfo({
          title: 'Error de autenticación',
          message: msg || 'Ocurrió un error inesperado al procesar el inicio de sesión.'
        });
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
        className="max-w-md w-full bg-white rounded-[2.5rem] shadow-sm p-8 sm:p-10 border border-slate-100"
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
            onClick={() => { setIsLogin(true); setErrorInfo(null); }}
            className={`flex-1 py-3 text-xs font-black rounded-xl transition-all uppercase tracking-widest ${isLogin ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
          >
            Ingresar
          </button>
          <button 
            onClick={() => { setIsLogin(false); setErrorInfo(null); }}
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

          {errorInfo && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.96 }} 
              animate={{ opacity: 1, scale: 1 }}
              className={`p-4 rounded-2xl text-xs border leading-relaxed ${
                errorInfo.isDomainError 
                  ? 'bg-amber-50/90 text-amber-950 border-amber-200/80 shadow-xs' 
                  : 'bg-red-50 text-red-600 border-red-100'
              }`}
            >
              <div className="flex items-start gap-2.5">
                {errorInfo.isDomainError ? (
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                ) : (
                  <ShieldAlert className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                )}
                <div className="flex-1 space-y-2">
                  <div className="font-black text-xs uppercase tracking-wide">
                    {errorInfo.title}
                  </div>
                  <p className="font-medium text-slate-700">
                    {errorInfo.message}
                  </p>

                  {errorInfo.isDomainError && (
                    <div className="mt-3 pt-3 border-t border-amber-200/60 space-y-2.5 text-[11px]">
                      <div className="font-bold text-amber-900">
                        Cómo solucionarlo en 1 minuto:
                      </div>
                      <ol className="list-decimal list-inside space-y-1.5 text-slate-700 pl-0.5 font-normal">
                        <li>
                          Copia tu dominio:
                          <div className="mt-1 flex items-center gap-1.5 bg-white p-1.5 rounded-lg border border-amber-200">
                            <Globe className="w-3.5 h-3.5 text-slate-400 shrink-0 ml-1" />
                            <code className="font-mono font-bold text-slate-800 text-[11px] flex-1 truncate">
                              {currentHost}
                            </code>
                            <button
                              type="button"
                              onClick={copyDomain}
                              className="px-2 py-1 rounded bg-amber-100 text-amber-900 hover:bg-amber-200 font-bold text-[10px] flex items-center gap-1 shrink-0 transition-colors"
                            >
                              {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                              {copied ? 'Copiado' : 'Copiar'}
                            </button>
                          </div>
                        </li>
                        <li>
                          Abre Firebase Console en la sección de Dominios Autorizados:
                          <div className="mt-1">
                            <a
                              href={firebaseSettingsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 text-white font-bold hover:bg-amber-700 transition-colors shadow-xs"
                            >
                              <span>Ir a Dominios Autorizados de Firebase</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        </li>
                        <li>
                          En la pestaña <strong>Authorized domains</strong>, haz clic en <strong>"Add domain"</strong>, pega <code>{currentHost}</code> y haz clic en <strong>Guardar</strong>.
                        </li>
                      </ol>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          <button
            onClick={handleGoogleAuth}
            disabled={authLoading}
            className="w-full bg-white border border-slate-200 text-slate-900 py-4 rounded-2xl font-black shadow-sm hover:bg-slate-50 active:scale-[0.98] transition-all flex items-center justify-center gap-3 group text-sm tracking-widest cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {authLoading ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-600"></div>
            ) : (
              <>
                <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
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
            onClick={() => { setIsLogin(!isLogin); setErrorInfo(null); }} 
            className="text-primary-600 font-bold hover:underline cursor-pointer"
          >
            {isLogin ? 'Regístrate' : 'Inicia sesión'}
          </button>
        </p>
      </motion.div>
    </div>
  );
}
