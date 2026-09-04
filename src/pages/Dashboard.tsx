import React, { useEffect, useState, useMemo } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { Issue, OperationType, Asset } from '../types';
import { handleFirestoreError } from '../constants';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, Cell, PieChart, Pie } from 'recharts';
import { AlertCircle, CheckCircle2, Clock, ShieldAlert, TrendingUp, Users, Activity, Zap, Box, ListTodo, Calendar, Briefcase, MonitorSmartphone } from 'lucide-react';
import { motion } from 'motion/react';
import { cn, formatDate } from '../lib/utils';
import { useAuth } from '../AuthContext';

const COLORS = ['#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe'];
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export default function Dashboard() {
  const { profile } = useAuth();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(new Date().getMonth());
  const [year, setYear] = useState(new Date().getFullYear());
  const [week, setWeek] = useState('all');
  const [guildFilt, setGuildFilt] = useState('all');
  const [cityFilt, setCityFilt] = useState('all');

  useEffect(() => {
    if (!profile) return;
    
    let qIssues = query(collection(db, 'issues'));
    let qAssets = query(collection(db, 'assets'));
    
    if (profile.role !== 'superadmin') {
      const allGuilds = Array.from(new Set([profile.guildId, ...(profile.allowedGuilds || [])])).filter(Boolean).slice(0, 30);
      if (allGuilds.length > 0) {
        qIssues = query(collection(db, 'issues'), where('guildId', 'in', allGuilds));
        qAssets = query(collection(db, 'assets'), where('guildId', 'in', allGuilds));
      }
    }
    
    // Subscribe to issues
    const unsubscribeIssues = onSnapshot(qIssues, (snapshot) => {
      const issuesList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Issue[];
      issuesList.sort((a, b) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        return timeB - timeA;
      });
      setIssues(issuesList);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'issues'));

    // Subscribe to assets
    const unsubscribeAssets = onSnapshot(qAssets, (snapshot) => {
      const assetsList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Asset[];
      setAssets(assetsList);
      setLoading(false);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'assets'));

    return () => {
      unsubscribeIssues();
      unsubscribeAssets();
    };
  }, [profile]);

  const guildsList = Array.from(new Set(issues.map(i => i.guildId).filter(Boolean)));
  const citiesList = Array.from(new Set(issues.filter(i => guildFilt === 'all' || i.guildId === guildFilt).map(i => ({ id: i.cityId, name: i.cityName })).filter(i => i.id)));
  const uniqueCities = Array.from(new Map(citiesList.map((item: any) => [item.id, item])).values()) as {id: string, name: string}[];

  const filteredIssues = useMemo(() => {
    return issues.filter(issue => {
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
      return true;
    });
  }, [issues, month, year, week, guildFilt, cityFilt]);

  const stats = {
    active: filteredIssues.filter(i => i.status !== 'resolved' && i.status !== 'closed').length,
    resolved: filteredIssues.filter(i => i.status === 'resolved').length,
    critical: filteredIssues.filter(i => i.priority === 'critical').length,
    open: filteredIssues.filter(i => i.status === 'open').length,
    inProgress: filteredIssues.filter(i => i.status === 'in_progress').length,
  };

  const assetStats = {
    total: assets.length,
    assigned: assets.filter(a => a.status === 'assigned').length,
    maintenance: assets.filter(a => a.status === 'maintenance').length,
    available: assets.filter(a => a.status === 'available').length,
    lost: assets.filter(a => a.status === 'lost').length,
  };

  const weekDataMap = useMemo(() => {
    const map = new Map<string, number>();
    const chronological = [...filteredIssues].reverse();
    chronological.forEach(issue => {
      if (!issue.createdAt) return;
      const date = issue.createdAt.toDate ? issue.createdAt.toDate() : new Date(issue.createdAt);
      const m = date.toLocaleString('es-ES', { month: 'short' });
      const day = date.getDate();
      const weekNum = Math.min(5, Math.ceil(day / 7));
      const label = `S${weekNum} ${m}`;
      map.set(label, (map.get(label) || 0) + 1);
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [filteredIssues]);

  const areaDataMap = filteredIssues.reduce((acc, issue) => {
    acc[issue.areaName] = (acc[issue.areaName] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const areaData = Object.entries(areaDataMap).map(([name, value]) => ({ name, value }));

  const statusData = [
    { name: 'Abierto', value: stats.open },
    { name: 'En Proceso', value: stats.inProgress },
    { name: 'Resuelto', value: stats.resolved },
  ];


  return (
    <div className="space-y-10">
      <div className="flex flex-col md:flex-row justify-end items-start md:items-center gap-4">
        <div className="flex items-center gap-4 flex-wrap w-full md:w-auto">
           <div className="flex bg-white rounded-2xl border border-slate-200 p-2 shadow-sm gap-2">
             <div className="flex items-center gap-2 px-2">
               <Calendar className="w-4 h-4 text-slate-400" />
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
           
           {(profile?.role === 'superadmin' || (profile?.allowedGuilds && profile.allowedGuilds.length > 0)) && (
             <div className="flex bg-white rounded-2xl border border-slate-200 p-1 shadow-sm h-[42px] items-center">
               <select 
                   value={guildFilt} 
                   onChange={e => { setGuildFilt(e.target.value); setCityFilt('all'); }}
                   className="text-xs font-bold text-slate-600 outline-none bg-transparent px-2 cursor-pointer h-full"
                 >
                   <option value="all">Empresa: Todas</option>
                   {guildsList.map(g => <option key={String(g)} value={String(g)}>{g}</option>)}
               </select>
             </div>
           )}

           <div className="flex bg-white rounded-2xl border border-slate-200 p-1 shadow-sm h-[42px] items-center">
             <select 
                 value={cityFilt} 
                 onChange={e => setCityFilt(e.target.value)}
                 className="text-xs font-bold text-slate-600 outline-none bg-transparent px-2 cursor-pointer h-full"
               >
                 <option value="all">Ciudad: Todas</option>
                 {uniqueCities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
             </select>
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <GlassCard 
          label="Incidencias Activas" 
          value={stats.active} 
          icon={Activity} 
          color="blue" 
          description="Reportes activos actualmente"
        />
        <GlassCard 
          label="Tareas Cerradas" 
          value={stats.resolved} 
          icon={CheckCircle2} 
          color="emerald" 
          description="Incidencias resueltas"
        />
        <GlassCard 
          label="Prioridad Crítica" 
          value={stats.critical} 
          icon={AlertCircle} 
          color="red" 
          description="Requiere atención inmediata"
        />
        <GlassCard 
          label="Total Activos" 
          value={assetStats.total} 
          icon={MonitorSmartphone} 
          color="blue" 
          description={`${assetStats.assigned} asingados / ${assetStats.maintenance} mtto / ${assetStats.lost} extrav.`}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm overflow-hidden relative text-slate-900">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Actividad Semanal</h3>
                <p className="text-sm text-slate-500">Volumen de incidencias por semana</p>
              </div>
              <Activity className="w-6 h-6 text-slate-300" />
            </div>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={weekDataMap}>
                  <defs>
                    <linearGradient id="colorValueWeek" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10, fontWeight: 700 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10, fontWeight: 700 }} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '20px', border: '1px solid #e2e8f0', backgroundColor: '#ffffff', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.05)', padding: '12px' }}
                    labelStyle={{ fontWeight: 800, color: '#0f172a' }}
                  />
                  <Area type="monotone" dataKey="value" stroke="#10b981" strokeWidth={4} fillOpacity={1} fill="url(#colorValueWeek)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm text-slate-900 relative">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-slate-800">Últimos Registros</h3>
              <ListTodo className="w-5 h-5 text-slate-400" />
            </div>
            <div className="space-y-3">
              {filteredIssues.slice(0, 4).map((issue) => (
                <div key={issue.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100 hover:border-primary-100 transition-all group cursor-pointer">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-primary-50 flex items-center justify-center font-semibold text-primary-600 text-sm">
                      {issue.userName?.charAt(0)}
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-slate-800 group-hover:text-primary-600 transition-colors">{issue.title}</p>
                      <p className="text-xs text-slate-500">{issue.areaName} • {formatDate(issue.createdAt)}</p>
                    </div>
                  </div>
                  <ChevronRightIcon className="w-4 h-4 text-slate-300 group-hover:text-primary-500 transition-colors" />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm overflow-hidden relative text-slate-900">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Actividad por Área</h3>
                <p className="text-sm text-slate-500">Volumen de incidencias detectadas</p>
              </div>
              <Box className="w-6 h-6 text-slate-300" />
            </div>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={areaData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10, fontWeight: 700 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10, fontWeight: 700 }} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '20px', border: '1px solid #e2e8f0', backgroundColor: '#ffffff', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.05)', padding: '12px' }}
                    labelStyle={{ fontWeight: 800, color: '#0f172a' }}
                    cursor={{ fill: 'transparent' }}
                  />
                  <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm text-slate-900">
            <h3 className="text-lg font-bold text-slate-800 mb-6">Balance Global</h3>
            <div className="h-64 mb-10">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={8}
                    dataKey="value"
                  >
                    {statusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', backgroundColor: '#ffffff' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-3">
              {statusData.map((s, i) => (
                <div key={s.name} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    <span className="text-xs font-semibold text-slate-600">{s.name}</span>
                  </div>
                  <span className="text-sm font-bold text-slate-900">{s.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function GlassCard({ label, value, icon: Icon, color, description }: any) {
  const themes: any = {
    blue: 'bg-primary-50 text-primary-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    red: 'bg-red-50 text-red-600',
  };

  return (
    <motion.div 
      className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between"
    >
      <div className="flex items-start justify-between mb-4">
        <div className={cn("p-3 rounded-xl", themes[color])}>
          <Icon className="w-6 h-6" />
        </div>
        <div className="text-right">
           <p className="text-xs font-semibold text-slate-500">{label}</p>
           <p className="text-3xl font-bold text-slate-900 mt-1">{value}</p>
        </div>
      </div>
      <p className="text-xs text-slate-400">
        {description}
      </p>
    </motion.div>
  );
}

function ChevronRightIcon(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
  );
}
