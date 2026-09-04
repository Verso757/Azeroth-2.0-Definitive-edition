import React, { useEffect, useState, useMemo } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { Issue } from '../types';
import { useAuth } from '../AuthContext';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Download, Table, BarChart2 } from 'lucide-react';
import { cn, formatDate } from '../lib/utils';
import Papa from 'papaparse';

const COLORS = ['#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe', '#10b981', '#34d399', '#f59e0b', '#fbbf24', '#ef4444', '#f87171'];
const MONTHS_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export default function Reports() {
  const { profile } = useAuth();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [selectedYears, setSelectedYears] = useState<number[]>([new Date().getFullYear()]);
  const [selectedMonths, setSelectedMonths] = useState<number[]>([]);
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);

  const [viewMode, setViewMode] = useState<'table' | 'charts'>('table');

  useEffect(() => {
    if (!profile) return;
    
    let qIssues = query(collection(db, 'issues'));
    
    if (profile.role !== 'superadmin') {
      const allGuilds = Array.from(new Set([profile.guildId, ...(profile.allowedGuilds || [])])).filter(Boolean).slice(0, 30);
      if (allGuilds.length > 0) {
        qIssues = query(collection(db, 'issues'), where('guildId', 'in', allGuilds));
      }
    }
    
    const unsubscribeIssues = onSnapshot(qIssues, (snapshot) => {
      const issuesList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Issue[];
      setIssues(issuesList);
      setLoading(false);
    });

    return () => unsubscribeIssues();
  }, [profile]);

  // Extract unique options for filters
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    issues.forEach(i => {
      if (i.createdAt) {
        const d = i.createdAt.toDate ? i.createdAt.toDate() : new Date(i.createdAt);
        years.add(d.getFullYear());
      }
    });
    // Add current year if not present
    years.add(new Date().getFullYear());
    return Array.from(years).sort();
  }, [issues]);

  const uniqueCities = useMemo(() => {
    const map = new Map<string, string>();
    issues.forEach(i => {
      if (i.cityId && i.cityName) map.set(i.cityId, i.cityName);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a,b) => a.name.localeCompare(b.name));
  }, [issues]);

  const uniqueAreas = useMemo(() => {
    const areas = new Set<string>();
    issues.forEach(i => {
      if (i.areaName) areas.add(i.areaName);
    });
    return Array.from(areas).sort();
  }, [issues]);

  // Apply filters
  const filteredData = useMemo(() => {
    return issues.filter(issue => {
      if (!issue.createdAt) return true;
      const date = issue.createdAt.toDate ? issue.createdAt.toDate() : new Date(issue.createdAt);
      
      if (selectedYears.length > 0 && !selectedYears.includes(date.getFullYear())) return false;
      if (selectedMonths.length > 0 && !selectedMonths.includes(date.getMonth())) return false;
      if (selectedCities.length > 0 && !selectedCities.includes(issue.cityId)) return false;
      if (selectedAreas.length > 0 && !selectedAreas.includes(issue.areaName)) return false;

      return true;
    }).sort((a, b) => {
      const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return timeB - timeA;
    });
  }, [issues, selectedYears, selectedMonths, selectedCities, selectedAreas]);

  // Aggregations for charts
  const issuesByStatus = useMemo(() => {
    const counts = { open: 0, in_progress: 0, resolved: 0, closed: 0 };
    filteredData.forEach(i => {
      if (counts[i.status as keyof typeof counts] !== undefined) {
        counts[i.status as keyof typeof counts]++;
      }
    });
    return [
      { name: 'Abierto', value: counts.open },
      { name: 'En Proceso', value: counts.in_progress },
      { name: 'Resuelto', value: counts.resolved },
      { name: 'Cerrado', value: counts.closed },
    ].filter(x => x.value > 0);
  }, [filteredData]);

  const issuesByMonth = useMemo(() => {
    const map = new Map<number, number>();
    filteredData.forEach(i => {
      if (i.createdAt) {
        const d = i.createdAt.toDate ? i.createdAt.toDate() : new Date(i.createdAt);
        const m = d.getMonth();
        map.set(m, (map.get(m) || 0) + 1);
      }
    });
    return Array.from(map.entries()).map(([m, val]) => ({ name: MONTHS_SHORT[m], value: val })).sort((a,b) => MONTHS_SHORT.indexOf(a.name) - MONTHS_SHORT.indexOf(b.name));
  }, [filteredData]);

  const handleToggleFilter = (currentList: any[], value: any, setter: any) => {
    if (currentList.includes(value)) {
      setter(currentList.filter(item => item !== value));
    } else {
      setter([...currentList, value]);
    }
  };

  const exportCSV = () => {
    const dataToExport = filteredData.map(i => ({
      ID: i.id,
      Titulo: i.title,
      Estado: i.status === 'open' ? 'Abierto' : i.status === 'in_progress' ? 'En Proceso' : i.status === 'resolved' ? 'Resuelto' : 'Cerrado',
      Prioridad: i.priority,
      Area: i.areaName,
      Ciudad: i.cityName,
      Usuario: i.userName,
      Fecha: i.createdAt ? formatDate(i.createdAt) : ''
    }));

    const csv = Papa.unparse(dataToExport);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `reporte_incidencias_${new Date().getTime()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Cargando datos...</div>;
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6 min-h-[calc(100vh-8rem)]">
      {/* Sidebar - Key Selections */}
      <div className="w-full lg:w-72 flex-shrink-0 bg-slate-900 rounded-3xl p-6 text-slate-200 flex flex-col gap-8 shadow-xl">
        <h2 className="text-xl font-black text-white tracking-tight uppercase border-b border-slate-700 pb-4">Key Selections</h2>
        
        {/* YEARS */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Año</h3>
          <div className="flex flex-wrap gap-2">
            {availableYears.map(y => (
              <button
                key={y}
                onClick={() => handleToggleFilter(selectedYears, y, setSelectedYears)}
                className={cn(
                  "px-4 py-2 rounded-xl text-sm font-bold transition-all",
                  selectedYears.includes(y) ? "bg-primary-500 text-white shadow-lg shadow-primary-500/20" : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
                )}
              >
                {y}
              </button>
            ))}
          </div>
        </div>

        {/* MONTHS */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Mes</h3>
          <div className="grid grid-cols-4 gap-2">
            {MONTHS_SHORT.map((m, i) => (
              <button
                key={m}
                onClick={() => handleToggleFilter(selectedMonths, i, setSelectedMonths)}
                className={cn(
                  "px-2 py-2 rounded-xl text-xs font-bold transition-all",
                  selectedMonths.includes(i) ? "bg-amber-400 text-slate-900 shadow-lg shadow-amber-400/20" : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
                )}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* CITIES */}
        {uniqueCities.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Ciudad</h3>
            <div className="grid grid-cols-2 gap-2">
              {uniqueCities.map(c => (
                <button
                  key={c.id}
                  onClick={() => handleToggleFilter(selectedCities, c.id, setSelectedCities)}
                  className={cn(
                    "px-3 py-2 rounded-xl text-xs font-bold truncate transition-all",
                    selectedCities.includes(c.id) ? "bg-slate-600 text-white shadow-md" : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
                  )}
                  title={c.name}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* AREAS */}
        {uniqueAreas.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Área / Depto</h3>
            <div className="grid grid-cols-2 gap-2">
              {uniqueAreas.map(a => (
                <button
                  key={a}
                  onClick={() => handleToggleFilter(selectedAreas, a, setSelectedAreas)}
                  className={cn(
                    "px-3 py-2 rounded-xl text-xs font-bold truncate transition-all",
                    selectedAreas.includes(a) ? "bg-slate-600 text-white shadow-md" : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
                  )}
                  title={a}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col gap-6">
        {/* Header Controls */}
        <div className="bg-white rounded-3xl border border-slate-200 p-4 shadow-sm flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-2xl">
            <button
              onClick={() => setViewMode('table')}
              className={cn(
                "flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all",
                viewMode === 'table' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              <Table className="w-4 h-4" />
              Info Bruta
            </button>
            <button
              onClick={() => setViewMode('charts')}
              className={cn(
                "flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all",
                viewMode === 'charts' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              <BarChart2 className="w-4 h-4" />
              Gráficas
            </button>
          </div>
          
          <button
            onClick={exportCSV}
            className="flex items-center gap-2 px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-bold transition-all shadow-md"
          >
            <Download className="w-4 h-4" />
            Exportar CSV
          </button>
        </div>

        {/* Content View */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm flex-1 overflow-hidden flex flex-col">
          {viewMode === 'table' ? (
            <div className="flex-1 overflow-auto p-4">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="text-xs font-bold text-slate-400 uppercase tracking-widest bg-slate-50 sticky top-0 z-10">
                  <tr>
                    <th className="px-6 py-4 rounded-tl-xl">Título</th>
                    <th className="px-6 py-4">Estado</th>
                    <th className="px-6 py-4">Prioridad</th>
                    <th className="px-6 py-4">Área</th>
                    <th className="px-6 py-4">Ciudad</th>
                    <th className="px-6 py-4 rounded-tr-xl">Fecha</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredData.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                        No hay datos para los filtros seleccionados
                      </td>
                    </tr>
                  ) : (
                    filteredData.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 font-semibold text-slate-900">{item.title}</td>
                        <td className="px-6 py-4">
                          <span className={cn(
                            "px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest",
                            item.status === 'open' ? 'bg-amber-100 text-amber-700' :
                            item.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                            'bg-emerald-100 text-emerald-700'
                          )}>
                            {item.status === 'open' ? 'Abierto' : item.status === 'in_progress' ? 'En Proceso' : 'Resuelto'}
                          </span>
                        </td>
                        <td className="px-6 py-4 capitalize">{item.priority}</td>
                        <td className="px-6 py-4">{item.areaName}</td>
                        <td className="px-6 py-4">{item.cityName}</td>
                        <td className="px-6 py-4 text-xs">{item.createdAt ? formatDate(item.createdAt) : ''}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 grid grid-cols-1 lg:grid-cols-2 gap-8 overflow-y-auto">
              <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100">
                <h3 className="text-sm font-bold text-slate-800 mb-6 uppercase tracking-widest">Incidencias por Mes</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={issuesByMonth}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12, fontWeight: 700 }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12, fontWeight: 700 }} />
                      <Tooltip 
                        contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', backgroundColor: '#ffffff', padding: '12px', fontWeight: 'bold' }}
                        cursor={{ fill: 'transparent' }}
                      />
                      <Bar dataKey="value" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100">
                <h3 className="text-sm font-bold text-slate-800 mb-6 uppercase tracking-widest">Estado Global</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={issuesByStatus}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {issuesByStatus.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', backgroundColor: '#ffffff' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
