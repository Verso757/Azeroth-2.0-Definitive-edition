import React, { useEffect, useState } from 'react';
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc, serverTimestamp, addDoc, getDocs, arrayUnion } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../AuthContext';
import { Issue, IssueEvent, IssueStatus, OperationType } from '../types';
import { handleFirestoreError } from '../constants';
import { Filter, Search, Clock, CheckCircle2, AlertTriangle, MoreHorizontal, XCircle, MessageSquare, UserPlus, ArrowRight, Tag, ChevronRight, X, Download, PlusSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, formatDate, exportToCSV } from '../lib/utils';

const STATUS_LABELS = {
  open: { label: 'Abierto', color: 'text-primary-700 bg-primary-50 border-primary-200', icon: Clock },
  in_progress: { label: 'En Proceso', color: 'text-amber-700 bg-amber-50 border-amber-200', icon: AlertTriangle },
  resolved: { label: 'Resuelto', color: 'text-emerald-700 bg-emerald-50 border-emerald-200', icon: CheckCircle2 },
  closed: { label: 'Cerrado', color: 'text-slate-600 bg-slate-100 border-slate-200', icon: XCircle },
};

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export default function Issues() {
  const { profile, isAdmin } = useAuth();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'mine' | 'assigned'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [month, setMonth] = useState(new Date().getMonth());
  const [year, setYear] = useState(new Date().getFullYear());
  const [week, setWeek] = useState('all');
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);

  const [guildFilt, setGuildFilt] = useState('all');
  const [cityFilt, setCityFilt] = useState('all');
  const [statusFilt, setStatusFilt] = useState<'active' | 'all'>('active');

  useEffect(() => {
    if (!profile) return;

    let q = query(collection(db, 'issues'));
    
    if (profile.role !== 'superadmin') {
      const allGuilds = Array.from(new Set([profile.guildId, ...(profile.allowedGuilds || [])])).filter(Boolean).slice(0, 30);
      if (allGuilds.length === 0) return;
      q = query(collection(db, 'issues'), where('guildId', 'in', allGuilds));
      if (filter === 'mine') {
        q = query(collection(db, 'issues'), where('guildId', 'in', allGuilds), where('userId', '==', profile.uid));
      } else if (filter === 'assigned') {
        q = query(collection(db, 'issues'), where('guildId', 'in', allGuilds), where('assignedTo', '==', profile.uid));
      }
    } else {
      // Superadmin filtering
      if (filter === 'mine') {
        q = query(collection(db, 'issues'), where('userId', '==', profile.uid));
      } else if (filter === 'assigned') {
        q = query(collection(db, 'issues'), where('assignedTo', '==', profile.uid));
      }
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const issuesList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Issue[];
      
      // Sort client-side to avoid manual Composite Index creation
      issuesList.sort((a, b) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        return timeB - timeA;
      });
      
      setIssues(issuesList);
      setLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'issues');
    });

    return () => unsubscribe();
  }, [profile, isAdmin, filter]);

  const guildsList = Array.from(new Set(issues.map(i => i.guildId).filter(Boolean)));
  const citiesList = Array.from(new Set(issues.filter(i => guildFilt === 'all' || i.guildId === guildFilt).map(i => ({ id: i.cityId, name: i.cityName })).filter(i => i.id)));
  // Make citiesList unique by id
  const uniqueCities = Array.from(new Map(citiesList.map((item: any) => [item.id, item])).values()) as {id: string | null, name: string | null}[];

  const filteredIssues = issues.filter(issue => {
    const matchesSearch = issue.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          issue.areaName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          issue.userName.toLowerCase().includes(searchTerm.toLowerCase());
    
    if (!matchesSearch) return false;

    if (guildFilt !== 'all' && issue.guildId !== guildFilt) return false;
    if (cityFilt !== 'all' && issue.cityId !== cityFilt) return false;

    if (!issue.createdAt) return true;
    const date = issue.createdAt.toDate ? issue.createdAt.toDate() : new Date(issue.createdAt);
    
    if (date.getMonth() !== month || date.getFullYear() !== year) return false;
    
    if (week !== 'all') {
      const day = date.getDate();
      const issueWeek = Math.min(5, Math.ceil(day / 7)).toString();
      if (issueWeek !== week) return false;
    }

    if (statusFilt === 'active' && (issue.status === 'resolved' || issue.status === 'closed')) return false;

    return true;
  }).sort((a, b) => {
    const aReincident = (a.reportsCount || 1) > 1 ? 1 : 0;
    const bReincident = (b.reportsCount || 1) > 1 ? 1 : 0;
    if (aReincident !== bReincident) {
      return bReincident - aReincident; 
    }
    const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
    const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
    return timeB - timeA;
  });

  const [isExporting, setIsExporting] = useState(false);

  const handleExportCSV = async () => {
    setIsExporting(true);
    try {
      const rows = [];
      let idCounter = 1;
      
      for (const issue of filteredIssues) {
        const originalId = idCounter;
        rows.push({
          'ID': originalId,
          'Hora': formatDate(issue.createdAt),
          'Quien Reporto': issue.userName,
          'Persona Afectada': Array.isArray(issue.affectedPeople) ? issue.affectedPeople.join(', ') : (issue.reportedBy || ''),
          'Area Problema': issue.areaName || issue.areaId || '',
          'Detalle': `${issue.title} - ${issue.description}`.replace(/\n/g, ' '),
          'Tipo': 'Original',
          'Estado': issue.status
        });
        idCounter++;

        if ((issue.reportsCount || 1) > 1) {
          const eventsSnapshot = await getDocs(query(collection(db, 'issues', issue.id, 'events'), orderBy('createdAt', 'asc')));
          const events = eventsSnapshot.docs.map(d => d.data());
          events.forEach(evt => {
            if (evt.type === 'comment' && evt.content.includes('Reincidencia reportada por')) {
              let affectedPerson = '';
              const match = evt.content.match(/\(Afectado: (.*?)\)/);
              if (match) affectedPerson = match[1];

              let detailText = `↳ Reincidencia`;
              if (evt.note) {
                 detailText += ` - Nota/Variante: ${evt.note}`;
              }

              rows.push({
                'ID': '',
                'Hora': formatDate(evt.createdAt),
                'Quien Reporto': evt.userName,
                'Persona Afectada': affectedPerson,
                'Area Problema': issue.areaName || issue.areaId || '',
                'Detalle': detailText.replace(/\n/g, ' '),
                'Tipo': 'Reincidencia',
                'Estado': issue.status
              });
            }
          });
        }
      }
      exportToCSV(rows, `Incidencias_${new Date().toLocaleDateString('es-ES').replace(/\//g, '-')}`);
    } catch (e) {
      console.error(e);
      alert('Error exportando CSV');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPDF = async () => {
    setIsExporting(true);
    try {
      const rowsHTML: string[] = [];
      let idCounter = 1;
      
      for (const issue of filteredIssues) {
        const originalId = idCounter;
        
        const isCritical = issue.priority === 'critical';
        const isHigh = issue.priority === 'high';
        
        const affectedText = Array.isArray(issue.affectedPeople) ? issue.affectedPeople.join(', ') : (issue.reportedBy || 'N/A');

        rowsHTML.push(`
          <tr class="${isCritical ? 'bg-red-50/50' : isHigh ? 'bg-orange-50/30' : 'bg-white'} border-b border-slate-100">
            <td class="px-3 py-3 text-[11px] font-bold text-slate-900 align-top">${originalId}</td>
            <td class="px-3 py-3 text-[10px] text-slate-500 align-top leading-relaxed">${formatDate(issue.createdAt).replace(', ', '<br/>')}</td>
            <td class="px-3 py-3 text-[11px] align-top">
               <div class="font-bold text-slate-900">${issue.userName}</div>
               <div class="text-[9px] text-slate-500 mt-1">Afectado: ${affectedText}</div>
            </td>
            <td class="px-3 py-3 text-[10px] font-bold text-slate-600 uppercase tracking-wider align-top">${issue.areaName || issue.areaId || ''}</td>
            <td class="px-3 py-3 text-[11px] text-slate-800 align-top leading-relaxed">
               <div class="font-black mb-1 text-slate-900 uppercase tracking-tight">${issue.title}</div>
               <div class="text-slate-600 font-medium">${issue.description}</div>
            </td>
            <td class="px-3 py-3 text-[10px] font-medium text-slate-500 capitalize align-top">
              <span class="inline-flex px-1.5 py-0.5 rounded-md border border-slate-200 bg-slate-50 tracking-wide">${STATUS_LABELS[issue.status as IssueStatus]?.label || issue.status}</span>
            </td>
          </tr>
        `);
        idCounter++;

        if ((issue.reportsCount || 1) > 1) {
          const eventsSnapshot = await getDocs(query(collection(db, 'issues', issue.id, 'events'), orderBy('createdAt', 'asc')));
          const events = eventsSnapshot.docs.map(d => d.data());
          events.forEach(evt => {
            if (evt.type === 'comment' && evt.content.includes('Reincidencia reportada por')) {
              let affectedPerson = '';
              const match = evt.content.match(/\(Afectado: (.*?)\)/);
              if (match) affectedPerson = match[1];

              let noteHtml = '';
              if (evt.note) {
                 noteHtml = `<div class="mt-2 pl-3 border-l-2 border-slate-200 text-slate-600 font-medium not-italic"><span class="font-black text-slate-700 text-[9px] uppercase tracking-widest mr-1">Nota:</span> ${evt.note}</div>`;
              }

              rowsHTML.push(`
                <tr class="bg-slate-50/40 border-b border-slate-100 italic">
                  <td class="px-3 py-3 text-[11px] font-bold text-slate-900 align-top"></td>
                  <td class="px-3 py-3 text-[10px] text-slate-500 align-top leading-relaxed pl-6">
                     <span class="text-primary-400 font-black mr-1">↳</span> ${formatDate(evt.createdAt).replace(', ', '<br/>')}
                  </td>
                  <td class="px-3 py-3 text-[11px] align-top">
                     <div class="font-bold text-slate-800">${evt.userName}</div>
                     <div class="text-[9px] text-slate-500 mt-1">Afectado: ${affectedPerson || 'N/A'}</div>
                  </td>
                  <td class="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider align-top">${issue.areaName || issue.areaId || ''}</td>
                  <td class="px-3 py-3 text-[11px] align-top leading-relaxed">
                     <div class="text-primary-700 font-black uppercase tracking-tight mb-1">Reincidencia</div>
                     ${noteHtml}
                  </td>
                  <td class="px-3 py-3 text-[10px] font-medium text-slate-500 capitalize align-top">
                    <span class="inline-flex px-1.5 py-0.5 rounded-md border border-slate-200 bg-slate-50 tracking-wide">${STATUS_LABELS[issue.status as IssueStatus]?.label || issue.status}</span>
                  </td>
                </tr>
              `);
            }
          });
        }
      }
      
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
         alert("Por favor habilita las ventanas emergentes (pop-ups) para generar el PDF.");
         return;
      }
      
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Reporte de Incidencias Operativas</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <style>
              @media print {
                @page { margin: 15mm; size: portrait; }
                body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                table { page-break-inside: auto; width: 100%; table-layout: fixed; }
                tr { page-break-inside: avoid; page-break-after: auto; }
                td, th { word-wrap: break-word; overflow-wrap: break-word; }
                thead { display: table-header-group; }
              }
            </style>
          </head>
          <body class="p-4 md:p-8 text-slate-800 font-sans bg-white pb-20">
            <div class="mb-8 border-b-2 border-slate-100 pb-6 flex justify-between items-start">
              <div class="flex items-center gap-6">
                <img src="/Logo.png" alt="Yaqui Logo" class="h-14 w-auto object-contain" onerror="this.outerHTML='<div class=\\'h-14 flex items-center justify-center\\'><span class=\\'text-3xl font-black text-[#004B87] tracking-tighter\\'>YAQUi</span></div>'" />
                <div>
                  <h1 class="text-xl font-black text-[#004B87] uppercase tracking-tighter">Reporte de Incidencias</h1>
                  <p class="text-slate-500 font-medium text-xs mt-1">Generado el: <span class="text-slate-800">${new Date().toLocaleString('es-ES')}</span></p>
                </div>
              </div>
            </div>
            
            <div class="rounded-xl overflow-hidden border border-slate-200">
              <table class="w-full text-left border-collapse table-fixed">
                <thead>
                  <tr class="bg-slate-900 text-white">
                    <th class="px-3 py-3 w-[6%] text-[9px] font-black uppercase tracking-widest text-slate-300">ID</th>
                    <th class="px-3 py-3 w-[12%] text-[9px] font-black uppercase tracking-widest text-slate-300">Fecha</th>
                    <th class="px-3 py-3 w-[18%] text-[9px] font-black uppercase tracking-widest text-slate-300">Personal</th>
                    <th class="px-3 py-3 w-[16%] text-[9px] font-black uppercase tracking-widest text-slate-300">Área</th>
                    <th class="px-3 py-3 w-[37%] text-[9px] font-black uppercase tracking-widest text-slate-300">Detalle</th>
                    <th class="px-3 py-3 w-[11%] text-[9px] font-black uppercase tracking-widest text-slate-300">Estado</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 bg-white">
                  ${rowsHTML.join('')}
                </tbody>
              </table>
            </div>
            
            <div class="mt-8 pt-4 border-t border-slate-100 text-center text-[9px] font-bold text-slate-400 uppercase tracking-widest">
              Documento autogenerado por el Sistema de Control Operativo
            </div>

            <script>
              setTimeout(() => {
                window.print();
                setTimeout(() => { window.close(); }, 500);
              }, 750);
            </script>
          </body>
        </html>
      `;

      printWindow.document.write(html);
      printWindow.document.close();
      
    } catch (e) {
      console.error(e);
      alert('Error exportando PDF');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight">Registro de Incidencias</h1>
          <p className="text-slate-500 font-medium">Historial y seguimiento de problemas de la operación.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-white rounded-2xl border border-slate-200 p-2 shadow-sm gap-2">
             <div className="flex items-center gap-2 px-2">
               <Clock className="w-4 h-4 text-slate-400" />
               <select 
                 value={month} 
                 onChange={e => setMonth(Number(e.target.value))}
                 className="text-xs font-bold text-slate-600 outline-none bg-transparent p-1 cursor-pointer"
               >
                 {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
               </select>
             </div>
             <span className="text-slate-300">|</span>
             <select 
                 value={year} 
                 onChange={e => setYear(Number(e.target.value))}
                 className="text-xs font-bold text-slate-600 outline-none bg-transparent p-1 cursor-pointer"
               >
                 <option value={new Date().getFullYear()}>{new Date().getFullYear()}</option>
                 <option value={new Date().getFullYear() - 1}>{new Date().getFullYear() - 1}</option>
             </select>
             <span className="text-slate-300">|</span>
             <select 
                 value={week} 
                 onChange={e => setWeek(e.target.value)}
                 className="text-xs font-bold text-blue-600 outline-none bg-transparent p-1 cursor-pointer"
               >
                 <option value="all">Todas las semanas</option>
                 <option value="1">Semana 1</option>
                 <option value="2">Semana 2</option>
                 <option value="3">Semana 3</option>
                 <option value="4">Semana 4</option>
                 <option value="5">Semana 5</option>
             </select>
          </div>

          <div className="flex bg-white rounded-2xl border border-slate-200 p-1 shadow-sm gap-1">
            <button 
              onClick={handleExportCSV}
              disabled={isExporting}
              className="flex items-center gap-2 px-3 py-1.5 text-slate-600 rounded-xl hover:bg-slate-50 transition-all font-black uppercase text-[10px] tracking-widest disabled:opacity-50"
            >
              <Download className="w-3 h-3" />
              CSV
            </button>
            <button 
              onClick={handleExportPDF}
              disabled={isExporting}
              className="flex items-center gap-2 px-3 py-1.5 text-blue-600 rounded-xl hover:bg-blue-50 transition-all font-black uppercase text-[10px] tracking-widest disabled:opacity-50"
            >
              <Download className="w-3 h-3" />
              PDF
            </button>
          </div>
          
          <div className="flex bg-white rounded-2xl border border-slate-200 p-1 shadow-sm">
            <button onClick={() => setFilter('all')} className={cn("px-4 py-2 text-xs font-bold rounded-xl transition-all uppercase tracking-widest", filter === 'all' ? "bg-primary-600 text-white shadow-sm" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900")}>Todas</button>
            <button onClick={() => setFilter('mine')} className={cn("px-4 py-2 text-xs font-bold rounded-xl transition-all uppercase tracking-widest", filter === 'mine' ? "bg-primary-600 text-white shadow-sm" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900")}>Mis Reportes</button>
            <button onClick={() => setFilter('assigned')} className={cn("px-4 py-2 text-xs font-bold rounded-xl transition-all uppercase tracking-widest", filter === 'assigned' ? "bg-primary-600 text-white shadow-sm" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900")}>Asignadas</button>
          </div>

          {(profile?.role === 'superadmin' || (profile?.allowedGuilds && profile.allowedGuilds.length > 0)) && (
            <div className="flex bg-white rounded-2xl border border-slate-200 p-1 shadow-sm">
              <select 
                  value={guildFilt} 
                  onChange={e => { setGuildFilt(e.target.value); setCityFilt('all'); }}
                  className="text-xs font-bold text-slate-600 outline-none bg-transparent px-2 py-1 cursor-pointer"
                >
                  <option value="all">Empresa: Todas</option>
                  {guildsList.map(g => <option key={String(g)} value={String(g)}>{g}</option>)}
              </select>
            </div>
          )}

          <div className="flex bg-white rounded-2xl border border-slate-200 p-1 shadow-sm">
            <select 
                value={cityFilt} 
                onChange={e => setCityFilt(e.target.value)}
                className="text-xs font-bold text-slate-600 outline-none bg-transparent px-2 py-1 cursor-pointer w-auto"
              >
                <option value="all">Ciudad: Todas</option>
                {uniqueCities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div className="flex bg-white rounded-2xl border border-slate-200 p-1 shadow-sm">
            <select 
                value={statusFilt} 
                onChange={e => setStatusFilt(e.target.value as 'active' | 'all')}
                className="text-xs font-bold text-slate-600 outline-none bg-transparent px-2 py-1 cursor-pointer w-auto"
              >
                <option value="active">Estado: Activos</option>
                <option value="all">Estado: Todos</option>
            </select>
          </div>
          
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar reporte..."
              className="pl-12 pr-4 py-2.5 bg-white border border-slate-200 rounded-2xl focus:ring-2 focus:ring-primary-500 text-slate-900 outline-none w-full md:w-64 transition-all shadow-sm font-medium placeholder:text-slate-400"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-32 bg-white rounded-3xl border border-slate-100 animate-pulse" />
          ))
        ) : filteredIssues.length > 0 ? (
          filteredIssues.map((issue) => (
            <IssueCard key={issue.id} issue={issue} onClick={() => setSelectedIssue(issue)} />
          ))
        ) : (
          <div className="bg-slate-50 rounded-3xl border border-dashed border-slate-200 p-20 text-center">
            <Filter className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-slate-900">Sin resultados</h3>
            <p className="text-slate-500">No hay incidencias que coincidan con tu búsqueda.</p>
          </div>
        )}
      </div>

      <AnimatePresence>
        {selectedIssue && (
          <IssueDetailModal 
            issue={selectedIssue} 
            onClose={() => setSelectedIssue(null)} 
          />
        )}
      </AnimatePresence>
    </div>
  );
}

const IssueCard: React.FC<{ issue: Issue; onClick: () => void }> = ({ issue, onClick }) => {
  const status = STATUS_LABELS[issue.status] || STATUS_LABELS.open;
  const StatusIcon = status.icon;
  const [expanded, setExpanded] = useState(false);
  const [reincidencias, setReincidencias] = useState<any[]>([]);
  const [loadingRein, setLoadingRein] = useState(false);

  const fetchReincidencias = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (expanded) {
      setExpanded(false);
      return;
    }
    setLoadingRein(true);
    try {
      const snap = await getDocs(query(collection(db, 'issues', issue.id, 'events'), orderBy('createdAt', 'asc')));
      const evts = snap.docs.map(d => d.data());
      const filtered = evts.filter(evt => evt.type === 'comment' && evt.content.includes('Reincidencia reportada por'));
      setReincidencias(filtered);
    } catch(err) {
      console.error(err);
    } finally {
      setLoadingRein(false);
    }
    setExpanded(true);
  };

  return (
    <div className="space-y-2">
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ y: -2 }}
        onClick={onClick}
        className="group bg-white rounded-2xl border border-slate-100 p-4 flex flex-col md:flex-row gap-4 hover:border-primary-200 hover:shadow-lg hover:shadow-primary-900/5 transition-all cursor-pointer relative overflow-hidden z-10"
      >
        <div className={cn("absolute left-0 top-0 bottom-0 w-1.5", 
          issue.priority === 'critical' ? 'bg-red-500' :
          issue.priority === 'high' ? 'bg-orange-500' :
          issue.priority === 'medium' ? 'bg-amber-400' : 'bg-slate-300'
        )} />

        <div className="flex-1 space-y-2">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{issue.areaName}</span>
                <div className={cn(
                  "flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border",
                  status.color
                )}>
                  <StatusIcon className="w-3 h-3" />
                  {status.label}
                </div>
              </div>
              <h3 className="text-base font-black text-slate-900 group-hover:text-primary-600 transition-colors uppercase leading-tight">{issue.title}</h3>
            </div>
            <div className="text-right">
               <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter block">{formatDate(issue.createdAt)}</span>
            </div>
          </div>

          <p className="text-slate-500 text-sm font-medium line-clamp-1 italic">
            "{issue.description}"
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <div className="flex items-center gap-2 px-2.5 py-1 bg-slate-50 rounded-lg border border-slate-100">
               <div className="w-5 h-5 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center text-[10px] font-black">{issue.userName?.charAt(0) || 'U'}</div>
               <span className="text-xs font-bold text-slate-600 truncate max-w-[120px]">{issue.userName}</span>
            </div>
            {Array.isArray(issue.affectedPeople) && issue.affectedPeople.length > 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 rounded-xl border border-blue-100">
                 <span className="text-xs font-bold text-blue-700 truncate max-w-[120px]">Afectados: {issue.affectedPeople.join(', ')}</span>
              </div>
            )}
            {issue.assignedToName && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 rounded-xl border border-emerald-100">
                 <UserPlus className="w-3.5 h-3.5 text-emerald-600" />
                 <span className="text-xs font-bold text-emerald-700 truncate max-w-[120px]">Asignado: {issue.assignedToName}</span>
              </div>
            )}
            {(issue.reportsCount && issue.reportsCount > 1) ? (
              <button 
                onClick={fetchReincidencias}
                className={cn("flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-colors", expanded ? "bg-red-600 text-white border-red-600 hover:bg-red-700" : "bg-red-50 text-red-600 border-red-100 hover:bg-red-100")}
              >
                 <AlertTriangle className="w-3.5 h-3.5" />
                 <span className="text-xs font-bold">{issue.reportsCount} Reportes {loadingRein ? '...' : expanded ? '(Ocultar)' : '(Ver)'}</span>
              </button>
            ) : null}
          </div>
        </div>
        
        <div className="flex items-center justify-center p-4">
          <ChevronRight className="w-6 h-6 text-slate-300 group-hover:text-primary-500 transition-colors" />
        </div>
      </motion.div>

      {expanded && reincidencias.length > 0 && (
        <motion.div 
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="pl-8 md:pl-12 space-y-2 relative"
        >
          {/* Timeline connecting line */}
          <div className="absolute left-4 top-0 bottom-6 w-px bg-slate-200" />
          
          {reincidencias.map((rein, idx) => {
            let affected = '';
            const match = rein.content.match(/\(Afectado: (.*?)\)/);
            if (match) affected = match[1];

            return (
              <div key={idx} className="relative bg-slate-50 border border-slate-200 rounded-2xl p-4 flex gap-4 ml-2">
                <div className="absolute -left-[35px] top-6 w-8 h-px bg-slate-200" />
                <div className="absolute -left-[38px] top-[21px] w-2 h-2 rounded-full border-2 border-slate-300 bg-white" />
                
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-500" />
                      <span className="text-xs font-bold text-slate-900">Reincidencia Reportada</span>
                    </div>
                    <span className="text-[10px] font-bold text-slate-400">{formatDate(rein.createdAt)}</span>
                  </div>
                  <div className="mt-2 flex flex-col gap-1">
                    <div className="flex gap-3">
                       <span className="text-xs text-slate-600">Por: <span className="font-bold text-slate-900">{rein.userName}</span></span>
                       {affected && <span className="text-xs text-slate-600">Afectado: <span className="font-bold text-slate-900">{affected}</span></span>}
                    </div>
                    {rein.note && (
                       <p className="text-xs text-slate-700 italic mt-1 bg-slate-100/50 p-2 rounded max-w-fit"><span className="font-bold mr-1 not-italic">Nota:</span>{rein.note}</p>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </motion.div>
      )}
    </div>
  );
}

function IssueDetailModal({ issue, onClose }: { issue: Issue, onClose: () => void }) {
  const { profile, isAdmin } = useAuth();
  const [events, setEvents] = useState<IssueEvent[]>([]);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showReincidenceInput, setShowReincidenceInput] = useState(false);
  const [newAffectedPerson, setNewAffectedPerson] = useState('');
  const [newReincidenceNote, setNewReincidenceNote] = useState('');

  useEffect(() => {
    const q = query(
      collection(db, 'issues', issue.id, 'events'), 
      orderBy('createdAt', 'asc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setEvents(snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as IssueEvent[]);
    });
    return () => unsubscribe();
  }, [issue.id]);

  const addEvent = async (type: IssueEvent['type'], content: string, extra = {}) => {
    if (!profile) return;
    await addDoc(collection(db, 'issues', issue.id, 'events'), {
      issueId: issue.id,
      type,
      userId: profile.uid,
      userName: profile.displayName,
      content,
      createdAt: new Date().toISOString(),
      ...extra
    });
  };

  const handlePostComment = async () => {
    if (!comment.trim()) return;
    setIsSubmitting(true);
    try {
      await addEvent('comment', comment);
      setComment('');
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStatusChange = async (newStatus: IssueStatus) => {
    try {
      const issueRef = doc(db, 'issues', issue.id);
      await updateDoc(issueRef, { 
        status: newStatus,
        updatedAt: serverTimestamp()
      });
      await addEvent('status_change', `Cambió el estado a ${newStatus}`, { from: issue.status, to: newStatus });
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-10">
      <motion.div 
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={onClose}
      />
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="relative w-full max-w-5xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col md:flex-row h-[90vh]"
      >
        {/* Left Side: Content */}
        <div className="flex-1 p-6 md:p-8 overflow-y-auto custom-scrollbar">
          <div className="flex items-center justify-between mb-6">
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
              <X className="w-6 h-6 text-slate-400" />
            </button>
            <div className="flex gap-2">
              {showReincidenceInput ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newAffectedPerson}
                      onChange={(e) => setNewAffectedPerson(e.target.value)}
                      placeholder="Persona afectada (Opcional)"
                      className="px-4 py-2 border border-slate-200 rounded-xl text-xs outline-none focus:border-primary-500"
                      autoFocus
                    />
                    <button 
                      onClick={async () => {
                         if (!profile) return;
                         try {
                           const issueRef = doc(db, 'issues', issue.id);
                           const updates: any = { 
                             reportsCount: (issue.reportsCount || 1) + 1,
                             reporters: arrayUnion(profile.uid),
                             updatedAt: serverTimestamp()
                           };
                           if (newAffectedPerson.trim()) {
                             updates.affectedPeople = arrayUnion(newAffectedPerson.trim());
                           }
                           await updateDoc(issueRef, updates);
                           const extraOpts = newReincidenceNote.trim() ? { note: newReincidenceNote.trim() } : {};
                           await addEvent('comment', `➕ Reincidencia reportada por ${profile.displayName}${newAffectedPerson.trim() ? ` (Afectado: ${newAffectedPerson.trim()})` : ''}`, extraOpts);
                           setShowReincidenceInput(false);
                           setNewAffectedPerson('');
                           setNewReincidenceNote('');
                         } catch(e) {
                           console.error(e);
                         }
                      }}
                      className="px-4 py-2 bg-primary-600 text-white rounded-xl text-xs font-bold hover:bg-primary-700 transition-all uppercase tracking-widest"
                    >
                      Confirmar
                    </button>
                    <button 
                      onClick={() => setShowReincidenceInput(false)}
                      className="px-3 py-2 bg-slate-100 text-slate-500 rounded-xl text-xs hover:bg-slate-200 transition-all"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <input
                    type="text"
                    value={newReincidenceNote}
                    onChange={(e) => setNewReincidenceNote(e.target.value)}
                    placeholder="Nota o variante (Opcional)"
                    className="w-full px-4 py-2 border border-slate-200 rounded-xl text-xs outline-none focus:border-primary-500"
                  />
                </div>
              ) : (
                <button 
                  onClick={() => setShowReincidenceInput(true)}
                  className="px-6 py-2 rounded-xl text-xs font-bold shadow-sm border border-slate-200 transition-all flex items-center gap-2 uppercase tracking-widest bg-slate-100 text-slate-600 hover:bg-slate-200"
                >
                  <PlusSquare className="w-4 h-4" />
                  Reincidencia
                </button>
              )}
              {isAdmin && issue.status !== 'resolved' && (
                <button 
                  onClick={() => handleStatusChange('resolved')}
                  className="px-6 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition-all uppercase tracking-widest"
                >
                  Confirmar Resolución
                </button>
              )}
            </div>
          </div>

          <div className="space-y-8">
            <div className="space-y-2">
               <div className="flex items-center gap-3">
                 <span className="text-[10px] font-black text-primary-600 uppercase tracking-[0.2em]">{issue.areaName}</span>
                 <span className="text-xs font-bold text-slate-300">•</span>
                 <span className="text-xs font-bold text-slate-500">{formatDate(issue.createdAt)}</span>
               </div>
               <h2 className="text-4xl font-black text-slate-900 leading-tight uppercase">{issue.title}</h2>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
               <InfoTile label="Prioridad" value={issue.priority} color={issue.priority === 'critical' ? 'red' : 'blue'} />
               <InfoTile label="Estado" value={issue.status} color="slate" />
               <InfoTile label="Reportó" value={issue.userName} color="slate" />
               <InfoTile label="ID" value={`#${issue.id.slice(-6).toUpperCase()}`} color="slate" />
               <InfoTile label="Reportes" value={issue.reportsCount?.toString() || '1'} color={(issue.reportsCount || 1) > 1 ? 'amber' : 'slate'} />
            </div>

            {Array.isArray(issue.affectedPeople) && issue.affectedPeople.length > 0 && (
              <div className="space-y-4 pt-4">
                <h4 className="text-sm font-black text-blue-600 uppercase tracking-widest border-b border-blue-100 pb-2">Personas Afectadas</h4>
                <div className="flex flex-wrap gap-2">
                  {issue.affectedPeople.map((person, idx) => (
                    <div key={idx} className="px-4 py-2 bg-blue-50 text-blue-700 rounded-xl text-xs font-bold border border-blue-100">
                      {person}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-4">
              <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest border-b border-slate-100 pb-2 flex items-center gap-2">
                <Tag className="w-4 h-4 text-primary-500" />
                Descripción del Problema
              </h4>
              <p className="text-slate-700 font-medium leading-relaxed bg-slate-50 border border-slate-100 p-6 rounded-3xl italic">
                "{issue.description}"
              </p>
            </div>
            
            {issue.status === 'resolved' && (
              <div className="space-y-4">
                <h4 className="text-sm font-black text-emerald-600 uppercase tracking-widest border-b border-emerald-100 pb-2">Resolución</h4>
                <div className="bg-emerald-50 p-6 rounded-3xl border border-emerald-100 italic font-medium text-emerald-700">
                  {issue.resolution || 'Incidencia resuelta sin comentarios adicionales.'}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Timeline & Comments */}
        <div className="w-full md:w-[400px] bg-slate-50 border-l border-slate-100 flex flex-col h-full">
          <div className="p-8 border-b border-slate-100">
             <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
               <MessageSquare className="w-4 h-4 text-primary-500" />
               Registro de Actividad
             </h4>
          </div>

          <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px]">
            {events.map((event) => (
              <div key={event.id} className="relative pl-10 space-y-1">
                <div className="absolute left-0 top-1 w-6 h-6 rounded-full bg-white border-2 border-slate-200 flex items-center justify-center z-10">
                   {event.type === 'comment' ? <MessageSquare className="w-3 h-3 text-primary-500" /> : <ChevronRight className="w-3 h-3 text-slate-400" />}
                </div>
                <div className="absolute left-[11px] top-6 bottom-[-24px] w-0.5 bg-slate-200 last:hidden" />
                
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">
                  {event.userName} • {formatDate(event.createdAt)}
                </p>
                <div className={cn(
                  "p-4 rounded-2xl text-sm font-medium",
                  event.type === 'comment' ? "bg-white shadow-sm text-slate-700 border border-slate-100" : "bg-primary-50 text-primary-700 italic text-xs border border-primary-100"
                )}>
                  {event.content}
                  {event.type === 'comment' && event.content.includes('Reincidencia reportada por') && (
                     <ReincidenceNoteEditor issueId={issue.id} eventId={event.id} initialNote={event.note} />
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="p-8 bg-white border-t border-slate-100">
            <div className="relative">
              <textarea
                placeholder="Añadir comentario..."
                className="w-full pl-4 pr-12 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm focus:ring-2 focus:ring-primary-500 outline-none transition-all resize-none min-h-[100px] placeholder:text-slate-400"
                value={comment}
                onChange={e => setComment(e.target.value)}
              />
              <button 
                onClick={handlePostComment}
                disabled={isSubmitting || !comment.trim()}
                className="absolute right-3 bottom-3 p-3 bg-primary-600 text-white rounded-xl shadow-lg shadow-primary-200 hover:bg-primary-700 transition-all disabled:opacity-50"
              >
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function InfoTile({ label, value, color }: { label: string, value: string, color: 'blue' | 'red' | 'slate' | 'amber' }) {
  const colors = {
    blue: 'text-primary-700 bg-primary-50 border border-primary-200',
    red: 'text-red-700 bg-red-50 border border-red-200',
    slate: 'text-slate-600 bg-slate-50 border border-slate-200',
    amber: 'text-amber-700 bg-amber-50 border border-amber-200'
  };
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{label}</p>
      <p className={cn("px-3 py-1.5 rounded-xl font-bold text-xs inline-block capitalize", colors[color])}>
        {value}
      </p>
    </div>
  );
}

function ReincidenceNoteEditor({ issueId, eventId, initialNote }: { issueId: string, eventId: string, initialNote?: string }) {
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(initialNote || '');
  const [saving, setSaving] = useState(false);

  const saveNote = async () => {
    setSaving(true);
    try {
      await updateDoc(doc(db, 'issues', issueId, 'events', eventId), { note: note.trim() });
      setEditing(false);
    } catch(e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <div className="mt-2">
        {initialNote ? (
          <p className="text-xs text-slate-600 italic">
            <span className="font-bold mr-1">Nota:</span>
            {initialNote}
            <button onClick={() => setEditing(true)} className="ml-2 text-primary-500 hover:underline not-italic text-[10px] font-bold">Editar</button>
          </p>
        ) : (
          <button onClick={() => setEditing(true)} className="text-[10px] font-bold text-primary-600 hover:underline uppercase tracking-wider">
            + Añadir Nota/Variante
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="mt-2 flex items-center gap-2">
      <input 
        type="text"
        value={note}
        onChange={e => setNote(e.target.value)}
        placeholder="Nota o variante del problema..."
        className="flex-1 text-xs px-3 py-1.5 border border-slate-200 rounded-lg outline-none focus:border-primary-500"
        autoFocus
      />
      <button 
        onClick={saveNote}
        disabled={saving}
        className="px-3 py-1.5 bg-primary-600 text-white rounded-lg text-xs font-bold disabled:opacity-50"
      >
        {saving ? '...' : 'Guardar'}
      </button>
      <button 
        onClick={() => { setEditing(false); setNote(initialNote || ''); }}
        disabled={saving}
        className="px-2 py-1.5 text-slate-400 hover:text-slate-600"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
