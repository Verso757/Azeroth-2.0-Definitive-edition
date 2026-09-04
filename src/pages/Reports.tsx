import React, { useEffect, useState, useMemo } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { Issue } from '../types';
import { useAuth } from '../AuthContext';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Download, Table, BarChart2, CalendarDays, Box, AlertCircle, CheckCircle2, ChevronDown, ChevronRight } from 'lucide-react';
import { cn, formatDate } from '../lib/utils';
import Papa from 'papaparse';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

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

  const [viewMode, setViewMode] = useState<'overview' | 'table' | 'charts'>('overview');

  const [expandedSections, setExpandedSections] = useState({
    global: true,
    open: false,
    resolved: false,
    rate: false
  });

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

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

  // Matrix data for financial-style overview
  const matrixData = useMemo(() => {
    // 0-11 for months, 12 for Total (YTD)
    const initBuckets = () => Array(13).fill(0);
    
    const metrics = {
      total: initBuckets(),
      resolved: initBuckets(),
      open: initBuckets(),
      critical: initBuckets(),
    };
    
    const areasList = Array.from(new Set(filteredData.map(i => i.areaName))).sort();
    
    const openByArea: Record<string, number[]> = {};
    const totalByArea: Record<string, number[]> = {};
    const resolvedByArea: Record<string, number[]> = {};
    
    areasList.forEach(a => {
      openByArea[a] = initBuckets();
      totalByArea[a] = initBuckets();
      resolvedByArea[a] = initBuckets();
    });

    filteredData.forEach(i => {
      if (!i.createdAt) return;
      const d = i.createdAt.toDate ? i.createdAt.toDate() : new Date(i.createdAt);
      const m = d.getMonth();
      
      [m, 12].forEach(idx => {
        metrics.total[idx]++;
        if (i.status === 'resolved' || i.status === 'closed') {
           metrics.resolved[idx]++;
           resolvedByArea[i.areaName][idx]++;
        }
        if (i.status === 'open' || i.status === 'in_progress') {
           metrics.open[idx]++;
           openByArea[i.areaName][idx]++;
        }
        if (i.priority === 'critical') {
           metrics.critical[idx]++;
        }
        totalByArea[i.areaName][idx]++;
      });
    });

    const getPercent = (num: number, denom: number) => denom > 0 ? ((num / denom) * 100).toFixed(1) + '%' : '-';
    
    return { metrics, areasList, openByArea, totalByArea, resolvedByArea, getPercent };
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

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.text("Reporte de Incidencias (BI)", 14, 15);
    
    const tableColumn = ["Título", "Estado", "Prioridad", "Área", "Ciudad", "Fecha"];
    const tableRows = filteredData.map(i => [
      i.title,
      i.status === 'open' ? 'Abierto' : i.status === 'in_progress' ? 'En Proceso' : i.status === 'resolved' ? 'Resuelto' : 'Cerrado',
      i.priority,
      i.areaName,
      i.cityName,
      i.createdAt ? formatDate(i.createdAt) : ''
    ]);

    (doc as any).autoTable({
      head: [tableColumn],
      body: tableRows,
      startY: 20,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [15, 23, 42] }
    });

    doc.save(`reporte_incidencias_${new Date().getTime()}.pdf`);
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Cargando datos...</div>;
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-8rem)]">
      {/* Sidebar - Filtros de Reporte */}
      <div className="w-full lg:w-[320px] flex-shrink-0 bg-white rounded-3xl border border-slate-200 p-6 flex flex-col gap-8 shadow-sm overflow-y-auto">
        <div>
          <h2 className="text-sm font-black text-slate-900 tracking-tight uppercase">Filtros de Reporte</h2>
          <p className="text-xs text-slate-500 mt-1">Refina la información de la matriz</p>
        </div>
        
        {/* YEARS */}
        <div className="space-y-3">
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">Año</h3>
          <div className="flex flex-wrap gap-2">
            {availableYears.map(y => (
              <button
                key={y}
                onClick={() => handleToggleFilter(selectedYears, y, setSelectedYears)}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-bold transition-all border",
                  selectedYears.includes(y) ? "bg-slate-900 text-white border-slate-900 shadow-md" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                )}
              >
                {y}
              </button>
            ))}
          </div>
        </div>

        {/* MONTHS */}
        <div className="space-y-3">
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">Mes</h3>
          <div className="grid grid-cols-3 gap-2">
            {MONTHS_SHORT.map((m, i) => (
              <button
                key={m}
                onClick={() => handleToggleFilter(selectedMonths, i, setSelectedMonths)}
                className={cn(
                  "px-3 py-2 rounded-lg text-xs font-bold transition-all border",
                  selectedMonths.includes(i) ? "bg-slate-900 text-white border-slate-900 shadow-md" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
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
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">Ciudad</h3>
            <div className="flex flex-wrap gap-2">
              {uniqueCities.map(c => (
                <button
                  key={c.id}
                  onClick={() => handleToggleFilter(selectedCities, c.id, setSelectedCities)}
                  className={cn(
                    "px-3 py-2 rounded-lg text-xs font-bold transition-all border",
                    selectedCities.includes(c.id) ? "bg-slate-900 text-white border-slate-900 shadow-md" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
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
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">Área / Depto</h3>
            <div className="flex flex-wrap gap-2">
              {uniqueAreas.map(a => (
                <button
                  key={a}
                  onClick={() => handleToggleFilter(selectedAreas, a, setSelectedAreas)}
                  className={cn(
                    "px-3 py-2 rounded-lg text-xs font-bold transition-all border",
                    selectedAreas.includes(a) ? "bg-slate-900 text-white border-slate-900 shadow-md" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
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
              onClick={() => setViewMode('overview')}
              className={cn(
                "flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all",
                viewMode === 'overview' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              <CalendarDays className="w-4 h-4" />
              Resumen
            </button>
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
          
          <div className="flex items-center gap-2">
            <button
              onClick={exportCSV}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold transition-all shadow-md"
            >
              <Download className="w-4 h-4" />
              Excel (CSV)
            </button>
            <button
              onClick={exportPDF}
              className="flex items-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-bold transition-all shadow-md"
            >
              <Download className="w-4 h-4" />
              PDF
            </button>
          </div>
        </div>

        {/* Content View */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm flex-1 overflow-hidden flex flex-col">
          {viewMode === 'overview' ? (
            <div className="flex-1 overflow-auto bg-white p-4 rounded-3xl">
              <table className="w-full text-left text-xs whitespace-nowrap min-w-max border-collapse font-sans">
                <thead className="bg-[#1e293b] text-white sticky top-0 z-10 shadow-sm">
                  <tr>
                    <th className="px-4 py-3 font-semibold border-r border-[#334155] w-64 bg-[#1e293b]">Métrica</th>
                    {MONTHS_SHORT.map((m) => (
                      <th key={m} className="px-4 py-3 font-semibold text-right min-w-[80px] bg-[#1e293b]">{m}</th>
                    ))}
                    <th className="px-4 py-3 font-bold text-right border-l border-[#334155] min-w-[100px] bg-[#1e293b]">YTD</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100/50">
                  {/* SECCION 1: GLOBAL */}
                  <tr 
                    className="bg-slate-100 cursor-pointer hover:bg-slate-200/80 transition-colors"
                    onClick={() => toggleSection('global')}
                  >
                    <td className="px-4 py-3 font-bold text-slate-800 uppercase tracking-widest text-[10px] flex items-center gap-2 border-r border-slate-200">
                      {expandedSections.global ? <ChevronDown className="w-4 h-4 text-slate-500"/> : <ChevronRight className="w-4 h-4 text-slate-500"/>}
                      Indicadores Globales
                    </td>
                    {matrixData.metrics.total.map((val, i) => (
                      <td key={i} className={cn("px-4 py-2 text-right tabular-nums text-[11px] font-bold text-slate-500 border-b border-slate-200", i === 12 && "text-slate-800 bg-slate-100 border-l border-slate-200")}>
                        {!expandedSections.global && val > 0 ? val : ''}
                      </td>
                    ))}
                  </tr>
                  
                  {expandedSections.global && (
                    <>
                      <tr className="hover:bg-slate-50">
                        <td className="px-4 py-2 font-medium text-slate-600 pl-10 border-r border-slate-100">Tickets Totales</td>
                        {matrixData.metrics.total.map((val, i) => (
                          <td key={i} className={cn("px-4 py-2 text-right tabular-nums", i === 12 ? "font-bold text-slate-800 bg-slate-50 border-l border-slate-100" : i % 2 !== 0 ? "bg-slate-50/50 text-slate-500" : "text-slate-500")}>{val || '-'}</td>
                        ))}
                      </tr>
                      <tr className="hover:bg-slate-50">
                        <td className="px-4 py-2 font-medium text-slate-600 pl-10 border-r border-slate-100">Tickets Resueltos</td>
                        {matrixData.metrics.resolved.map((val, i) => (
                          <td key={i} className={cn("px-4 py-2 text-right tabular-nums", i === 12 ? "font-bold text-slate-800 bg-slate-50 border-l border-slate-100" : i % 2 !== 0 ? "bg-slate-50/50 text-slate-500" : "text-slate-500")}>{val || '-'}</td>
                        ))}
                      </tr>
                      <tr className="hover:bg-slate-50">
                        <td className="px-4 py-2 font-medium text-slate-600 pl-10 border-r border-slate-100">Tickets Abiertos (Rezagos)</td>
                        {matrixData.metrics.open.map((val, i) => (
                          <td key={i} className={cn("px-4 py-2 text-right tabular-nums", i === 12 ? "font-bold text-slate-800 bg-slate-50 border-l border-slate-100" : i % 2 !== 0 ? "bg-slate-50/50 text-slate-500" : "text-slate-500")}>{val || '-'}</td>
                        ))}
                      </tr>
                      <tr className="hover:bg-slate-50 border-b-2 border-slate-200">
                        <td className="px-4 py-2 font-medium text-slate-600 pl-10 border-r border-slate-100">Tasa de Resolución (%)</td>
                        {Array(13).fill(0).map((_, i) => {
                          const percent = matrixData.getPercent(matrixData.metrics.resolved[i], matrixData.metrics.total[i]);
                          const isGood = matrixData.metrics.total[i] > 0 && (matrixData.metrics.resolved[i] / matrixData.metrics.total[i]) >= 0.8;
                          const isBad = matrixData.metrics.total[i] > 0 && (matrixData.metrics.resolved[i] / matrixData.metrics.total[i]) < 0.5;
                          const colorClass = isGood ? "text-emerald-600" : isBad ? "text-red-500" : "text-slate-400";
                          const bgClass = i === 12 ? "bg-slate-50 border-l border-slate-100" : i % 2 !== 0 ? "bg-slate-50/50" : "";
                          return (
                            <td key={i} className={cn("px-4 py-2 text-right tabular-nums", i === 12 && "font-bold", bgClass, colorClass)}>
                              {percent}
                            </td>
                          );
                        })}
                      </tr>
                    </>
                  )}

                  {/* SECCION 2: REZAGOS POR AREA */}
                  <tr 
                    className="bg-slate-100 cursor-pointer hover:bg-slate-200/80 transition-colors border-t border-slate-200"
                    onClick={() => toggleSection('open')}
                  >
                    <td className="px-4 py-3 font-bold text-slate-800 uppercase tracking-widest text-[10px] flex items-center gap-2 border-r border-slate-200">
                      {expandedSections.open ? <ChevronDown className="w-4 h-4 text-slate-500"/> : <ChevronRight className="w-4 h-4 text-slate-500"/>}
                      Tickets Abiertos (Rezagos)
                    </td>
                    {matrixData.metrics.open.map((val, i) => (
                      <td key={i} className={cn("px-4 py-2 text-right tabular-nums text-[11px] font-bold text-slate-600 border-b border-slate-200", i === 12 && "text-slate-800 bg-slate-100 border-l border-slate-200")}>
                        {!expandedSections.open && val > 0 ? val : ''}
                      </td>
                    ))}
                  </tr>
                  {expandedSections.open && matrixData.areasList.map((area, idx) => (
                    <tr key={`open-${area}`} className={cn("hover:bg-slate-50", idx === matrixData.areasList.length - 1 && "border-b-2 border-slate-200")}>
                      <td className="px-4 py-2 font-medium text-slate-600 pl-10 border-r border-slate-100">{area}</td>
                      {matrixData.openByArea[area].map((val, i) => (
                        <td key={i} className={cn("px-4 py-2 text-right tabular-nums", i === 12 ? "font-bold text-slate-800 bg-slate-50 border-l border-slate-100" : i % 2 !== 0 ? "bg-slate-50/50 text-slate-500" : "text-slate-500")}>{val || '-'}</td>
                      ))}
                    </tr>
                  ))}

                  {/* SECCION 3: TICKETS RESUELTOS POR AREA */}
                  <tr 
                    className="bg-slate-100 cursor-pointer hover:bg-slate-200/80 transition-colors border-t border-slate-200"
                    onClick={() => toggleSection('resolved')}
                  >
                    <td className="px-4 py-3 font-bold text-slate-800 uppercase tracking-widest text-[10px] flex items-center gap-2 border-r border-slate-200">
                      {expandedSections.resolved ? <ChevronDown className="w-4 h-4 text-slate-500"/> : <ChevronRight className="w-4 h-4 text-slate-500"/>}
                      Tickets Resueltos por Área
                    </td>
                    {matrixData.metrics.resolved.map((val, i) => (
                      <td key={i} className={cn("px-4 py-2 text-right tabular-nums text-[11px] font-bold text-slate-600 border-b border-slate-200", i === 12 && "text-slate-800 bg-slate-100 border-l border-slate-200")}>
                        {!expandedSections.resolved && val > 0 ? val : ''}
                      </td>
                    ))}
                  </tr>
                  {expandedSections.resolved && matrixData.areasList.map((area, idx) => (
                    <tr key={`resolved-${area}`} className={cn("hover:bg-slate-50", idx === matrixData.areasList.length - 1 && "border-b-2 border-slate-200")}>
                      <td className="px-4 py-2 font-medium text-slate-600 pl-10 border-r border-slate-100">{area}</td>
                      {matrixData.resolvedByArea[area].map((val, i) => (
                        <td key={i} className={cn("px-4 py-2 text-right tabular-nums", i === 12 ? "font-bold text-slate-800 bg-slate-50 border-l border-slate-100" : i % 2 !== 0 ? "bg-slate-50/50 text-slate-500" : "text-slate-500")}>{val || '-'}</td>
                      ))}
                    </tr>
                  ))}

                  {/* SECCION 4: TASA DE RESOLUCION POR AREA */}
                  <tr 
                    className="bg-slate-100 cursor-pointer hover:bg-slate-200/80 transition-colors border-t border-slate-200"
                    onClick={() => toggleSection('rate')}
                  >
                    <td className="px-4 py-3 font-bold text-slate-800 uppercase tracking-widest text-[10px] flex items-center gap-2 border-r border-slate-200">
                      {expandedSections.rate ? <ChevronDown className="w-4 h-4 text-slate-500"/> : <ChevronRight className="w-4 h-4 text-slate-500"/>}
                      Tasa de Resolución por Área (%)
                    </td>
                    {Array(13).fill(0).map((_, i) => {
                      const percent = matrixData.getPercent(matrixData.metrics.resolved[i], matrixData.metrics.total[i]);
                      const isGood = matrixData.metrics.total[i] > 0 && (matrixData.metrics.resolved[i] / matrixData.metrics.total[i]) >= 0.8;
                      const isBad = matrixData.metrics.total[i] > 0 && (matrixData.metrics.resolved[i] / matrixData.metrics.total[i]) < 0.5;
                      const colorClass = isGood ? "text-emerald-700" : isBad ? "text-red-600" : "text-slate-600";
                      return (
                        <td key={i} className={cn("px-4 py-2 text-right tabular-nums text-[11px] font-bold border-b border-slate-200", i === 12 && "bg-slate-100 border-l border-slate-200", !expandedSections.rate && colorClass)}>
                          {!expandedSections.rate ? percent : ''}
                        </td>
                      );
                    })}
                  </tr>
                  {expandedSections.rate && matrixData.areasList.map(area => (
                    <tr key={`rate-${area}`} className="hover:bg-slate-50">
                      <td className="px-4 py-2 font-medium text-slate-600 pl-10 border-r border-slate-100">{area}</td>
                      {Array(13).fill(0).map((_, i) => {
                        const res = matrixData.resolvedByArea[area][i];
                        const tot = matrixData.totalByArea[area][i];
                        const percent = matrixData.getPercent(res, tot);
                        const isGood = tot > 0 && (res / tot) >= 0.8;
                        const isBad = tot > 0 && (res / tot) < 0.5;
                        const colorClass = isGood ? "text-emerald-600" : isBad ? "text-red-500" : "text-slate-400";
                        const bgClass = i === 12 ? "bg-slate-50 border-l border-slate-100" : i % 2 !== 0 ? "bg-slate-50/50" : "";
                        return (
                          <td key={i} className={cn("px-4 py-2 text-right tabular-nums", i === 12 && "font-bold", bgClass, colorClass)}>
                            {percent}
                          </td>
                        );
                      })}
                    </tr>
                  ))}

                </tbody>
              </table>
            </div>
          ) : viewMode === 'table' ? (
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
