import React, { useEffect, useState, useRef } from 'react';
import { collection, onSnapshot, query, orderBy, doc, updateDoc, serverTimestamp, setDoc, addDoc, getDocs, deleteDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../AuthContext';
import { Issue, OperationType, UserProfile, Area } from '../types';
import { handleFirestoreError } from '../constants';
import { ShieldCheck, MessageSquare, ArrowRight, UserCheck, Search, Users, LayoutGrid, Trash2, Plus, Settings2, Activity, Loader2, PenTool, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, formatDate } from '../lib/utils';
import DataConfig from '../components/DataConfig';
import SignatureCanvas from 'react-signature-canvas';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';

export default function AdminPanel() {
  const { profile } = useAuth();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [equipmentTypes, setEquipmentTypes] = useState<any[]>([]);
  const [guilds, setGuilds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'issues' | 'users' | 'areas' | 'settings' | 'guilds' | 'catalogs'>('issues');
  const [activeCatalog, setActiveCatalog] = useState<'cities' | 'routes' | 'categories' | 'motifs' | 'brands' | 'employees' | 'equipmentTypes'>('cities');
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolutionText, setResolutionText] = useState('');
  const [selectedAdminGuild, setSelectedAdminGuild] = useState<string>('');

  const [newAreaName, setNewAreaName] = useState('');
  const [newGuildCode, setNewGuildCode] = useState('');
  const [newGuildName, setNewGuildName] = useState('');
  const [currentTheme, setCurrentTheme] = useState('blue');

  const [signingEmployee, setSigningEmployee] = useState<any | null>(null);
  const [savingSignature, setSavingSignature] = useState(false);
  const sigCanvas = useRef<any>(null);

  // Load guilds first to set initial selectedAdminGuild
  useEffect(() => {
    if (!profile) return;
    if (profile.role === 'superadmin') {
      const unsub = onSnapshot(query(collection(db, 'guilds')), (snapshot) => {
        const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setGuilds(list);
        if (!selectedAdminGuild && list.length > 0) {
          setSelectedAdminGuild(list[0].id);
        }
      });
      return () => unsub();
    } else if (profile.allowedGuilds && profile.allowedGuilds.length > 0) {
      const gSnap = Array.from(new Set([profile.guildId, ...profile.allowedGuilds])).filter(Boolean).slice(0, 30);
      // Ideally we'd fetch them to get names, but we can just use IDs as names for now or fetch them.
      const unsub = onSnapshot(query(collection(db, 'guilds'), where('id', 'in', gSnap)), (snapshot) => {
        const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setGuilds(list);
        if (!selectedAdminGuild && list.length > 0) {
          setSelectedAdminGuild(profile.guildId); // default to primary
        }
      });
      return () => unsub();
    } else {
      setSelectedAdminGuild(profile.guildId);
      setGuilds([{ id: profile.guildId, name: profile.guildId }]); // fallback
    }
  }, [profile]);

  useEffect(() => {
    if (!profile || !selectedAdminGuild) return;
    
    // Always use selectedAdminGuild for the admin view
    let issuesQuery = query(collection(db, 'issues'), where('guildId', '==', selectedAdminGuild));
    let usersQuery = query(collection(db, 'users'), where('guildId', '==', selectedAdminGuild));
    let areasQuery = query(collection(db, 'areas'), where('guildId', '==', selectedAdminGuild));
    let employeesQuery = query(collection(db, 'employees'), where('guildId', '==', selectedAdminGuild));
    let equipmentTypesQuery = query(collection(db, 'equipmentTypes'), where('guildId', '==', selectedAdminGuild));

    const unsubIssues = onSnapshot(issuesQuery, (snapshot) => {
      const issuesList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Issue[];
      issuesList.sort((a, b) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        return timeB - timeA;
      });
      setIssues(issuesList);
      setLoading(false);
    });

    const unsubUsers = onSnapshot(usersQuery, (snapshot) => {
      const usersList = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() })) as unknown as UserProfile[];
      usersList.sort((a, b) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        return timeB - timeA;
      });
      setUsers(usersList);
    });

    const unsubAreas = onSnapshot(areasQuery, (snapshot) => {
      setAreas(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Area[]);
    });

    const unsubEmployees = onSnapshot(employeesQuery, (snapshot) => {
      setEmployees(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubEquipmentTypes = onSnapshot(equipmentTypesQuery, (snapshot) => {
      setEquipmentTypes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubSettings = onSnapshot(doc(db, 'settings', selectedAdminGuild), (docSnap) => {
      if (docSnap.exists()) {
        setCurrentTheme(docSnap.data().themeColor || 'blue');
      } else {
        setCurrentTheme('blue');
      }
    });

    return () => {
      unsubIssues();
      unsubUsers();
      unsubAreas();
      unsubEmployees();
      unsubEquipmentTypes();
      unsubSettings();
    };
  }, [profile, selectedAdminGuild]);

  const handleSaveSignature = async () => {
    if (!signingEmployee || !sigCanvas.current || sigCanvas.current.isEmpty()) return;
    setSavingSignature(true);
    try {
      const canvas = sigCanvas.current.getTrimmedCanvas();
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
      if (!blob) throw new Error("No se pudo generar la imagen de la firma.");

      const storageRef = ref(storage, `employee_signatures/${signingEmployee.id}/${Date.now()}_signature.png`);
      const snapshot = await uploadBytes(storageRef, blob);
      const downloadURL = await getDownloadURL(snapshot.ref);

      await updateDoc(doc(db, 'employees', signingEmployee.id), {
        signatureUrl: downloadURL,
        updatedAt: serverTimestamp()
      });
      setSigningEmployee(null);
    } catch (err) {
      console.error(err);
      alert('Error al guardar la firma.');
    } finally {
      setSavingSignature(false);
    }
  };

  const clearSignature = () => {
    if (sigCanvas.current) {
      sigCanvas.current.clear();
    }
  };

  const handleUpdateTheme = async (color: string) => {
    if (!profile) return;
    try {
      await setDoc(doc(db, 'settings', profile.guildId), {
        themeColor: color,
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (err) {
      console.error("Error setting theme", err);
    }
  };

  const handleResolve = async (issueId: string) => {
    if (!resolutionText || !profile) return;
    
    try {
      const issueRef = doc(db, 'issues', issueId);
      await updateDoc(issueRef, {
        status: 'resolved',
        resolution: resolutionText,
        resolvedBy: profile.displayName || 'Admin',
        resolvedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Add to timeline
      await addDoc(collection(db, 'issues', issueId, 'events'), {
        issueId,
        type: 'status_change',
        userId: profile.uid,
        userName: profile.displayName,
        content: `Finalizó la resolución: "${resolutionText}"`,
        createdAt: new Date().toISOString(),
      });

      setResolvingId(null);
      setResolutionText('');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `issues/${issueId}`);
    }
  };

  const handleAddArea = async () => {
    if (!newAreaName || !profile) return;
    const currentGuild = selectedAdminGuild || profile.guildId;
    try {
      const id = newAreaName.toLowerCase().replace(/\s+/g, '-') + '-' + currentGuild.toLowerCase(); // keep id unique per guild
      await setDoc(doc(db, 'areas', id), {
        id,
        name: newAreaName,
        color: 'blue',
        guildId: currentGuild,
      });
      setNewAreaName('');
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddGuild = async () => {
    if (!newGuildCode || !newGuildName || profile?.role !== 'superadmin') return;
    try {
      const code = newGuildCode.toUpperCase().trim();
      await setDoc(doc(db, 'guilds', code), {
        id: code,
        name: newGuildName,
        createdAt: serverTimestamp()
      });
      setNewGuildName('');
      setNewGuildCode('');
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateUserGuilds = async (userId: string, guildsStr: string) => {
    if (profile?.role !== 'superadmin') return;
    try {
      const allowedGuilds = guildsStr.split(',').map(s => s.trim().toUpperCase()).filter(s => s);
      await updateDoc(doc(db, 'users', userId), { allowedGuilds });
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateUserRole = async (userId: string, newRole: string) => {
    if (profile?.role !== 'superadmin') return;
    try {
      await updateDoc(doc(db, 'users', userId), { role: newRole });
    } catch (err) {
      console.error(err);
    }
  };

  const pendingIssues = issues.filter(i => i.status === 'open' || i.status === 'in_progress');

  return (
    <div className="space-y-8">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
        <div>
          <div className="flex items-center gap-4 mb-1">
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">Panel de Administración</h1>
            {guilds.length > 1 && (
              <select 
                 value={selectedAdminGuild}
                 onChange={(e) => setSelectedAdminGuild(e.target.value)}
                 className="bg-white border border-slate-200 text-slate-600 text-sm font-bold rounded-xl px-3 py-1.5 focus:ring-2 outline-none focus:ring-primary-500 shadow-sm"
              >
                 {guilds.map(g => (
                   <option key={g.id} value={g.id}>{g.name || g.id}</option>
                 ))}
              </select>
            )}
          </div>
          <p className="text-slate-500 font-medium text-sm">Gestión administrativa de la plataforma.</p>
        </div>
        
        <div className="flex flex-wrap bg-white rounded-2xl border border-slate-200 p-1 shadow-sm gap-1 w-full lg:w-auto mt-4 lg:mt-0">
          <TabButton active={activeTab === 'issues'} onClick={() => setActiveTab('issues')} icon={Activity} label="Incidencias" />
          <TabButton active={activeTab === 'users'} onClick={() => setActiveTab('users')} icon={Users} label="Usuarios" />
          <TabButton active={activeTab === 'areas'} onClick={() => setActiveTab('areas')} icon={LayoutGrid} label="Divisiones" />
          <TabButton active={activeTab === 'catalogs'} onClick={() => setActiveTab('catalogs')} icon={LayoutGrid} label="Catálogos" />
          <TabButton active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} icon={Settings2} label="Ajustes" />
          {profile?.role === 'superadmin' && (
            <TabButton active={activeTab === 'guilds'} onClick={() => setActiveTab('guilds')} icon={ShieldCheck} label="Empresas" />
          )}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'issues' && (
          <motion.div key="issues" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-8">
            <div className="bg-primary-600 rounded-3xl p-6 text-white shadow-lg shadow-primary-600/20 relative overflow-hidden">
               <div className="relative z-10 space-y-2">
                 <p className="text-primary-200 font-black uppercase tracking-[0.3em] text-[10px]">Estatus de Red</p>
                 <div className="flex items-baseline gap-4">
                   <h2 className="text-6xl font-black">{pendingIssues.length}</h2>
                   <p className="text-xl font-bold opacity-80 uppercase tracking-tighter">Reportes Pendientes</p>
                 </div>
               </div>
               <ShieldCheck className="absolute top-1/2 right-10 -translate-y-1/2 w-56 h-56 text-white/10" />
            </div>

            <div className="grid grid-cols-1 gap-6">
              {pendingIssues.map(issue => (
                <AdminIssueCard 
                  key={issue.id} 
                  issue={issue} 
                  resolvingId={resolvingId}
                  setResolvingId={setResolvingId}
                  resolutionText={resolutionText}
                  setResolutionText={setResolutionText}
                  onResolve={() => handleResolve(issue.id)}
                />
              ))}
              {pendingIssues.length === 0 && (
                <div className="bg-white rounded-3xl p-12 text-center border-2 border-dashed border-slate-200">
                   <CheckCircle2Icon className="w-16 h-16 text-emerald-500 mx-auto mb-6 opacity-50" />
                   <h3 className="text-2xl font-black text-slate-900 uppercase">Sin Pendientes</h3>
                   <p className="text-slate-500 font-medium">Todo el sistema está operando con normalidad.</p>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {activeTab === 'users' && (
          <motion.div key="users" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-8 py-6 text-xs font-black text-slate-500 uppercase tracking-widest">Colaborador</th>
                  <th className="px-8 py-6 text-xs font-black text-slate-500 uppercase tracking-widest">Rol</th>
                  {profile.role === 'superadmin' && (
                    <th className="px-8 py-6 text-xs font-black text-slate-500 uppercase tracking-widest">Empresas Extra</th>
                  )}
                  <th className="px-8 py-6 text-xs font-black text-slate-500 uppercase tracking-widest">Registro</th>
                  <th className="px-8 py-6 text-xs font-black text-slate-500 uppercase tracking-widest text-right">Opciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-900">
                {users.map(user => (
                  <tr key={user.uid} className="hover:bg-slate-50 transition-colors">
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-4">
                         <div className="w-10 h-10 rounded-xl bg-primary-50 border border-primary-100 text-primary-600 flex items-center justify-center font-black uppercase shadow-sm">
                           {user.displayName?.charAt(0)}
                         </div>
                         <div>
                           <p className="text-sm font-black uppercase">{user.displayName || 'Sin Nombre'}</p>
                           <p className="text-xs font-bold text-slate-500">{user.email}</p>
                         </div>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                       {profile.role === 'superadmin' ? (
                         <select
                           value={user.role}
                           onChange={(e) => handleUpdateUserRole(user.uid, e.target.value)}
                           className="bg-slate-50 border border-slate-200 text-slate-700 text-xs rounded-xl focus:ring-primary-500 font-bold p-2"
                         >
                           <option value="user">USER</option>
                           <option value="admin">ADMIN</option>
                           <option value="superadmin">SUPERADMIN</option>
                         </select>
                       ) : (
                         <span className={cn(
                           "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                           user.role === 'admin' ? "bg-primary-600 text-white" : "bg-slate-100 text-slate-600 border border-slate-200"
                         )}>
                           {user.role}
                         </span>
                       )}
                    </td>
                    {profile.role === 'superadmin' && (
                      <td className="px-8 py-6">
                        <input
                          type="text"
                          defaultValue={user.allowedGuilds?.join(', ') || ''}
                          onBlur={(e) => handleUpdateUserGuilds(user.uid, e.target.value)}
                          placeholder="EMP1, EMP2"
                          className="bg-white border border-slate-200 text-slate-700 text-xs rounded-xl p-2 w-32 focus:ring-2 focus:ring-primary-500 outline-none uppercase font-mono"
                        />
                      </td>
                    )}
                    <td className="px-8 py-6 text-xs font-bold text-slate-500">
                       {formatDate(user.createdAt)}
                    </td>
                    <td className="px-8 py-6 text-right">
                       <button className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-400 hover:text-primary-600">
                         <Settings2 className="w-5 h-5" />
                       </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </motion.div>
        )}

        {activeTab === 'areas' && (
          <motion.div key="areas" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
            <div className="bg-white p-6 rounded-3xl border border-slate-200 flex flex-col md:flex-row items-center gap-6 shadow-sm text-slate-900">
               <div className="flex-1 space-y-1">
                 <h3 className="text-xl font-black uppercase tracking-tight">Nueva Área/División</h3>
                 <p className="text-sm text-slate-500 font-medium">Define una nueva área operativa.</p>
               </div>
               <div className="flex gap-2 w-full md:w-auto">
                 <input 
                   type="text" 
                   value={newAreaName}
                   onChange={e => setNewAreaName(e.target.value)}
                   placeholder="Ej: Planta Sur, Piso 4..." 
                   className="flex-1 md:w-64 px-6 py-4 bg-white border border-slate-200 text-slate-900 rounded-2xl text-sm focus:ring-2 focus:ring-primary-500 transition-all font-bold placeholder:font-normal placeholder:text-slate-400"
                 />
                 <button onClick={handleAddArea} className="px-6 py-4 bg-primary-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-primary-700 shadow-lg shadow-primary-600/20 transition-all">
                   Añadir
                 </button>
               </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {areas.map(area => (
                  <div key={area.id} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center justify-between group">
                   <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-primary-50 flex items-center justify-center text-primary-600 border border-primary-100">
                         <LayoutGrid className="w-6 h-6" />
                      </div>
                      <p className="font-black text-slate-900 uppercase tracking-tight">{area.name}</p>
                   </div>
                   <button onClick={() => deleteDoc(doc(db, 'areas', area.id))} className="p-3 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100">
                      <Trash2 className="w-5 h-5" />
                   </button>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {profile?.role === 'superadmin' && activeTab === 'guilds' && (
          <motion.div key="guilds" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
            <div className="bg-white p-6 rounded-3xl border border-slate-200 flex flex-col items-center gap-6 shadow-sm text-slate-900">
               <div className="w-full space-y-1 mb-2">
                 <h3 className="text-xl font-black uppercase tracking-tight">Nueva Empresa / Franquicia</h3>
                 <p className="text-sm text-slate-500 font-medium">Registra una nueva entidad en el sistema multiplataforma.</p>
               </div>
               <div className="flex flex-col md:flex-row gap-4 w-full">
                 <input 
                   type="text" 
                   value={newGuildName}
                   onChange={e => setNewGuildName(e.target.value)}
                   placeholder="Nombre de la empresa" 
                   className="flex-1 px-6 py-4 bg-white border border-slate-200 text-slate-900 rounded-2xl text-sm focus:ring-2 focus:ring-primary-500 transition-all font-bold placeholder:font-normal placeholder:text-slate-400"
                 />
                 <input 
                   type="text" 
                   value={newGuildCode}
                   onChange={e => setNewGuildCode(e.target.value)}
                   placeholder="Código (Ej: EMP_01)" 
                   className="flex-1 px-6 py-4 bg-white border border-slate-200 text-slate-900 rounded-2xl text-sm focus:ring-2 focus:ring-primary-500 transition-all font-bold placeholder:font-normal placeholder:text-slate-400 uppercase"
                 />
                 <button onClick={handleAddGuild} className="px-8 py-4 bg-primary-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-primary-700 shadow-lg shadow-primary-600/20 transition-all flex items-center justify-center gap-2">
                   <Plus className="w-4 h-4" /> Registrar
                 </button>
               </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {guilds.map(guild => (
                <div key={guild.id} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center justify-between group">
                   <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 border border-indigo-100">
                         <ShieldCheck className="w-6 h-6" />
                      </div>
                      <div>
                         <p className="font-black text-slate-900 uppercase tracking-tight">{guild.name}</p>
                         <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">{guild.id}</p>
                      </div>
                   </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {activeTab === 'catalogs' && (
          <motion.div key="catalogs" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
             <div className="flex flex-wrap gap-2 mb-6">
               {[
                 { id: 'cities', label: 'Ciudades / Sucursales' },
                 { id: 'routes', label: 'Rutas' },
                 { id: 'categories', label: 'Incidencias' },
                 { id: 'motifs', label: 'Motivos de Cambio' },
                 { id: 'equipmentTypes', label: 'Tipos de Equipo' },
                 { id: 'brands', label: 'Marcas / Modelos' },
                 { id: 'employees', label: 'Personal / Asesores' }
               ].map(cat => (
                 <button
                   key={cat.id}
                   onClick={() => setActiveCatalog(cat.id as any)}
                   className={cn(
                     "px-5 py-2.5 rounded-xl font-bold text-sm transition-all border-2",
                     activeCatalog === cat.id 
                       ? "border-primary-600 bg-primary-50 text-primary-700"
                       : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:border-slate-300 shadow-sm"
                   )}
                 >
                   {cat.label}
                 </button>
               ))}
             </div>

             <div className="mt-4">
                {activeCatalog === 'cities' && (
                  <DataConfig 
                    collectionName="cities" 
                    title="Ciudades / Sucursales" 
                    fields={[ { name: 'name', label: 'Nombre' } ]} 
                    selectedGuild={selectedAdminGuild}
                  />
                )}
                
                {activeCatalog === 'routes' && (
                  <DataConfig 
                    collectionName="routes" 
                    title="Rutas" 
                    fields={[ 
                      { name: 'name', label: 'Nombre' },
                      { name: 'employeeId', label: 'Asesor asignado', type: 'select', options: employees.map(e => ({ value: e.id, label: e.name })) }
                    ]} 
                    parentCollection={{ name: 'cities', localField: 'cityId', parentField: 'name', docNameField: 'Ciudad' }}
                    selectedGuild={selectedAdminGuild}
                  />
                )}

                {activeCatalog === 'categories' && (
                  <DataConfig 
                    collectionName="categories" 
                    title="Categorías de Incidencias" 
                    fields={[ { name: 'name', label: 'Nombre' } ]} 
                    selectedGuild={selectedAdminGuild}
                  />
                )}

                {activeCatalog === 'motifs' && (
                  <DataConfig 
                    collectionName="motifs" 
                    title="Motivos de Cambio" 
                    fields={[ { name: 'name', label: 'Motivo' } ]} 
                    selectedGuild={selectedAdminGuild}
                  />
                )}

                {activeCatalog === 'equipmentTypes' && (
                  <DataConfig 
                    collectionName="equipmentTypes" 
                    title="Tipos de Equipo" 
                    fields={[ { name: 'name', label: 'Tipo' } ]} 
                    selectedGuild={selectedAdminGuild}
                  />
                )}

                {activeCatalog === 'brands' && (
                  <DataConfig 
                    collectionName="brands" 
                    title="Marcas / Modelos de Equipos" 
                    fields={[ 
                      { name: 'name', label: 'Nombre/Modelo' },
                      { name: 'type', label: 'Tipo de Equipo', type: 'select', options: equipmentTypes.map(e => ({ value: e.name, label: e.name })) } 
                    ]} 
                    selectedGuild={selectedAdminGuild}
                  />
                )}

                {activeCatalog === 'employees' && (
                  <DataConfig 
                    collectionName="employees" 
                    title="Personal / Asesores" 
                    fields={[ 
                      { name: 'name', label: 'Nombre Completo' },
                      { name: 'position', label: 'Cargo o Puesto', type: 'select', options: [{value: 'Supervisor', label:'Supervisor'}, {value: 'Administrativo', label:'Administrativo'}] } 
                    ]} 
                    selectedGuild={selectedAdminGuild}
                    extraActions={[
                      { 
                        icon: <PenTool className="w-3.5 h-3.5" />, 
                        title: "Firmar Documentos", 
                        onClick: (item) => setSigningEmployee(item)
                      }
                    ]}
                  />
                )}
             </div>
          </motion.div>
        )}

        {activeTab === 'settings' && (
          <motion.div key="settings" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
             <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm text-slate-900">
               <div className="mb-8">
                 <h3 className="text-xl font-black uppercase tracking-tight">Apariencia del Portal</h3>
                 <p className="text-sm text-slate-500 font-medium">Personaliza el color principal de la plataforma para todo el equipo.</p>
               </div>
               
               <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                 {[
                   { id: 'blue', name: 'Azul', hex: '#2563eb' },
                   { id: 'emerald', name: 'Esmeralda', hex: '#059669' },
                   { id: 'violet', name: 'Violeta', hex: '#7c3aed' },
                   { id: 'rose', name: 'Rosa', hex: '#e11d48' },
                   { id: 'amber', name: 'Ámbar', hex: '#d97706' },
                 ].map(theme => (
                   <button
                     key={theme.id}
                     onClick={() => handleUpdateTheme(theme.id)}
                     className={cn(
                       "flex flex-col items-center gap-3 p-6 rounded-2xl border-2 transition-all",
                       currentTheme === theme.id 
                         ? "border-primary-600 bg-primary-50 shadow-md shadow-primary-600/10" 
                         : "border-slate-100 hover:border-slate-300 bg-white"
                     )}
                   >
                     <div 
                       className="w-12 h-12 rounded-full shadow-inner"
                       style={{ backgroundColor: theme.hex }}
                     />
                     <span className="text-xs font-black uppercase tracking-widest text-slate-700">{theme.name}</span>
                   </button>
                 ))}
               </div>
             </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Signature Modal */}
      <AnimatePresence>
        {signingEmployee && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-slate-800">Firma de Asesor</h3>
                <button onClick={() => setSigningEmployee(null)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5"/></button>
              </div>
              
              <div className="mb-4 space-y-1">
                 <p className="text-sm text-slate-600">Alta de firma para: <strong className="text-slate-800">{signingEmployee.name}</strong></p>
                 {signingEmployee.signatureUrl && (
                   <p className="text-xs text-emerald-600 font-medium">Este asesor ya tiene una firma guardada. Al crear una nueva se sobreescribirá.</p>
                 )}
              </div>

              <div className="border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 relative h-[250px] mb-4">
                <SignatureCanvas 
                  ref={sigCanvas}
                  penColor="black"
                  canvasProps={{ className: 'w-full h-full rounded-xl flex-shrink-0' }}
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={clearSignature}
                  disabled={savingSignature}
                  className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex-1"
                >
                  Limpiar
                </button>
                <button
                  type="button"
                  onClick={handleSaveSignature}
                  disabled={savingSignature}
                  className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors flex-1 flex items-center justify-center shrink-0"
                >
                  {savingSignature ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Guardar Firma'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function TabButton({ active, onClick, icon: Icon, label }: any) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex-none flex justify-center items-center gap-2 px-4 py-2 md:py-2.5 rounded-xl text-[10px] md:text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap",
        active ? "bg-primary-600 text-white shadow-sm" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
      )}
    >
      <Icon className="w-3.5 h-3.5 md:w-4 md:h-4 shrink-0" />
      <span className="">{label}</span>
    </button>
  );
}

function AdminIssueCard({ issue, resolvingId, setResolvingId, resolutionText, setResolutionText, onResolve }: any) {
  return (
     <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="flex-1 space-y-4">
             <div className="flex items-center gap-3">
                <span className={cn(
                  "px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest border",
                  issue.priority === 'critical' ? 'bg-red-50 border-red-200 text-red-600' : 'bg-slate-50 border-slate-200 text-slate-600'
                )}>
                  {issue.priority}
                </span>
                <span className="text-[10px] font-black text-primary-600 uppercase tracking-[0.2em]">{issue.areaName}</span>
                <div className="h-px flex-1 bg-slate-100" />
             </div>
             
             <div>
                <h4 className="text-xl font-black text-slate-900 leading-tight uppercase mb-2">{issue.title}</h4>
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-md bg-primary-50 border border-primary-100 flex items-center justify-center text-primary-600 text-[10px] font-black">
                     {issue.userName?.charAt(0)}
                  </div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-tighter">
                     Reportado por: <span className="text-slate-600">{issue.userName}</span> • {formatDate(issue.createdAt)}
                  </p>
                </div>
             </div>

             <div className="bg-slate-50 p-4 rounded-2xl border-l-4 border-primary-600 text-slate-600 text-sm font-medium italic">
                "{issue.description}"
             </div>
          </div>

          <div className="lg:w-[320px] flex flex-col justify-end">
            <AnimatePresence mode="wait">
              {resolvingId === issue.id ? (
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="space-y-4">
                   <textarea
                    placeholder="Escribe la resolución de la incidencia..."
                    className="w-full p-4 rounded-xl bg-white border border-slate-200 text-slate-900 text-sm font-medium focus:ring-2 focus:ring-primary-500 outline-none resize-none min-h-[100px] placeholder:text-slate-400"
                    value={resolutionText}
                    onChange={e => setResolutionText(e.target.value)}
                  />
                  <div className="flex gap-2 items-center">
                    <button onClick={() => setResolvingId(null)} className="flex-1 py-3 text-[10px] font-black text-slate-500 hover:text-slate-900 uppercase">Cancelar</button>
                    <button onClick={onResolve} className="flex-[2] py-3 bg-primary-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-md shadow-primary-600/20 hover:bg-primary-700 transition-all flex items-center justify-center gap-2">
                       <ArrowRight className="w-4 h-4" />
                       Cerrar Caso
                    </button>
                  </div>
                </motion.div>
              ) : (
                <button
                  onClick={() => setResolvingId(issue.id)}
                  className="w-full py-4 bg-slate-50 hover:bg-primary-600 hover:text-white text-slate-600 rounded-2xl border border-slate-200 font-black uppercase tracking-widest transition-all flex flex-col items-center gap-2 group"
                >
                  <Activity className="w-6 h-6 text-primary-500 group-hover:text-white transition-colors" />
                  <span className="text-xs">Atender Reporte</span>
                </button>
              )}
            </AnimatePresence>
          </div>
        </div>
     </div>
  );
}

function CheckCircle2Icon(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/></svg>
  );
}
