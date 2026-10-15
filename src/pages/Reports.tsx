import React, { useEffect, useState, useMemo } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { Issue, EquipmentExchange, RouteResponsiva } from '../types';
import { useAuth } from '../AuthContext';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import {
  Download, Table, BarChart2, CalendarDays, Box, AlertCircle, CheckCircle2,
  ChevronDown, ChevronRight, ArrowLeftRight, Smartphone, User, Search,
  Calendar, Filter, Sparkles, MapPin, Tag, Wrench, Layers, FileText,
  TrendingUp, AlertTriangle, ShieldCheck, RefreshCw, X
} from 'lucide-react';
import { cn, formatDate, normalizeEquipmentType, formatBrandModel } from '../lib/utils';
import Papa from 'papaparse';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

const COLORS = ['#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe', '#10b981', '#34d399', '#f59e0b', '#fbbf24', '#ef4444', '#f87171', '#8b5cf6', '#a78bfa', '#ec4899'];
const MONTHS_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

type ReportTab = 'incidencias' | 'entregas' | 'cambios' | '360';
type TimePreset = 'all' | 'this_year' | '30_days' | '90_days' | 'custom' | 'by_month';

function parseDate(val: any): Date | null {
  if (!val) return null;
  if (val.toDate && typeof val.toDate === 'function') return val.toDate();
  if (typeof val.seconds === 'number') return new Date(val.seconds * 1000);
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

export default function Reports() {
  const { profile } = useAuth();
  
  // Data collections
  const [issues, setIssues] = useState<Issue[]>([]);
  const [exchanges, setExchanges] = useState<EquipmentExchange[]>([]);
  const [responsivas, setResponsivas] = useState<RouteResponsiva[]>([]);
  const [loading, setLoading] = useState(true);

  // Active section tab
  const [activeTab, setActiveTab] = useState<ReportTab>('360');

  // Time preset & date filters
  const [timePreset, setTimePreset] = useState<TimePreset>('all');
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');
  const [selectedYears, setSelectedYears] = useState<number[]>([new Date().getFullYear()]);
  const [selectedMonths, setSelectedMonths] = useState<number[]>([]);

  // Category and entity filters
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [selectedEquipmentTypes, setSelectedEquipmentTypes] = useState<string[]>([]);
  const [selectedMotifs, setSelectedMotifs] = useState<string[]>([]);
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [searchPerson, setSearchPerson] = useState<string>('');

  // View modes
  const [viewMode, setViewMode] = useState<'overview' | 'table' | 'charts'>('overview');

  // Collapsible matrix sections (for Incidencias matrix)
  const [expandedSections, setExpandedSections] = useState({
    global: true,
    open: false,
    resolved: false,
    rate: false
  });

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // Subscriptions
  useEffect(() => {
    if (!profile) return;
    
    let qIssues = query(collection(db, 'issues'));
    let qExchanges = query(collection(db, 'equipment_exchanges'));
    let qResponsivas = query(collection(db, 'route_responsivas'));
    
    if (profile.role !== 'superadmin') {
      const allGuilds = Array.from(new Set([profile.guildId, ...(profile.allowedGuilds || [])])).filter(Boolean).slice(0, 30);
      if (allGuilds.length > 0) {
        qIssues = query(collection(db, 'issues'), where('guildId', 'in', allGuilds));
        qExchanges = query(collection(db, 'equipment_exchanges'), where('guildId', 'in', allGuilds));
        qResponsivas = query(collection(db, 'route_responsivas'), where('guildId', 'in', allGuilds));
      }
    }
    
    let pending = 3;
    const checkDone = () => {
      pending--;
      if (pending <= 0) setLoading(false);
    };

    const unsubIssues = onSnapshot(qIssues, (snapshot) => {
      setIssues(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Issue[]);
      checkDone();
    }, () => checkDone());

    const unsubExchanges = onSnapshot(qExchanges, (snapshot) => {
      setExchanges(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as EquipmentExchange[]);
      checkDone();
    }, () => checkDone());

    const unsubResponsivas = onSnapshot(qResponsivas, (snapshot) => {
      setResponsivas(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as RouteResponsiva[]);
      checkDone();
    }, () => checkDone());

    return () => {
      unsubIssues();
      unsubExchanges();
      unsubResponsivas();
    };
  }, [profile]);

  // Date filter evaluator
  const matchesDate = (rawDate: any): boolean => {
    const d = parseDate(rawDate);
    if (!d) return true;

    const now = new Date();
    if (timePreset === 'all') return true;

    if (timePreset === 'this_year') {
      return d.getFullYear() === now.getFullYear();
    }

    if (timePreset === '30_days') {
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return d >= thirtyDaysAgo && d <= now;
    }

    if (timePreset === '90_days') {
      const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      return d >= ninetyDaysAgo && d <= now;
    }

    if (timePreset === 'custom') {
      if (customStart) {
        const start = new Date(customStart + 'T00:00:00');
        if (d < start) return false;
      }
      if (customEnd) {
        const end = new Date(customEnd + 'T23:59:59');
        if (d > end) return false;
      }
      return true;
    }

    if (timePreset === 'by_month') {
      if (selectedYears.length > 0 && !selectedYears.includes(d.getFullYear())) return false;
      if (selectedMonths.length > 0 && !selectedMonths.includes(d.getMonth())) return false;
      return true;
    }

    return true;
  };

  // Distinct filter lists
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    [...issues, ...exchanges, ...responsivas].forEach((item: any) => {
      const d = parseDate(item.createdAt || item.updatedAt);
      if (d) years.add(d.getFullYear());
    });
    years.add(new Date().getFullYear());
    return Array.from(years).sort((a, b) => b - a);
  }, [issues, exchanges, responsivas]);

  const uniqueCities = useMemo(() => {
    const map = new Map<string, string>();
    issues.forEach(i => { if (i.cityId && i.cityName) map.set(i.cityId, i.cityName); });
    exchanges.forEach(e => { if (e.cityId && e.cityName) map.set(e.cityId, e.cityName); });
    responsivas.forEach(r => { if (r.cityId && r.cityName) map.set(r.cityId, r.cityName); });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [issues, exchanges, responsivas]);

  const uniqueEquipmentTypes = useMemo(() => {
    const set = new Set<string>();
    exchanges.forEach(e => {
      const norm = normalizeEquipmentType(e.equipmentType);
      if (norm) set.add(norm);
    });
    responsivas.forEach(r => {
      const norm = normalizeEquipmentType(r.equipmentType);
      if (norm) set.add(norm);
    });
    return Array.from(set).sort();
  }, [exchanges, responsivas]);

  const uniqueMotifs = useMemo(() => {
    const set = new Set<string>();
    exchanges.forEach(e => { if (e.motifName) set.add(e.motifName); });
    return Array.from(set).sort();
  }, [exchanges]);

  const uniqueAreas = useMemo(() => {
    const set = new Set<string>();
    issues.forEach(i => { if (i.areaName) set.add(i.areaName); });
    return Array.from(set).sort();
  }, [issues]);

  // Filtered datasets
  const filteredIssues = useMemo(() => {
    return issues.filter(item => {
      if (!matchesDate(item.createdAt)) return false;
      if (selectedCities.length > 0 && !selectedCities.includes(item.cityId)) return false;
      if (selectedAreas.length > 0 && !selectedAreas.includes(item.areaName)) return false;
      if (searchPerson) {
        const term = searchPerson.toLowerCase();
        const userName = (item.userName || '').toLowerCase();
        const reportedBy = (item.reportedBy || '').toLowerCase();
        const affected = Array.isArray(item.affectedPeople) ? item.affectedPeople.join(' ').toLowerCase() : '';
        if (!userName.includes(term) && !reportedBy.includes(term) && !affected.includes(term)) {
          return false;
        }
      }
      return true;
    }).sort((a, b) => {
      const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return timeB - timeA;
    });
  }, [issues, timePreset, customStart, customEnd, selectedYears, selectedMonths, selectedCities, selectedAreas, searchPerson]);

  const filteredResponsivas = useMemo(() => {
    return responsivas.filter(item => {
      if (!matchesDate(item.updatedAt || item.id)) return false;
      if (selectedCities.length > 0 && !selectedCities.includes(item.cityId)) return false;
      if (selectedEquipmentTypes.length > 0 && !selectedEquipmentTypes.includes(normalizeEquipmentType(item.equipmentType))) return false;
      if (searchPerson) {
        const term = searchPerson.toLowerCase();
        const affected = (item.affectedPerson || '').toLowerCase();
        const userName = (item.userName || '').toLowerCase();
        if (!affected.includes(term) && !userName.includes(term)) return false;
      }
      return true;
    }).sort((a, b) => {
      const timeA = a.updatedAt?.toMillis ? a.updatedAt.toMillis() : 0;
      const timeB = b.updatedAt?.toMillis ? b.updatedAt.toMillis() : 0;
      return timeB - timeA;
    });
  }, [responsivas, timePreset, customStart, customEnd, selectedYears, selectedMonths, selectedCities, selectedEquipmentTypes, searchPerson]);

  const filteredExchanges = useMemo(() => {
    return exchanges.filter(item => {
      if (!matchesDate(item.createdAt)) return false;
      if (selectedCities.length > 0 && !selectedCities.includes(item.cityId)) return false;
      if (selectedEquipmentTypes.length > 0 && !selectedEquipmentTypes.includes(normalizeEquipmentType(item.equipmentType))) return false;
      if (selectedMotifs.length > 0 && !selectedMotifs.includes(item.motifName)) return false;
      if (searchPerson) {
        const term = searchPerson.toLowerCase();
        const affected = (item.affectedPerson || '').toLowerCase();
        const userName = (item.userName || '').toLowerCase();
        if (!affected.includes(term) && !userName.includes(term)) return false;
      }
      return true;
    }).sort((a, b) => {
      const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return timeB - timeA;
    });
  }, [exchanges, timePreset, customStart, customEnd, selectedYears, selectedMonths, selectedCities, selectedEquipmentTypes, selectedMotifs, searchPerson]);

  // Aggregations for Equipos Entregados
  const topRecipients = useMemo(() => {
    const map = new Map<string, { name: string; count: number; types: Set<string>; city: string }>();
    filteredResponsivas.forEach(r => {
      const person = (r.affectedPerson || 'Sin Asignar').trim();
      const existing = map.get(person) || { name: person, count: 0, types: new Set<string>(), city: r.cityName || '' };
      existing.count++;
      const normType = normalizeEquipmentType(r.equipmentType);
      if (normType) existing.types.add(normType);
      if (r.cityName && !existing.city) existing.city = r.cityName;
      map.set(person, existing);
    });
    return Array.from(map.values())
      .map(item => ({ ...item, typesArray: Array.from(item.types) }))
      .sort((a, b) => b.count - a.count);
  }, [filteredResponsivas]);

  const deliveriesByType = useMemo(() => {
    const map = new Map<string, number>();
    filteredResponsivas.forEach(r => {
      const type = normalizeEquipmentType(r.equipmentType);
      map.set(type, (map.get(type) || 0) + 1);
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [filteredResponsivas]);

  const deliveriesByCity = useMemo(() => {
    const map = new Map<string, number>();
    filteredResponsivas.forEach(r => {
      const city = r.cityName || 'Sin Ciudad';
      map.set(city, (map.get(city) || 0) + 1);
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [filteredResponsivas]);

  // Aggregations for Cambios (Exchanges)
  const exchangesByMotif = useMemo(() => {
    const map = new Map<string, number>();
    filteredExchanges.forEach(e => {
      const motif = e.motifName || 'No especificado';
      map.set(motif, (map.get(motif) || 0) + 1);
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [filteredExchanges]);

  const exchangesByType = useMemo(() => {
    const map = new Map<string, number>();
    filteredExchanges.forEach(e => {
      const type = normalizeEquipmentType(e.equipmentType);
      map.set(type, (map.get(type) || 0) + 1);
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [filteredExchanges]);

  const topExchangedPeople = useMemo(() => {
    const map = new Map<string, { name: string; count: number; city: string; lastMotif: string }>();
    filteredExchanges.forEach(e => {
      const person = (e.affectedPerson || 'Sin Especificar').trim();
      const existing = map.get(person) || { name: person, count: 0, city: e.cityName || '', lastMotif: e.motifName || '' };
      existing.count++;
      if (e.motifName) existing.lastMotif = e.motifName;
      if (e.cityName && !existing.city) existing.city = e.cityName;
      map.set(person, existing);
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [filteredExchanges]);

  const exchangesCostTotal = useMemo(() => {
    return filteredExchanges.reduce((sum, e) => sum + (Number(e.price) || 0), 0);
  }, [filteredExchanges]);

  // Aggregations for Incidencias
  const issuesByStatus = useMemo(() => {
    const counts = { open: 0, in_progress: 0, resolved: 0, closed: 0 };
    filteredIssues.forEach(i => {
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
  }, [filteredIssues]);

  const issuesByMonth = useMemo(() => {
    const map = new Map<number, number>();
    filteredIssues.forEach(i => {
      const d = parseDate(i.createdAt);
      if (d) {
        const m = d.getMonth();
        map.set(m, (map.get(m) || 0) + 1);
      }
    });
    return Array.from(map.entries()).map(([m, val]) => ({ name: MONTHS_SHORT[m], value: val })).sort((a, b) => MONTHS_SHORT.indexOf(a.name) - MONTHS_SHORT.indexOf(b.name));
  }, [filteredIssues]);

  // Matrix data for financial-style overview
  const matrixData = useMemo(() => {
    const initBuckets = () => Array(13).fill(0);
    const metrics = {
      total: initBuckets(),
      resolved: initBuckets(),
      open: initBuckets(),
      critical: initBuckets(),
    };
    
    const areasList = Array.from(new Set(filteredIssues.map(i => i.areaName))).filter(Boolean).sort();
    const openByArea: Record<string, number[]> = {};
    const totalByArea: Record<string, number[]> = {};
    const resolvedByArea: Record<string, number[]> = {};
    
    areasList.forEach(a => {
      openByArea[a] = initBuckets();
      totalByArea[a] = initBuckets();
      resolvedByArea[a] = initBuckets();
    });

    filteredIssues.forEach(i => {
      const d = parseDate(i.createdAt);
      if (!d) return;
      const m = d.getMonth();
      
      [m, 12].forEach(idx => {
        metrics.total[idx]++;
        if (i.status === 'resolved' || i.status === 'closed') {
          metrics.resolved[idx]++;
          if (resolvedByArea[i.areaName]) resolvedByArea[i.areaName][idx]++;
        }
        if (i.status === 'open' || i.status === 'in_progress') {
          metrics.open[idx]++;
          if (openByArea[i.areaName]) openByArea[i.areaName][idx]++;
        }
        if (i.priority === 'critical') {
          metrics.critical[idx]++;
        }
        if (totalByArea[i.areaName]) totalByArea[i.areaName][idx]++;
      });
    });

    const getPercent = (num: number, denom: number) => denom > 0 ? ((num / denom) * 100).toFixed(1) + '%' : '-';
    return { metrics, areasList, openByArea, totalByArea, resolvedByArea, getPercent };
  }, [filteredIssues]);

  // Executive 360 Consolidated City Stats
  const citySummary360 = useMemo(() => {
    const map = new Map<string, { city: string; issues: number; deliveries: number; exchanges: number }>();
    uniqueCities.forEach(c => {
      map.set(c.id, { city: c.name, issues: 0, deliveries: 0, exchanges: 0 });
    });

    filteredIssues.forEach(i => {
      if (i.cityId && map.has(i.cityId)) map.get(i.cityId)!.issues++;
    });
    filteredResponsivas.forEach(r => {
      if (r.cityId && map.has(r.cityId)) map.get(r.cityId)!.deliveries++;
    });
    filteredExchanges.forEach(e => {
      if (e.cityId && map.has(e.cityId)) map.get(e.cityId)!.exchanges++;
    });

    return Array.from(map.values())
      .filter(item => item.issues > 0 || item.deliveries > 0 || item.exchanges > 0)
      .sort((a, b) => (b.issues + b.deliveries + b.exchanges) - (a.issues + a.deliveries + a.exchanges));
  }, [uniqueCities, filteredIssues, filteredResponsivas, filteredExchanges]);

  // Export handlers
  const handleExportCSV = () => {
    if (activeTab === 'incidencias') {
      const data = filteredIssues.map(i => ({
        ID: i.id,
        Titulo: i.title,
        Estado: i.status === 'open' ? 'Abierto' : i.status === 'in_progress' ? 'En Proceso' : i.status === 'resolved' ? 'Resuelto' : 'Cerrado',
        Prioridad: i.priority,
        Area: i.areaName,
        Ciudad: i.cityName,
        Usuario: i.userName,
        Fecha: i.createdAt ? formatDate(i.createdAt) : ''
      }));
      downloadCSV(data, `reporte_incidencias_${Date.now()}`);
    } else if (activeTab === 'entregas') {
      const data = filteredResponsivas.map(r => ({
        ID_Ruta: r.routeId || r.id,
        Ruta_Nombre: r.routeName,
        Colaborador_Receptor: r.affectedPerson,
        Tipo_Equipo: normalizeEquipmentType(r.equipmentType),
        Marca_Modelo: r.brandName || '',
        Equipo_Detalle: r.newEquipment || '',
        Ciudad: r.cityName,
        Firma_Digital: r.digitalSignature ? 'Firmado' : 'Pendiente',
        Documento_Escaneado: r.scannedDocument ? 'Adjuntado' : 'Pendiente',
        Registrado_Por: r.userName,
        Ultima_Actualizacion: r.updatedAt ? formatDate(r.updatedAt) : ''
      }));
      downloadCSV(data, `reporte_entregas_equipos_${Date.now()}`);
    } else if (activeTab === 'cambios') {
      const data = filteredExchanges.map(e => ({
        ID: e.id,
        Colaborador_Afectado: e.affectedPerson,
        Tipo_Equipo: normalizeEquipmentType(e.equipmentType),
        Marca_Modelo: e.brandName || '',
        Motivo_Cambio: e.motifName,
        Equipo_Anterior: e.oldEquipment || '',
        Equipo_Nuevo: e.newEquipment || '',
        Costo: e.price ? `$${e.price}` : '$0',
        Ciudad: e.cityName,
        Ruta: e.routeName,
        Registrado_Por: e.userName,
        Fecha: e.createdAt ? formatDate(e.createdAt) : ''
      }));
      downloadCSV(data, `reporte_cambios_equipos_${Date.now()}`);
    } else {
      const data = citySummary360.map(c => ({
        Ciudad: c.city,
        Incidencias_Reportadas: c.issues,
        Equipos_Entregados: c.deliveries,
        Cambios_Realizados: c.exchanges,
        Total_Movimientos: c.issues + c.deliveries + c.exchanges
      }));
      downloadCSV(data, `reporte_vision_360_${Date.now()}`);
    }
  };

  const downloadCSV = (data: any[], filename: string) => {
    if (data.length === 0) return;
    const csv = Papa.unparse(data);
    const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}.csv`;
    link.click();
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    const nowStr = new Date().toLocaleDateString('es-ES');
    
    if (activeTab === 'incidencias') {
      doc.text(`Reporte de Incidencias (BI) - ${nowStr}`, 14, 15);
      const tableColumn = ["Título", "Estado", "Prioridad", "Área", "Ciudad", "Fecha"];
      const tableRows = filteredIssues.slice(0, 300).map(i => [
        i.title,
        i.status === 'open' ? 'Abierto' : i.status === 'in_progress' ? 'En Proceso' : 'Resuelto',
        i.priority,
        i.areaName,
        i.cityName,
        i.createdAt ? formatDate(i.createdAt) : ''
      ]);
      (doc as any).autoTable({
        head: [tableColumn],
        body: tableRows,
        startY: 22,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [15, 23, 42] }
      });
      doc.save(`reporte_incidencias_${Date.now()}.pdf`);
    } else if (activeTab === 'entregas') {
      doc.text(`Reporte de Equipos Entregados (Responsivas) - ${nowStr}`, 14, 15);
      const tableColumn = ["Receptor", "Equipo", "Marca", "Ciudad", "Ruta", "Firma", "Fecha"];
      const tableRows = filteredResponsivas.slice(0, 300).map(r => [
        r.affectedPerson,
        r.equipmentType,
        r.brandName,
        r.cityName,
        r.routeName,
        r.digitalSignature ? 'Firmada' : 'Pendiente',
        r.updatedAt ? formatDate(r.updatedAt) : ''
      ]);
      (doc as any).autoTable({
        head: [tableColumn],
        body: tableRows,
        startY: 22,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [37, 99, 235] }
      });
      doc.save(`reporte_entregas_equipos_${Date.now()}.pdf`);
    } else if (activeTab === 'cambios') {
      doc.text(`Reporte de Cambios de Equipo - ${nowStr}`, 14, 15);
      const tableColumn = ["Colaborador", "Equipo", "Motivo", "Anterior -> Nuevo", "Ciudad", "Fecha"];
      const tableRows = filteredExchanges.slice(0, 300).map(e => [
        e.affectedPerson,
        `${e.equipmentType} (${e.brandName})`,
        e.motifName,
        `${e.oldEquipment || 'S/N'} -> ${e.newEquipment || 'S/N'}`,
        e.cityName,
        e.createdAt ? formatDate(e.createdAt) : ''
      ]);
      (doc as any).autoTable({
        head: [tableColumn],
        body: tableRows,
        startY: 22,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [249, 115, 22] }
      });
      doc.save(`reporte_cambios_equipos_${Date.now()}.pdf`);
    } else {
      doc.text(`Reporte Ejecutivo Visión 360° - ${nowStr}`, 14, 15);
      const tableColumn = ["Ciudad", "Incidencias", "Equipos Entregados", "Cambios", "Total Movimientos"];
      const tableRows = citySummary360.map(c => [
        c.city,
        c.issues.toString(),
        c.deliveries.toString(),
        c.exchanges.toString(),
        (c.issues + c.deliveries + c.exchanges).toString()
      ]);
      (doc as any).autoTable({
        head: [tableColumn],
        body: tableRows,
        startY: 22,
        styles: { fontSize: 9 },
        headStyles: { fillColor: [15, 23, 42] }
      });
      doc.save(`reporte_vision_360_${Date.now()}.pdf`);
    }
  };

  const handleToggleFilter = (currentList: string[], value: string, setter: (val: string[]) => void) => {
    if (currentList.includes(value)) {
      setter(currentList.filter(item => item !== value));
    } else {
      setter([...currentList, value]);
    }
  };

  const handleToggleNumberFilter = (currentList: number[], value: number, setter: (val: number[]) => void) => {
    if (currentList.includes(value)) {
      setter(currentList.filter(item => item !== value));
    } else {
      setter([...currentList, value]);
    }
  };

  const clearAllFilters = () => {
    setTimePreset('all');
    setCustomStart('');
    setCustomEnd('');
    setSelectedYears([new Date().getFullYear()]);
    setSelectedMonths([]);
    setSelectedCities([]);
    setSelectedEquipmentTypes([]);
    setSelectedMotifs([]);
    setSelectedAreas([]);
    setSearchPerson('');
  };

  const hasActiveFilters = timePreset !== 'all' || selectedCities.length > 0 || selectedEquipmentTypes.length > 0 || selectedMotifs.length > 0 || selectedAreas.length > 0 || searchPerson !== '';

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] gap-3">
        <RefreshCw className="w-8 h-8 text-primary-600 animate-spin" />
        <p className="text-sm font-bold text-slate-500">Cargando módulos de Inteligencia de Negocios (BI)...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header Card */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-primary-100 text-primary-700 rounded-xl">
              <BarChart2 className="w-5 h-5" />
            </span>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Centro de Inteligencia & Reportes (BI)</h1>
          </div>
          <p className="text-xs font-semibold text-slate-500 mt-1">
            Análisis consolidado de incidencias de soporte, trazabilidad de equipos entregados, reemplazos y rotación de hardware.
          </p>
        </div>

        {/* Section Navigation Tabs */}
        <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-2xl flex-wrap w-full xl:w-auto">
          <button
            onClick={() => setActiveTab('360')}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all",
              activeTab === '360' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
          >
            <Sparkles className="w-4 h-4 text-amber-500" />
            Visión 360°
          </button>

          <button
            onClick={() => setActiveTab('entregas')}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all",
              activeTab === 'entregas' ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
          >
            <FileText className="w-4 h-4 text-blue-600" />
            Equipos Entregados ({filteredResponsivas.length})
          </button>

          <button
            onClick={() => setActiveTab('cambios')}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all",
              activeTab === 'cambios' ? "bg-white text-orange-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
          >
            <ArrowLeftRight className="w-4 h-4 text-orange-600" />
            Cambios & Reemplazos ({filteredExchanges.length})
          </button>

          <button
            onClick={() => setActiveTab('incidencias')}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all",
              activeTab === 'incidencias' ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
          >
            <AlertCircle className="w-4 h-4 text-indigo-600" />
            Incidencias ({filteredIssues.length})
          </button>
        </div>

        {/* Export Buttons */}
        <div className="flex items-center gap-2 w-full xl:w-auto justify-end">
          <button
            onClick={handleExportCSV}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md active:scale-95"
            title="Exportar datos actuales a CSV/Excel"
          >
            <Download className="w-4 h-4" />
            Excel (CSV)
          </button>
          <button
            onClick={handleExportPDF}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md active:scale-95"
            title="Exportar reporte en formato PDF ejecutivo"
          >
            <Download className="w-4 h-4" />
            PDF Ejecutivo
          </button>
        </div>
      </div>

      {/* Flexible Time & Global Filter Bar */}
      <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          {/* Preset Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5 mr-1">
              <Calendar className="w-4 h-4 text-primary-500" /> Periodo:
            </span>
            <button
              onClick={() => setTimePreset('all')}
              className={cn(
                "px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all border",
                timePreset === 'all'
                  ? "bg-slate-900 text-white border-slate-900 shadow-sm"
                  : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
              )}
            >
              Todo el Histórico
            </button>
            <button
              onClick={() => setTimePreset('this_year')}
              className={cn(
                "px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all border",
                timePreset === 'this_year'
                  ? "bg-slate-900 text-white border-slate-900 shadow-sm"
                  : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
              )}
            >
              Año Actual ({new Date().getFullYear()})
            </button>
            <button
              onClick={() => setTimePreset('90_days')}
              className={cn(
                "px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all border",
                timePreset === '90_days'
                  ? "bg-slate-900 text-white border-slate-900 shadow-sm"
                  : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
              )}
            >
              Últimos 90 Días
            </button>
            <button
              onClick={() => setTimePreset('30_days')}
              className={cn(
                "px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all border",
                timePreset === '30_days'
                  ? "bg-slate-900 text-white border-slate-900 shadow-sm"
                  : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
              )}
            >
              Últimos 30 Días
            </button>
            <button
              onClick={() => setTimePreset('custom')}
              className={cn(
                "px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all border",
                timePreset === 'custom'
                  ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                  : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
              )}
            >
              Rango Personalizado
            </button>
            <button
              onClick={() => setTimePreset('by_month')}
              className={cn(
                "px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all border",
                timePreset === 'by_month'
                  ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                  : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
              )}
            >
              Matriz por Meses
            </button>
          </div>

          {/* Search by Collaborator / Recipient */}
          <div className="flex items-center gap-3 w-full lg:w-auto">
            <div className="relative flex-1 lg:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchPerson}
                onChange={e => setSearchPerson(e.target.value)}
                placeholder="Buscar colaborador..."
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              />
              {searchPerson && (
                <button
                  onClick={() => setSearchPerson('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {hasActiveFilters && (
              <button
                onClick={clearAllFilters}
                className="flex items-center gap-1.5 text-xs font-bold text-red-600 hover:text-red-700 px-3 py-2 bg-red-50 hover:bg-red-100 rounded-xl transition-colors whitespace-nowrap"
              >
                <X className="w-3.5 h-3.5" />
                Limpiar filtros
              </button>
            )}
          </div>
        </div>

        {/* Conditional Custom Date Picker Range */}
        {timePreset === 'custom' && (
          <div className="p-4 bg-blue-50/50 rounded-2xl border border-blue-100 flex flex-wrap items-center gap-4 text-xs font-bold text-slate-700">
            <span>Seleccionar rango:</span>
            <div className="flex items-center gap-2">
              <span className="text-slate-400">Desde:</span>
              <input
                type="date"
                value={customStart}
                onChange={e => setCustomStart(e.target.value)}
                className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-400">Hasta:</span>
              <input
                type="date"
                value={customEnd}
                onChange={e => setCustomEnd(e.target.value)}
                className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none"
              />
            </div>
            {(customStart || customEnd) && (
              <span className="text-[11px] text-blue-600 font-medium">
                Filtrando eventos entre {customStart || 'el inicio'} y {customEnd || 'hoy'}
              </span>
            )}
          </div>
        )}

        {/* Conditional Month/Year Multi-select */}
        {timePreset === 'by_month' && (
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-slate-500 mr-2">Años:</span>
              {availableYears.map(y => (
                <button
                  key={y}
                  onClick={() => handleToggleNumberFilter(selectedYears, y, setSelectedYears)}
                  className={cn(
                    "px-3 py-1 rounded-lg text-xs font-bold border transition-all",
                    selectedYears.includes(y) ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200"
                  )}
                >
                  {y}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-slate-500 mr-2">Meses:</span>
              {MONTHS_SHORT.map((m, i) => (
                <button
                  key={m}
                  onClick={() => handleToggleNumberFilter(selectedMonths, i, setSelectedMonths)}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs font-bold border transition-all",
                    selectedMonths.includes(i) ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200"
                  )}
                >
                  {m}
                </button>
              ))}
              {selectedMonths.length > 0 && (
                <button
                  onClick={() => setSelectedMonths([])}
                  className="text-[10px] font-bold text-red-500 hover:underline ml-2"
                >
                  (Todos los meses)
                </button>
              )}
            </div>
          </div>
        )}

        {/* Entity Filters: Cities, Equipment Types, Motifs */}
        <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-3">
          {/* Cities filter */}
          {uniqueCities.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mr-1">Ciudad:</span>
              {uniqueCities.map(c => (
                <button
                  key={c.id}
                  onClick={() => handleToggleFilter(selectedCities, c.id, setSelectedCities)}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all border",
                    selectedCities.includes(c.id)
                      ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                      : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                  )}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}

          {/* Equipment Types filter (for Entregas and Cambios) */}
          {(activeTab === 'entregas' || activeTab === 'cambios' || activeTab === '360') && uniqueEquipmentTypes.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap ml-0 sm:ml-4 border-l-0 sm:border-l border-slate-200 sm:pl-4">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mr-1">Equipo:</span>
              {uniqueEquipmentTypes.map(t => (
                <button
                  key={t}
                  onClick={() => handleToggleFilter(selectedEquipmentTypes, t, setSelectedEquipmentTypes)}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all border",
                    selectedEquipmentTypes.includes(t)
                      ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                      : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          )}

          {/* Motifs filter (for Cambios) */}
          {activeTab === 'cambios' && uniqueMotifs.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap ml-0 sm:ml-4 border-l-0 sm:border-l border-slate-200 sm:pl-4">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mr-1">Motivo:</span>
              {uniqueMotifs.map(m => (
                <button
                  key={m}
                  onClick={() => handleToggleFilter(selectedMotifs, m, setSelectedMotifs)}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all border",
                    selectedMotifs.includes(m)
                      ? "bg-orange-600 text-white border-orange-600 shadow-sm"
                      : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          )}

          {/* Areas filter (for Incidencias) */}
          {activeTab === 'incidencias' && uniqueAreas.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap ml-0 sm:ml-4 border-l-0 sm:border-l border-slate-200 sm:pl-4">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mr-1">Área:</span>
              {uniqueAreas.map(a => (
                <button
                  key={a}
                  onClick={() => handleToggleFilter(selectedAreas, a, setSelectedAreas)}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all border",
                    selectedAreas.includes(a)
                      ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                      : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                  )}
                >
                  {a}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* =========================================================================
          TAB 1: VISIÓN EJECUTIVA 360° (TODO EL SISTEMA)
         ========================================================================= */}
      {activeTab === '360' && (
        <div className="space-y-6">
          {/* Executive KPI Scorecard */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-gradient-to-br from-blue-900 to-indigo-900 rounded-3xl p-6 text-white shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] font-black tracking-widest uppercase text-blue-200">Equipos Entregados</span>
                <span className="p-2 rounded-xl bg-white/10 text-white"><Smartphone className="w-5 h-5" /></span>
              </div>
              <p className="text-3xl font-black">{filteredResponsivas.length}</p>
              <p className="text-xs text-blue-200/80 mt-1 font-medium">
                {topRecipients.length} colaboradores con responsivas activas
              </p>
            </div>

            <div className="bg-gradient-to-br from-orange-800 to-amber-900 rounded-3xl p-6 text-white shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] font-black tracking-widest uppercase text-orange-200">Cambios & Reemplazos</span>
                <span className="p-2 rounded-xl bg-white/10 text-white"><ArrowLeftRight className="w-5 h-5" /></span>
              </div>
              <p className="text-3xl font-black">{filteredExchanges.length}</p>
              <p className="text-xs text-orange-200/80 mt-1 font-medium">
                {filteredResponsivas.length > 0 ? `${((filteredExchanges.length / filteredResponsivas.length) * 100).toFixed(1)}% tasa de rotación` : 'Sin entregas'}
              </p>
            </div>

            <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl p-6 text-white shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] font-black tracking-widest uppercase text-slate-300">Tickets de Incidencias</span>
                <span className="p-2 rounded-xl bg-white/10 text-white"><AlertCircle className="w-5 h-5" /></span>
              </div>
              <p className="text-3xl font-black">{filteredIssues.length}</p>
              <p className="text-xs text-slate-300/80 mt-1 font-medium">
                {filteredIssues.filter(i => i.status === 'resolved' || i.status === 'closed').length} resueltos con éxito
              </p>
            </div>

            <div className="bg-gradient-to-br from-emerald-900 to-teal-900 rounded-3xl p-6 text-white shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] font-black tracking-widest uppercase text-emerald-200">Inversión en Cambios</span>
                <span className="p-2 rounded-xl bg-white/10 text-white"><TrendingUp className="w-5 h-5" /></span>
              </div>
              <p className="text-3xl font-black">${exchangesCostTotal.toLocaleString('es-MX')}</p>
              <p className="text-xs text-emerald-200/80 mt-1 font-medium">
                Costo acumulado de hardware reemplazado
              </p>
            </div>
          </div>

          {/* Quick Insights Banner */}
          <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-950 rounded-3xl p-6 text-white shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-xs font-bold text-amber-300 uppercase tracking-widest">
                <Sparkles className="w-3.5 h-3.5" /> Diagnóstico Ejecutivo de Hardware & Soporte
              </div>
              <h2 className="text-lg font-black tracking-tight">
                {exchangesByMotif[0] ? `Motivo principal de cambio: "${exchangesByMotif[0].name}" (${exchangesByMotif[0].value} casos)` : 'Sin cambios registrados en el periodo'}
              </h2>
              <p className="text-xs text-slate-300">
                {topRecipients[0] ? `Colaborador con más equipos asignados: ${topRecipients[0].name} (${topRecipients[0].count} equipos)` : 'Todo el equipo en orden'}
                {deliveriesByType[0] ? ` • Equipo más distribuido: ${deliveriesByType[0].name}` : ''}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setActiveTab('entregas')}
                className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs uppercase tracking-wider transition-all"
              >
                Ver Entregas
              </button>
              <button
                onClick={() => setActiveTab('cambios')}
                className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold text-xs uppercase tracking-wider transition-all"
              >
                Ver Cambios
              </button>
            </div>
          </div>

          {/* City 360 Breakdown Table */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-black text-slate-900 tracking-tight uppercase">Matriz de Actividad por Ciudad</h3>
                <p className="text-xs text-slate-500">Comparativa de carga de incidencias, asignación de equipos y tasa de recambios</p>
              </div>
              <span className="text-xs font-bold text-slate-400">{citySummary360.length} Ciudades Activas</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-5 py-3 font-bold text-slate-600 uppercase tracking-wider">Ciudad / Sucursal</th>
                    <th className="px-5 py-3 font-bold text-slate-600 uppercase tracking-wider text-right">Equipos Entregados</th>
                    <th className="px-5 py-3 font-bold text-slate-600 uppercase tracking-wider text-right">Cambios de Equipo</th>
                    <th className="px-5 py-3 font-bold text-slate-600 uppercase tracking-wider text-right">Incidencias Soporte</th>
                    <th className="px-5 py-3 font-bold text-slate-600 uppercase tracking-wider text-right">Tasa de Rotación</th>
                    <th className="px-5 py-3 font-bold text-slate-600 uppercase tracking-wider text-right">Total Eventos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {citySummary360.map((c, idx) => {
                    const rotacion = c.deliveries > 0 ? ((c.exchanges / c.deliveries) * 100).toFixed(1) + '%' : '-';
                    return (
                      <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-5 py-3.5 font-bold text-slate-800 flex items-center gap-2">
                          <MapPin className="w-3.5 h-3.5 text-primary-500" />
                          {c.city}
                        </td>
                        <td className="px-5 py-3.5 text-right font-bold text-blue-600 tabular-nums">{c.deliveries}</td>
                        <td className="px-5 py-3.5 text-right font-bold text-orange-600 tabular-nums">{c.exchanges}</td>
                        <td className="px-5 py-3.5 text-right font-bold text-slate-700 tabular-nums">{c.issues}</td>
                        <td className="px-5 py-3.5 text-right text-slate-500 tabular-nums">{rotacion}</td>
                        <td className="px-5 py-3.5 text-right font-black text-slate-900 tabular-nums bg-slate-50/50">
                          {c.deliveries + c.exchanges + c.issues}
                        </td>
                      </tr>
                    );
                  })}
                  {citySummary360.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-slate-400">
                        No hay movimientos registrados para el filtro seleccionado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 2: EQUIPOS ENTREGADOS (RESPONSIVAS & DESTINATARIOS)
         ========================================================================= */}
      {activeTab === 'entregas' && (
        <div className="space-y-6">
          {/* Top KPI Cards for Entregas */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
              <span className="text-[10px] font-black tracking-widest text-slate-400 uppercase">Equipos Entregados</span>
              <p className="text-3xl font-black text-blue-600 mt-2">{filteredResponsivas.length}</p>
              <p className="text-xs text-slate-500 mt-1">Registros de responsivas totales</p>
            </div>

            <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
              <span className="text-[10px] font-black tracking-widest text-slate-400 uppercase">Colaboradores con Equipo</span>
              <p className="text-3xl font-black text-slate-900 mt-2">{topRecipients.length}</p>
              <p className="text-xs text-slate-500 mt-1">Personas con hardware asignado</p>
            </div>

            <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
              <span className="text-[10px] font-black tracking-widest text-slate-400 uppercase">Firma Digitalizada</span>
              <p className="text-3xl font-black text-emerald-600 mt-2">
                {filteredResponsivas.filter(r => r.digitalSignature).length}
                <span className="text-sm font-semibold text-slate-400 ml-1">
                  ({filteredResponsivas.length > 0 ? ((filteredResponsivas.filter(r => r.digitalSignature).length / filteredResponsivas.length) * 100).toFixed(0) : 0}%)
                </span>
              </p>
              <p className="text-xs text-slate-500 mt-1">Responsivas firmadas digitalmente</p>
            </div>

            <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
              <span className="text-[10px] font-black tracking-widest text-slate-400 uppercase">Equipo más entregado</span>
              <p className="text-xl font-black text-indigo-700 mt-2 truncate">
                {deliveriesByType[0] ? deliveriesByType[0].name : 'N/A'}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {deliveriesByType[0] ? `${deliveriesByType[0].value} unidades entregadas` : 'Sin datos'}
              </p>
            </div>
          </div>

          {/* Gráficos & Top Destinatarios */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* "¿A QUIÉN ENTREGAMOS MÁS?" - RANKING DE COLABORADORES */}
            <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm lg:col-span-1 flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-black text-slate-900 tracking-tight uppercase flex items-center gap-2">
                    <User className="w-4 h-4 text-blue-600" />
                    ¿A quién entregamos más?
                  </h3>
                  <p className="text-xs text-slate-500">Top colaboradores con más equipos</p>
                </div>
                <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg">
                  {topRecipients.length} personas
                </span>
              </div>

              <div className="space-y-3 overflow-y-auto max-h-[380px] pr-1">
                {topRecipients.slice(0, 10).map((person, index) => {
                  const maxCount = topRecipients[0]?.count || 1;
                  const percentage = Math.round((person.count / maxCount) * 100);
                  return (
                    <div key={index} className="p-3 bg-slate-50 hover:bg-slate-100/80 rounded-2xl transition-all border border-slate-100">
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="font-bold text-slate-800 flex items-center gap-2">
                          <span className={cn(
                            "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black",
                            index === 0 ? "bg-amber-400 text-slate-900" :
                            index === 1 ? "bg-slate-300 text-slate-800" :
                            index === 2 ? "bg-amber-700 text-white" :
                            "bg-slate-200 text-slate-600"
                          )}>
                            {index + 1}
                          </span>
                          <span className="truncate max-w-[150px]">{person.name}</span>
                        </span>
                        <span className="font-black text-blue-600">{person.count} {person.count === 1 ? 'equipo' : 'equipos'}</span>
                      </div>

                      <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-blue-600 h-full rounded-full transition-all duration-500"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1.5">
                        <span className="truncate">{person.city || 'Ciudad sin asignar'}</span>
                        <span className="truncate text-slate-500">{person.typesArray.join(', ')}</span>
                      </div>
                    </div>
                  );
                })}

                {topRecipients.length === 0 && (
                  <p className="text-center py-12 text-xs text-slate-400">No se encontraron entregas en el filtro seleccionado.</p>
                )}
              </div>
            </div>

            {/* TIPOS DE EQUIPO ENTREGADOS */}
            <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm lg:col-span-1 flex flex-col">
              <h3 className="text-sm font-black text-slate-900 tracking-tight uppercase mb-1">
                Tipos de Equipo Entregados
              </h3>
              <p className="text-xs text-slate-500 mb-4">Proporción por categoría de hardware</p>

              <div className="h-64 flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={deliveriesByType}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {deliveriesByType.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', backgroundColor: '#ffffff', fontWeight: 'bold' }} />
                    <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* ENTREGAS POR CIUDAD */}
            <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm lg:col-span-1 flex flex-col">
              <h3 className="text-sm font-black text-slate-900 tracking-tight uppercase mb-1">
                Entregas por Ciudad
              </h3>
              <p className="text-xs text-slate-500 mb-4">Concentración geográfica de hardware</p>

              <div className="h-64 flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={deliveriesByCity} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                    <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11, fontWeight: 700 }} />
                    <YAxis dataKey="name" type="category" width={80} axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11, fontWeight: 700 }} />
                    <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', backgroundColor: '#ffffff', fontWeight: 'bold' }} />
                    <Bar dataKey="value" fill="#2563eb" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* TABLA DETALLADA DE ENTREGAS */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-black text-slate-900 tracking-tight uppercase">Listado Detallado de Responsivas</h3>
                <p className="text-xs text-slate-500">Historial de entrega y firmas digitales de colaboradores</p>
              </div>
              <span className="text-xs font-bold text-slate-500">{filteredResponsivas.length} Registros</span>
            </div>

            <div className="overflow-x-auto max-h-[420px]">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200">
                  <tr>
                    <th className="px-5 py-3 font-bold text-slate-600 uppercase tracking-wider">Colaborador Receptor</th>
                    <th className="px-5 py-3 font-bold text-slate-600 uppercase tracking-wider">Equipo & Marca</th>
                    <th className="px-5 py-3 font-bold text-slate-600 uppercase tracking-wider">Ciudad</th>
                    <th className="px-5 py-3 font-bold text-slate-600 uppercase tracking-wider">Ruta / Depto</th>
                    <th className="px-5 py-3 font-bold text-slate-600 uppercase tracking-wider">Firma Digital</th>
                    <th className="px-5 py-3 font-bold text-slate-600 uppercase tracking-wider">Registrado Por</th>
                    <th className="px-5 py-3 font-bold text-slate-600 uppercase tracking-wider text-right">Fecha</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {filteredResponsivas.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3.5 font-bold text-slate-900">{r.affectedPerson}</td>
                      <td className="px-5 py-3.5">
                        <span className="font-bold text-blue-600">{normalizeEquipmentType(r.equipmentType)}</span>
                        {r.brandName && <span className="text-slate-400 ml-1.5">({r.brandName})</span>}
                      </td>
                      <td className="px-5 py-3.5 text-slate-600">{r.cityName}</td>
                      <td className="px-5 py-3.5 text-slate-600">{r.routeName}</td>
                      <td className="px-5 py-3.5">
                        {r.digitalSignature ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                            <CheckCircle2 className="w-3 h-3 text-emerald-500" /> Firmado
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md">
                            Pendiente
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-slate-500">{r.userName}</td>
                      <td className="px-5 py-3.5 text-right text-slate-400 tabular-nums">
                        {r.updatedAt ? formatDate(r.updatedAt) : '-'}
                      </td>
                    </tr>
                  ))}
                  {filteredResponsivas.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center py-10 text-slate-400 font-medium">
                        No se encontraron entregas de equipo bajo estos filtros.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 3: CAMBIOS & REEMPLAZOS (EXCHANGES)
         ========================================================================= */}
      {activeTab === 'cambios' && (
        <div className="space-y-6">
          {/* Top KPI Cards for Cambios */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
              <span className="text-[10px] font-black tracking-widest text-slate-400 uppercase">Cambios Realizados</span>
              <p className="text-3xl font-black text-orange-600 mt-2">{filteredExchanges.length}</p>
              <p className="text-xs text-slate-500 mt-1">Reemplazos de hardware</p>
            </div>

            <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
              <span className="text-[10px] font-black tracking-widest text-slate-400 uppercase">Motivo Principal</span>
              <p className="text-xl font-black text-slate-900 mt-2 truncate">
                {exchangesByMotif[0] ? exchangesByMotif[0].name : 'N/A'}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {exchangesByMotif[0] ? `${exchangesByMotif[0].value} recambios (${((exchangesByMotif[0].value / (filteredExchanges.length || 1)) * 100).toFixed(0)}%)` : 'Sin datos'}
              </p>
            </div>

            <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
              <span className="text-[10px] font-black tracking-widest text-slate-400 uppercase">Equipo con más cambios</span>
              <p className="text-xl font-black text-indigo-700 mt-2 truncate">
                {exchangesByType[0] ? exchangesByType[0].name : 'N/A'}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {exchangesByType[0] ? `${exchangesByType[0].value} unidades cambiadas` : 'Sin datos'}
              </p>
            </div>

            <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
              <span className="text-[10px] font-black tracking-widest text-slate-400 uppercase">Costo Acumulado</span>
              <p className="text-3xl font-black text-emerald-600 mt-2">${exchangesCostTotal.toLocaleString('es-MX')}</p>
              <p className="text-xs text-slate-500 mt-1">Gasto total en recambios</p>
            </div>
          </div>

          {/* Gráficos de Motivos & Reemplazos */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* MOTIVOS DE CAMBIO */}
            <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm lg:col-span-1 flex flex-col">
              <h3 className="text-sm font-black text-slate-900 tracking-tight uppercase mb-1">
                ¿Por qué cambiamos equipos?
              </h3>
              <p className="text-xs text-slate-500 mb-4">Motivos más recurrentes de reemplazo</p>

              <div className="h-64 flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={exchangesByMotif} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                    <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11, fontWeight: 700 }} />
                    <YAxis dataKey="name" type="category" width={90} axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11, fontWeight: 700 }} />
                    <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', backgroundColor: '#ffffff', fontWeight: 'bold' }} />
                    <Bar dataKey="value" fill="#ea580c" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* TIPOS DE EQUIPO CON MÁS CAMBIOS */}
            <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm lg:col-span-1 flex flex-col">
              <h3 className="text-sm font-black text-slate-900 tracking-tight uppercase mb-1">
                Equipos con más Cambios
              </h3>
              <p className="text-xs text-slate-500 mb-4">Categorías de hardware con mayor falla o recambio</p>

              <div className="h-64 flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={exchangesByType}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {exchangesByType.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[(index + 3) % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', backgroundColor: '#ffffff', fontWeight: 'bold' }} />
                    <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* COLABORADORES CON MÁS CAMBIOS */}
            <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm lg:col-span-1 flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-black text-slate-900 tracking-tight uppercase flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-orange-500" />
                    Colaboradores Frecuentes
                  </h3>
                  <p className="text-xs text-slate-500">Personas con múltiples cambios</p>
                </div>
                <span className="text-xs font-bold text-orange-700 bg-orange-50 px-2.5 py-1 rounded-lg">
                  {topExchangedPeople.length} personas
                </span>
              </div>

              <div className="space-y-3 overflow-y-auto max-h-[250px] pr-1">
                {topExchangedPeople.slice(0, 5).map((p, index) => (
                  <div key={index} className="p-3 bg-orange-50/50 rounded-2xl border border-orange-100 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-slate-900">{p.name}</p>
                      <p className="text-[10px] text-slate-500">{p.city} • Último motivo: {p.lastMotif}</p>
                    </div>
                    <span className="text-xs font-black text-orange-600 bg-white px-2.5 py-1 rounded-xl shadow-xs border border-orange-200">
                      {p.count} {p.count === 1 ? 'cambio' : 'cambios'}
                    </span>
                  </div>
                ))}
                {topExchangedPeople.length === 0 && (
                  <p className="text-center py-10 text-xs text-slate-400">Sin cambios registrados.</p>
                )}
              </div>
            </div>
          </div>

          {/* TABLA DETALLADA DE CAMBIOS */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-black text-slate-900 tracking-tight uppercase">Historial de Cambios de Equipo</h3>
                <p className="text-xs text-slate-500">Trazabilidad de equipo anterior a equipo nuevo con motivo y costo</p>
              </div>
              <span className="text-xs font-bold text-slate-500">{filteredExchanges.length} Registros</span>
            </div>

            <div className="overflow-x-auto max-h-[420px]">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200">
                  <tr>
                    <th className="px-5 py-3 font-bold text-slate-600 uppercase tracking-wider">Colaborador</th>
                    <th className="px-5 py-3 font-bold text-slate-600 uppercase tracking-wider">Equipo & Marca</th>
                    <th className="px-5 py-3 font-bold text-slate-600 uppercase tracking-wider">Motivo de Cambio</th>
                    <th className="px-5 py-3 font-bold text-slate-600 uppercase tracking-wider">Transición (Anterior → Nuevo)</th>
                    <th className="px-5 py-3 font-bold text-slate-600 uppercase tracking-wider">Ciudad / Ruta</th>
                    <th className="px-5 py-3 font-bold text-slate-600 uppercase tracking-wider">Costo</th>
                    <th className="px-5 py-3 font-bold text-slate-600 uppercase tracking-wider text-right">Fecha</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {filteredExchanges.map((e) => (
                    <tr key={e.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3.5 font-bold text-slate-900">{e.affectedPerson}</td>
                      <td className="px-5 py-3.5">
                        <span className="font-bold text-slate-800">{normalizeEquipmentType(e.equipmentType)}</span>
                        {e.brandName && <span className="text-slate-400 ml-1">({e.brandName})</span>}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="px-2 py-0.5 rounded-md bg-orange-100 text-orange-800 text-[10px] font-bold">
                          {e.motifName}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-slate-500 font-mono text-[11px]">
                        <span className="line-through text-red-500/80 mr-1">{e.oldEquipment || 'S/N'}</span>
                        <span className="text-slate-400">→</span>
                        <span className="text-emerald-600 font-bold ml-1">{e.newEquipment || 'S/N'}</span>
                      </td>
                      <td className="px-5 py-3.5 text-slate-600">{e.cityName} / {e.routeName}</td>
                      <td className="px-5 py-3.5 font-bold text-slate-700">
                        {e.price ? `$${e.price}` : '$0'}
                      </td>
                      <td className="px-5 py-3.5 text-right text-slate-400 tabular-nums">
                        {e.createdAt ? formatDate(e.createdAt) : '-'}
                      </td>
                    </tr>
                  ))}
                  {filteredExchanges.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center py-10 text-slate-400 font-medium">
                        No se encontraron cambios de equipo bajo estos filtros.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 4: INCIDENCIAS & SOPORTE TÉCNICO (CONSERVANDO MATRIZ FINANCIERA YTD)
         ========================================================================= */}
      {activeTab === 'incidencias' && (
        <div className="space-y-6">
          {/* Sub-bar for viewMode (Resumen, Tabla, Gráficas) */}
          <div className="flex items-center justify-between bg-white rounded-3xl border border-slate-200 p-4 shadow-sm">
            <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-2xl">
              <button
                onClick={() => setViewMode('overview')}
                className={cn(
                  "flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold transition-all",
                  viewMode === 'overview' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
              >
                <CalendarDays className="w-4 h-4" />
                Matriz Mensual (YTD)
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={cn(
                  "flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold transition-all",
                  viewMode === 'table' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
              >
                <Table className="w-4 h-4" />
                Info Detallada
              </button>
              <button
                onClick={() => setViewMode('charts')}
                className={cn(
                  "flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold transition-all",
                  viewMode === 'charts' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
              >
                <BarChart2 className="w-4 h-4" />
                Gráficas
              </button>
            </div>

            <span className="text-xs font-bold text-slate-500">
              Total: {filteredIssues.length} Incidencias
            </span>
          </div>

          {/* Matriz Mensual YTD */}
          {viewMode === 'overview' && (
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden p-4">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs whitespace-nowrap min-w-max border-collapse font-sans">
                  <thead className="bg-[#1e293b] text-white sticky top-0 z-10 shadow-sm">
                    <tr>
                      <th className="px-4 py-3 font-semibold border-r border-[#334155] w-64 bg-[#1e293b]">Métrica / Área</th>
                      {MONTHS_SHORT.map((m) => (
                        <th key={m} className="px-4 py-3 font-semibold text-right min-w-[70px] bg-[#1e293b]">{m}</th>
                      ))}
                      <th className="px-4 py-3 font-bold text-right border-l border-[#334155] min-w-[90px] bg-[#1e293b]">Total (YTD)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100/50">
                    {/* SECCIÓN GLOBAL */}
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
                          <td className="px-4 py-2 font-medium text-slate-600 pl-10 border-r border-slate-100">Tickets Abiertos</td>
                          {matrixData.metrics.open.map((val, i) => (
                            <td key={i} className={cn("px-4 py-2 text-right tabular-nums", i === 12 ? "font-bold text-slate-800 bg-slate-50 border-l border-slate-100" : i % 2 !== 0 ? "bg-slate-50/50 text-slate-500" : "text-slate-500")}>{val || '-'}</td>
                          ))}
                        </tr>
                        <tr className="hover:bg-slate-50 border-b-2 border-slate-200">
                          <td className="px-4 py-2 font-medium text-slate-600 pl-10 border-r border-slate-100">Tasa de Resolución (%)</td>
                          {matrixData.metrics.total.map((val, i) => (
                            <td key={i} className={cn("px-4 py-2 text-right tabular-nums font-semibold", i === 12 ? "text-emerald-700 bg-slate-50 border-l border-slate-100" : "text-slate-500")}>
                              {matrixData.getPercent(matrixData.metrics.resolved[i], val)}
                            </td>
                          ))}
                        </tr>
                      </>
                    )}

                    {/* SECCIÓN POR ÁREA */}
                    <tr 
                      className="bg-slate-100 cursor-pointer hover:bg-slate-200/80 transition-colors"
                      onClick={() => toggleSection('rate')}
                    >
                      <td className="px-4 py-3 font-bold text-slate-800 uppercase tracking-widest text-[10px] flex items-center gap-2 border-r border-slate-200">
                        {expandedSections.rate ? <ChevronDown className="w-4 h-4 text-slate-500"/> : <ChevronRight className="w-4 h-4 text-slate-500"/>}
                        Desglose por Área / División ({matrixData.areasList.length})
                      </td>
                      {matrixData.metrics.total.map((_, i) => (
                        <td key={i} className="px-4 py-2 border-b border-slate-200" />
                      ))}
                    </tr>

                    {expandedSections.rate && matrixData.areasList.map(area => (
                      <tr key={area} className="hover:bg-slate-50">
                        <td className="px-4 py-2 font-medium text-slate-600 pl-10 border-r border-slate-100">{area}</td>
                        {matrixData.totalByArea[area]?.map((val, i) => (
                          <td key={i} className={cn("px-4 py-2 text-right tabular-nums", i === 12 ? "font-bold text-slate-800 bg-slate-50 border-l border-slate-100" : "text-slate-500")}>
                            {val || '-'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Table view */}
          {viewMode === 'table' && (
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-4 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200">
                  <tr>
                    <th className="px-5 py-3 font-bold text-slate-600 uppercase tracking-wider">Título</th>
                    <th className="px-5 py-3 font-bold text-slate-600 uppercase tracking-wider">Estado</th>
                    <th className="px-5 py-3 font-bold text-slate-600 uppercase tracking-wider">Prioridad</th>
                    <th className="px-5 py-3 font-bold text-slate-600 uppercase tracking-wider">Área</th>
                    <th className="px-5 py-3 font-bold text-slate-600 uppercase tracking-wider">Ciudad</th>
                    <th className="px-5 py-3 font-bold text-slate-600 uppercase tracking-wider text-right">Fecha</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {filteredIssues.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3.5 font-bold text-slate-900">{item.title}</td>
                      <td className="px-5 py-3.5">
                        <span className={cn(
                          "px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest",
                          item.status === 'open' ? 'bg-amber-100 text-amber-700' :
                          item.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                          'bg-emerald-100 text-emerald-700'
                        )}>
                          {item.status === 'open' ? 'Abierto' : item.status === 'in_progress' ? 'En Proceso' : 'Resuelto'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 capitalize">{item.priority}</td>
                      <td className="px-5 py-3.5 text-slate-600">{item.areaName}</td>
                      <td className="px-5 py-3.5 text-slate-600">{item.cityName}</td>
                      <td className="px-5 py-3.5 text-right text-slate-400 tabular-nums">
                        {item.createdAt ? formatDate(item.createdAt) : '-'}
                      </td>
                    </tr>
                  ))}
                  {filteredIssues.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-10 text-slate-400 font-medium">
                        No hay incidencias para los filtros seleccionados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Charts view */}
          {viewMode === 'charts' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
                <h3 className="text-sm font-bold text-slate-800 mb-6 uppercase tracking-widest">Incidencias por Mes</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={issuesByMonth}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12, fontWeight: 700 }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12, fontWeight: 700 }} />
                      <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', backgroundColor: '#ffffff', padding: '12px', fontWeight: 'bold' }} />
                      <Bar dataKey="value" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
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
                      <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', backgroundColor: '#ffffff' }} />
                      <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
