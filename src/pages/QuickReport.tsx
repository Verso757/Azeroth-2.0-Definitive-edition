import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, addDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { signInAnonymously } from 'firebase/auth';
import { auth, db } from '../firebase';
import { City, Area, Employee, Category, IssuePriority } from '../types';
import { AlertCircle, CheckCircle2, ChevronRight, User, MapPin, LayoutGrid, Sparkles, Send, ArrowLeft, Search, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

export default function QuickReport() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const guildId = searchParams.get('guild') || '';
  const cityId = searchParams.get('city') || '';
  const areaId = searchParams.get('area') || '';

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submittedIssueId, setSubmittedIssueId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [cityData, setCityData] = useState<City | null>(null);
  const [areaData, setAreaData] = useState<Area | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  // Form State
  const [selectedEmployeeName, setSelectedEmployeeName] = useState<string>('');
  const [customReporterName, setCustomReporterName] = useState<string>('');
  const [isCustomReporter, setIsCustomReporter] = useState<boolean>(false);
  const [searchEmployeeQuery, setSearchEmployeeQuery] = useState<string>('');

  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [customTitle, setCustomTitle] = useState<string>('');
  const [priority, setPriority] = useState<IssuePriority>('medium');
  const [description, setDescription] = useState<string>('');

  useEffect(() => {
    async function init() {
      try {
        setLoading(true);

        // Ensure user is signed in (silently anonymous if not logged in)
        if (!auth.currentUser) {
          await signInAnonymously(auth);
        }

        if (!guildId) {
          setError('Falta el identificador de Empresa en el código QR.');
          setLoading(false);
          return;
        }

        // Fetch City
        if (cityId) {
          const cDoc = await getDoc(doc(db, 'cities', cityId));
          if (cDoc.exists()) {
            setCityData({ id: cDoc.id, ...cDoc.data() } as City);
          }
        }

        // Fetch Area
        if (areaId) {
          const aDoc = await getDoc(doc(db, 'areas', areaId));
          if (aDoc.exists()) {
            setAreaData({ id: aDoc.id, ...aDoc.data() } as Area);
          }
        }

        // Fetch Employees for this guild
        const empQuery = query(collection(db, 'employees'), where('guildId', '==', guildId));
        const empSnap = await getDocs(empQuery);
        const allEmps = empSnap.docs.map(d => ({ id: d.id, ...d.data() } as Employee));

        // Filter employees to prioritize or match this city & area
        const matchingEmps = allEmps.filter(e => {
          if (cityId && areaId) {
            return (e.cityId === cityId && e.areaId === areaId) || (!e.cityId && !e.areaId) || (e.cityId === cityId && !e.areaId);
          }
          if (cityId) return e.cityId === cityId || !e.cityId;
          if (areaId) return e.areaId === areaId || !e.areaId;
          return true;
        });

        // Sort so exact matches come first
        matchingEmps.sort((a, b) => {
          const aExact = (a.cityId === cityId && a.areaId === areaId) ? 1 : 0;
          const bExact = (b.cityId === cityId && b.areaId === areaId) ? 1 : 0;
          if (aExact !== bExact) return bExact - aExact;
          return a.name.localeCompare(b.name);
        });

        setEmployees(matchingEmps);

        // Fetch Categories
        const catQuery = query(collection(db, 'categories'), where('guildId', '==', guildId));
        const catSnap = await getDocs(catQuery);
        const catList = catSnap.docs.map(d => ({ id: d.id, ...d.data() } as Category));
        setCategories(catList);
        if (catList.length > 0) {
          setSelectedCategoryId(catList[0].id);
        } else {
          setSelectedCategoryId('otro');
        }

      } catch (err: any) {
        console.error('Error cargando datos del QR:', err);
        setError('No se pudieron cargar los datos del punto de reporte. Verifica tu conexión a internet.');
      } finally {
        setLoading(false);
      }
    }

    init();
  }, [guildId, cityId, areaId]);

  const filteredEmployees = employees.filter(e => 
    e.name.toLowerCase().includes(searchEmployeeQuery.toLowerCase()) ||
    (e.position && e.position.toLowerCase().includes(searchEmployeeQuery.toLowerCase()))
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalReporter = isCustomReporter ? customReporterName.trim() : selectedEmployeeName.trim();

    if (!finalReporter) {
      alert('Por favor indica quién reporta la incidencia.');
      return;
    }

    const selectedCategory = categories.find(c => c.id === selectedCategoryId);
    const finalTitle = selectedCategoryId === 'otro' || !selectedCategory ? customTitle.trim() : selectedCategory.name;

    if (!finalTitle) {
      alert('Por favor especifica el problema o título de la incidencia.');
      return;
    }

    if (!description.trim()) {
      alert('Por favor agrega una breve descripción de lo sucedido.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const currentAuthUser = auth.currentUser;
      const userId = currentAuthUser ? currentAuthUser.uid : 'kiosk_qr';
      const userEmail = currentAuthUser?.email || 'kiosk@azeroth.ops';
      const userName = finalReporter;

      const newIssueDoc = await addDoc(collection(db, 'issues'), {
        title: finalTitle,
        description: description.trim(),
        areaId: areaId || 'general',
        areaName: areaData?.name || 'General',
        cityId: cityId || null,
        cityName: cityData?.name || null,
        categoryId: selectedCategoryId === 'otro' ? null : selectedCategoryId,
        categoryName: selectedCategory?.name || null,
        priority: priority,
        reportedBy: finalReporter,
        affectedPeople: [finalReporter],
        status: 'open',
        userId: userId,
        userName: userName,
        userEmail: userEmail,
        guildId: guildId,
        reportsCount: 1,
        source: 'qr_kiosk',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Add creation event
      await addDoc(collection(db, 'issues', newIssueDoc.id, 'events'), {
        type: 'creation',
        issueId: newIssueDoc.id,
        userId: userId,
        userName: finalReporter,
        content: `Incidencia reportada desde Punto QR (${cityData?.name || 'Ciudad'} - ${areaData?.name || 'División'}) por ${finalReporter}.`,
        createdAt: new Date().toISOString()
      });

      setSubmittedIssueId(newIssueDoc.id);
    } catch (err: any) {
      console.error('Error al registrar incidencia:', err);
      setError('Ocurrió un error al enviar el reporte. Por favor inténtalo de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-3xl bg-primary-50 border border-primary-100 flex items-center justify-center text-primary-600 font-black text-xl mb-4 shadow-sm animate-pulse">
          AZ
        </div>
        <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mb-4" />
        <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">Cargando Punto de Reporte...</h2>
        <p className="text-xs font-semibold text-slate-400 mt-1">Conectando con la sucursal y cargando integrantes</p>
      </div>
    );
  }

  if (submittedIssueId) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-3xl border border-slate-200 p-8 shadow-xl max-w-md w-full text-center space-y-6"
        >
          <div className="w-20 h-20 bg-emerald-50 border-2 border-emerald-200 rounded-full flex items-center justify-center mx-auto text-emerald-600 shadow-lg shadow-emerald-500/10">
            <CheckCircle2 className="w-10 h-10" />
          </div>

          <div className="space-y-2">
            <span className="px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full text-[10px] font-black uppercase tracking-widest">
              Reporte Recibido
            </span>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">¡Incidencia Registrada!</h2>
            <p className="text-slate-500 text-sm font-medium leading-relaxed">
              El ticket ha sido levantado correctamente en el sistema. El Jefe de División y el equipo técnico ya fueron notificados.
            </p>
          </div>

          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 text-left space-y-2 text-xs">
            <div className="flex justify-between items-center py-1 border-b border-slate-200">
              <span className="font-bold text-slate-500">ID de Ticket:</span>
              <span className="font-mono font-black text-slate-900 uppercase">#{submittedIssueId.slice(0, 8)}</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-slate-200">
              <span className="font-bold text-slate-500">Sucursal / Ciudad:</span>
              <span className="font-bold text-slate-900">{cityData?.name || 'No especificada'}</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-slate-200">
              <span className="font-bold text-slate-500">División:</span>
              <span className="font-bold text-slate-900">{areaData?.name || 'General'}</span>
            </div>
            <div className="flex justify-between items-center py-1">
              <span className="font-bold text-slate-500">Reportó:</span>
              <span className="font-bold text-primary-600">{isCustomReporter ? customReporterName : selectedEmployeeName}</span>
            </div>
          </div>

          <div className="pt-2">
            <button
              onClick={() => {
                setSubmittedIssueId(null);
                setDescription('');
                setCustomTitle('');
              }}
              className="w-full py-4 bg-primary-600 hover:bg-primary-700 text-white font-black text-xs uppercase tracking-wider rounded-2xl shadow-lg shadow-primary-600/20 transition-all cursor-pointer"
            >
              Reportar Otra Incidencia
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/60 pb-12">
      {/* Top Header Card */}
      <div className="bg-white border-b border-slate-200 px-4 py-5 shadow-xs sticky top-0 z-30">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary-50 border border-primary-100 flex items-center justify-center text-primary-600 font-black shadow-xs">
              AZ
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Punto de Incidencias</p>
              <h1 className="text-base font-black text-slate-900 leading-tight">
                {guildId} Soporte Operativo
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg text-[10px] font-black uppercase tracking-wide flex items-center gap-1">
              <MapPin className="w-3 h-3 text-primary-600" /> {cityData?.name || 'Ciudad'}
            </span>
            <span className="px-2.5 py-1 bg-primary-50 text-primary-700 rounded-lg text-[10px] font-black uppercase tracking-wide flex items-center gap-1">
              <LayoutGrid className="w-3 h-3 text-primary-600" /> {areaData?.name || 'División'}
            </span>
          </div>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 mt-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="p-4 bg-red-50 text-red-700 rounded-2xl border border-red-200 text-xs font-semibold flex items-center gap-3">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Step 1: Who is reporting? (Integrantes) */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-primary-600">Paso 1 de 3</span>
                <h3 className="text-lg font-black text-slate-900">¿Quién reporta la incidencia?</h3>
              </div>
              <User className="w-5 h-5 text-slate-400" />
            </div>

            <p className="text-xs text-slate-500 font-medium">
              Selecciona tu nombre de la lista de integrantes de <strong>{areaData?.name || 'esta área'}</strong> o escribe tu nombre si eres nuevo.
            </p>

            {!isCustomReporter ? (
              <div className="space-y-3">
                {employees.length > 5 && (
                  <div className="relative">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Buscar tu nombre..."
                      value={searchEmployeeQuery}
                      onChange={(e) => setSearchEmployeeQuery(e.target.value)}
                      className="w-full pl-10 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto p-1 bg-slate-50/50 rounded-2xl border border-slate-100">
                  {filteredEmployees.map((emp) => {
                    const isSelected = selectedEmployeeName === emp.name;
                    return (
                      <button
                        type="button"
                        key={emp.id}
                        onClick={() => setSelectedEmployeeName(emp.name)}
                        className={cn(
                          "p-3 rounded-xl text-left border transition-all flex flex-col justify-between cursor-pointer",
                          isSelected
                            ? "bg-primary-50 border-primary-500 ring-2 ring-primary-500/20 text-primary-900 shadow-xs"
                            : "bg-white border-slate-200 hover:border-slate-300 text-slate-700"
                        )}
                      >
                        <span className="text-xs font-black truncate">{emp.name}</span>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight mt-0.5">
                          {emp.position || 'Colaborador'}
                        </span>
                      </button>
                    );
                  })}

                  {filteredEmployees.length === 0 && (
                    <div className="col-span-full p-4 text-center text-xs text-slate-500">
                      No se encontró personal con ese nombre.
                    </div>
                  )}
                </div>

                {selectedEmployeeName && (
                  <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center justify-between text-xs font-bold text-emerald-800">
                    <span>Seleccionado: <strong>{selectedEmployeeName}</strong></span>
                    <button
                      type="button"
                      onClick={() => setSelectedEmployeeName('')}
                      className="text-[10px] text-emerald-600 underline font-black"
                    >
                      Cambiar
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setIsCustomReporter(true);
                    setSelectedEmployeeName('');
                  }}
                  className="w-full py-2.5 px-3 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold text-slate-600 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> No aparezco en la lista (Escribir mi nombre)
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <input
                  type="text"
                  required
                  placeholder="Escribe tu Nombre Completo y Puesto..."
                  value={customReporterName}
                  onChange={(e) => setCustomReporterName(e.target.value)}
                  className="w-full p-3.5 bg-slate-50 border border-slate-300 rounded-2xl text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-primary-500"
                />
                <button
                  type="button"
                  onClick={() => setIsCustomReporter(false)}
                  className="text-xs font-bold text-primary-600 underline cursor-pointer"
                >
                  ← Volver a la lista de integrantes
                </button>
              </div>
            )}
          </div>

          {/* Step 2: What is the issue? */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-primary-600">Paso 2 de 3</span>
              <h3 className="text-lg font-black text-slate-900">¿Qué problema se presentó?</h3>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Categoría del Fallo</label>
              <select
                value={selectedCategoryId}
                onChange={(e) => setSelectedCategoryId(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-primary-500"
              >
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
                <option value="otro">Otro tipo de problema (Personalizado)</option>
              </select>
            </div>

            {selectedCategoryId === 'otro' && (
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Título Breve</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Impresora no enciende, Falla en banda transportadora..."
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            )}

            <div className="space-y-2 pt-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Urgencia / Impacto</label>
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { id: 'low', label: 'Baja', color: 'hover:bg-slate-100' },
                  { id: 'medium', label: 'Media', color: 'hover:bg-amber-50' },
                  { id: 'high', label: 'Alta', color: 'hover:bg-orange-50' },
                  { id: 'critical', label: 'Crítica', color: 'hover:bg-red-50' },
                ].map((p) => {
                  const isSelected = priority === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPriority(p.id as IssuePriority)}
                      className={cn(
                        "py-2 rounded-xl text-xs font-bold uppercase tracking-wider border transition-all cursor-pointer",
                        isSelected
                          ? p.id === 'critical'
                            ? "bg-red-600 text-white border-red-600 shadow-sm"
                            : p.id === 'high'
                            ? "bg-orange-500 text-white border-orange-500 shadow-sm"
                            : p.id === 'medium'
                            ? "bg-amber-500 text-white border-amber-500 shadow-sm"
                            : "bg-slate-700 text-white border-slate-700 shadow-sm"
                          : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                      )}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Step 3: Description */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-primary-600">Paso 3 de 3</span>
              <h3 className="text-lg font-black text-slate-900">Descripción detallada</h3>
            </div>

            <textarea
              required
              rows={4}
              placeholder="Explica qué ocurrió, qué equipo o proceso está afectado y cualquier detalle relevante para resolverlo rápido..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium text-slate-800 outline-none focus:ring-2 focus:ring-primary-500 resize-none leading-relaxed"
            />
          </div>

          {/* Submit Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-4.5 px-6 bg-primary-600 hover:bg-primary-700 text-white font-black text-sm uppercase tracking-wider rounded-2xl flex items-center justify-center gap-2 shadow-xl shadow-primary-600/30 transition-all cursor-pointer disabled:opacity-50"
            >
              {submitting ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Send className="w-4 h-4" /> Enviar Reporte de Incidencia
                </>
              )}
            </button>
            <p className="text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-3">
              No requiere cuenta de usuario ni contraseña • Azeroth Kiosk
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
