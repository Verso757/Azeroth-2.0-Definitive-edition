import React, { useState, useEffect } from 'react';
import { collection, addDoc, setDoc, doc, serverTimestamp, getDocs, getDoc, query, where, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../AuthContext';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Loader2, Info, AlertCircle, RefreshCw, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { handleFirestoreError } from '../constants';
import { OperationType, City, Route, Motif, Asset } from '../types';
import { cn, normalizeEquipmentType, formatBrandModel } from '../lib/utils';

export default function NewExchange() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  
  const [cities, setCities] = useState<City[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [motifs, setMotifs] = useState<Motif[]>([]);
  const [availableAssets, setAvailableAssets] = useState<Asset[]>([]);

  // Route assets & exchange detection
  const [routeAssignedAssets, setRouteAssignedAssets] = useState<Asset[]>([]);
  const [replaceMode, setReplaceMode] = useState<'replace' | 'add'>('replace');
  const [previousAsset, setPreviousAsset] = useState<Asset | null>(null);
  const [previousDeviceStatus, setPreviousDeviceStatus] = useState<'maintenance' | 'available' | 'retired'>('maintenance');
  const [checkingPrevious, setCheckingPrevious] = useState(false);

  // Form State
  const [assignmentTarget, setAssignmentTarget] = useState<'route' | 'employee'>('route');
  const [cityId, setCityId] = useState('');
  const [routeId, setRouteId] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [motifId, setMotifId] = useState('');
  const [price, setPrice] = useState('');
  const [affectedPerson, setAffectedPerson] = useState('');
  const [selectedAssetId, setSelectedAssetId] = useState('');

  useEffect(() => {
    if (!profile) return;
    
    // Fetch options
    const fetchOptions = async () => {
      try {
        const adminGuilds = Array.from(new Set([profile.guildId, ...(profile.allowedGuilds || [])])).filter(Boolean).slice(0, 30);
        
        // Fetch cities
        const citySnap = await getDocs(query(collection(db, 'cities'), where('guildId', 'in', adminGuilds)));
        setCities(citySnap.docs.map(d => ({ id: d.id, ...d.data() } as City)).sort((a,b) => (a.name || '').localeCompare(b.name || '')));

        // Fetch employees
        const empSnap = await getDocs(query(collection(db, 'employees'), where('guildId', 'in', adminGuilds)));
        setEmployees(empSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a:any, b:any) => (a.name || '').localeCompare(b.name || '')));

        // Fetch motifs
        const motifSnap = await getDocs(query(collection(db, 'motifs'), where('guildId', 'in', adminGuilds)));
        setMotifs(motifSnap.docs.map(d => ({ id: d.id, ...d.data() } as Motif)).sort((a,b) => (a.name || '').localeCompare(b.name || '')));

        // Fetch available assets
        const assetsSnap = await getDocs(query(collection(db, 'assets'), where('guildId', 'in', adminGuilds), where('status', '==', 'available')));
        setAvailableAssets(assetsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Asset)));

      } catch (e) {
        console.error(e);
      }
    };
    fetchOptions();
  }, [profile]);

  useEffect(() => {
    const fetchRoutes = async () => {
      if (!cityId || !profile) {
        setRoutes([]);
        return;
      }
      try {
        const adminGuilds = Array.from(new Set([profile.guildId, ...(profile.allowedGuilds || [])])).filter(Boolean).slice(0, 30);
        const routeSnap = await getDocs(query(collection(db, 'routes'), where('guildId', 'in', adminGuilds), where('cityId', '==', cityId)));
        const sortedRoutes = routeSnap.docs.map(d => ({ id: d.id, ...d.data() } as Route)).sort((a,b) => (a.name || '').localeCompare(b.name || ''));
        setRoutes(sortedRoutes);
      } catch (e) {
        console.error(e);
      }
    };
    fetchRoutes();
  }, [cityId, profile]);

  const handleAsesorChange = (empId: string) => {
    setEmployeeId(empId);
    const emp = employees.find(e => e.id === empId);
    if (emp) setAffectedPerson(emp.name);
    else setAffectedPerson('');
  };

  useEffect(() => {
    const fetchRouteAssets = async () => {
      const targetId = assignmentTarget === 'route' ? routeId : employeeId;
      if (!targetId || !profile) {
        setRouteAssignedAssets([]);
        setPreviousAsset(null);
        return;
      }

      setCheckingPrevious(true);
      try {
        const adminGuilds = Array.from(new Set([profile.guildId, ...(profile.allowedGuilds || [])])).filter(Boolean).slice(0, 30);
        // Buscar TODOS los activos asignados actualmente a esta ruta o personal
        const q = query(
          collection(db, 'assets'),
          where('guildId', 'in', adminGuilds),
          where('currentRouteId', '==', targetId),
          where('status', '==', 'assigned')
        );
        const snap = await getDocs(q);
        const assetsList: Asset[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as Asset));
        setRouteAssignedAssets(assetsList);
      } catch (err) {
        console.error("Error fetching route assets:", err);
        setRouteAssignedAssets([]);
      } finally {
        setCheckingPrevious(false);
      }
    };

    fetchRouteAssets();
  }, [assignmentTarget, routeId, employeeId, profile]);

  // Identificar el equipo que se va a entregar y su tipo normalizado
  const selectedDeliveringAsset = availableAssets.find(a => a.id === selectedAssetId);
  const deliveringType = selectedDeliveringAsset ? normalizeEquipmentType(selectedDeliveringAsset.type) : '';

  // Activos de la ruta del MISMO tipo (ej: Celular si entregamos Celular)
  const sameTypeAssignedAssets = routeAssignedAssets.filter(
    a => deliveringType && normalizeEquipmentType(a.type) === deliveringType
  );
  // Activos de la ruta de OTRO tipo (ej: Impresora si entregamos Celular) -> Quedan 100% protegidos
  const otherTypeAssignedAssets = routeAssignedAssets.filter(
    a => deliveringType && normalizeEquipmentType(a.type) !== deliveringType
  );

  // Vincular previousAsset solo si coincide en TIPO y se eligió reemplazar
  useEffect(() => {
    if (!selectedAssetId || !selectedDeliveringAsset) {
      setPreviousAsset(null);
      return;
    }

    if (replaceMode === 'add') {
      setPreviousAsset(null);
      return;
    }

    if (sameTypeAssignedAssets.length > 0) {
      setPreviousAsset(sameTypeAssignedAssets[0]);
    } else {
      setPreviousAsset(null);
    }
  }, [selectedAssetId, routeAssignedAssets, replaceMode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !selectedAssetId || !motifId) return;

    if (assignmentTarget === 'route' && (!cityId || !routeId || !affectedPerson)) {
      alert("Por favor selecciona la ciudad, ruta y asesor.");
      return;
    }
    if (assignmentTarget === 'employee' && !employeeId) {
      alert("Por favor selecciona el personal asignado.");
      return;
    }

    setSubmitting(true);
    try {
      const city = cities.find(c => c.id === cityId);
      const route = routes.find(r => r.id === routeId);
      const motif = motifs.find(m => m.id === motifId);
      const asset = availableAssets.find(a => a.id === selectedAssetId);
      const employee = employees.find(e => e.id === employeeId);

      if (!asset) {
         setSubmitting(false);
         alert("Por favor selecciona un activo válido del inventario.");
         return;
      }

      const batch = writeBatch(db);

      const targetCityId = assignmentTarget === 'route' ? cityId : 'N/A';
      const targetCityName = assignmentTarget === 'route' ? (city?.name || '') : 'Administrativo';
      const targetRouteId = assignmentTarget === 'route' ? routeId : employeeId;
      const targetRouteName = assignmentTarget === 'route' ? (route?.name || '') : (employee?.name || 'Administrativo');
      const targetAffectedPerson = assignmentTarget === 'route' ? affectedPerson : (employee?.name || 'Personal Administrativo');

      const fullBrandName = formatBrandModel(asset.brandName, asset.model);
      const normalizedEquipmentType = normalizeEquipmentType(asset.type);

      // 1. Registrar Cambio de Equipo
      const exchangeRef = doc(collection(db, 'equipment_exchanges'));
      batch.set(exchangeRef, {
        guildId: asset.guildId || profile.guildId || '',
        cityId: targetCityId,
        cityName: targetCityName,
        routeId: targetRouteId,
        routeName: targetRouteName,
        equipmentType: normalizedEquipmentType,
        brandId: asset.brandId || '',
        brandName: fullBrandName,
        motifId: motifId || '',
        motifName: motif?.name || '',
        newEquipment: asset.uid || '',
        previousEquipment: (replaceMode === 'replace' && previousAsset) ? previousAsset.uid : null,
        previousEquipmentDetails: (replaceMode === 'replace' && previousAsset) ? `${normalizeEquipmentType(previousAsset.type)} ${formatBrandModel(previousAsset.brandName, previousAsset.model)}` : null,
        previousEquipmentDestination: (replaceMode === 'replace' && previousAsset) ? previousDeviceStatus : null,
        isExchange: replaceMode === 'replace' && !!previousAsset,
        price: price ? parseFloat(price) : null,
        userId: profile.uid || '',
        userName: profile.displayName || profile.email || '',
        userEmail: profile.email || '',
        affectedPerson: targetAffectedPerson,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // 2. Si había equipo anterior del mismo tipo y se eligió reemplazar, actualizar su estatus y registrar transacción
      if (replaceMode === 'replace' && previousAsset && previousAsset.id !== 'legacy_responsiva') {
        const prevAssetRef = doc(db, 'assets', previousAsset.id);
        const prevUpdate: any = {
          status: previousDeviceStatus,
          currentRouteId: null,
          currentRouteName: null,
          currentCityId: null,
          currentCityName: null,
          currentSupervisor: null,
          updatedAt: serverTimestamp(),
        };
        batch.update(prevAssetRef, prevUpdate);

        const prevTxRef = doc(collection(db, 'asset_transactions'));
        batch.set(prevTxRef, {
          guildId: previousAsset.guildId || profile.guildId || '',
          assetId: previousAsset.id,
          assetUid: previousAsset.uid,
          assetType: previousAsset.type,
          type: previousDeviceStatus === 'maintenance' ? 'maintenance' : previousDeviceStatus === 'available' ? 'return' : 'retirement',
          fromStatus: 'assigned',
          toStatus: previousDeviceStatus,
          routeId: targetRouteId,
          routeName: targetRouteName,
          supervisorName: targetAffectedPerson,
          notes: `Retirado por cambio de equipo (Motivo: ${motif?.name || ''}). Reemplazado por: ${asset.uid}`,
          recordedBy: profile.uid || '',
          recordedByName: profile.displayName || profile.email || '',
          createdAt: serverTimestamp()
        });
      }

      // 3. Actualizar la responsiva para la ruta (los demás equipos de la ruta se mantienen intactos)
      const remainingAssets = routeAssignedAssets.filter(
        a => !(replaceMode === 'replace' && previousAsset && a.id === previousAsset.id)
      );
      const newAssetItem = {
        id: asset.id,
        type: normalizedEquipmentType,
        brandName: fullBrandName,
        uid: asset.uid || '',
        assignedAt: new Date().toISOString()
      };
      const allAssignedEquipments = [
        ...remainingAssets.map(a => ({
          id: a.id,
          type: normalizeEquipmentType(a.type),
          brandName: formatBrandModel(a.brandName, a.model),
          uid: a.uid || '',
        })),
        newAssetItem
      ];

      const responsivaRef = doc(db, 'route_responsivas', targetRouteId);
      
      let existingSig = null;
      if (assignmentTarget === 'route') {
         const routeRef = routes.find(r => r.id === routeId);
         if (routeRef && routeRef.employeeId) {
           const emp = employees.find(e => e.id === routeRef.employeeId);
           if (emp && emp.signatureUrl) existingSig = emp.signatureUrl;
         }
      } else {
         if (employee && employee.signatureUrl) {
            existingSig = employee.signatureUrl;
         }
      }

      batch.set(responsivaRef, {
        guildId: asset.guildId || profile.guildId || '',
        cityId: targetCityId,
        cityName: targetCityName,
        routeId: targetRouteId,
        routeName: targetRouteName,
        assignedEquipments: allAssignedEquipments,
        equipmentType: allAssignedEquipments.map(e => e.type).join(' + '),
        brandName: allAssignedEquipments.map(e => e.brandName).join(' • '),
        newEquipment: allAssignedEquipments.map(e => e.uid).join(' / '),
        userId: profile.uid || '',
        userName: profile.displayName || profile.email || '',
        affectedPerson: targetAffectedPerson,
        ...(existingSig ? { digitalSignature: existingSig } : {}),
        updatedAt: serverTimestamp()
      }, { merge: true });

      // 3. Actualizar estado del activo (Asset) a "asignado"
      const assetRef = doc(db, 'assets', selectedAssetId);
      batch.update(assetRef, {
        guildId: asset.guildId || profile.guildId || '',
        status: 'assigned',
        currentRouteId: targetRouteId,
        currentRouteName: targetRouteName,
        currentCityId: targetCityId,
        currentCityName: targetCityName,
        currentSupervisor: targetAffectedPerson,
        updatedAt: serverTimestamp()
      });

      // 4. Registrar transacción del activo (Assignment)
      const txRef = doc(collection(db, 'asset_transactions'));
      batch.set(txRef, {
        guildId: asset.guildId || profile.guildId || '',
        assetId: asset.id || '',
        assetUid: asset.uid || '',
        assetType: asset.type || '',
        type: 'assignment',
        fromStatus: 'available',
        toStatus: 'assigned',
        routeId: routeId || '',
        routeName: route?.name || '',
        supervisorName: affectedPerson || '',
        notes: `Asignado por cambio (Motivo: ${motif?.name || ''})`,
        recordedBy: profile.uid || '',
        recordedByName: profile.displayName || profile.email || '',
        createdAt: serverTimestamp()
      });

      await batch.commit();

      navigate('/exchanges');
    } catch (error: any) {
      handleFirestoreError(error, OperationType.CREATE, 'equipment_exchanges');
      alert('Error al guardar el registro y asignar inventario: ' + (error?.message || 'Error desconocido'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <button 
        onClick={() => navigate('/exchanges')}
        className="flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors font-medium text-sm"
      >
        <ArrowLeft className="w-4 h-4" />
        Volver a Cambios
      </button>

      <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight mb-2">Registrar Cambio de Equipo</h1>
          <p className="text-slate-500">Asigna un equipo del inventario y genera la responsiva.</p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
           <div className="flex gap-4 mb-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" checked={assignmentTarget === 'route'} onChange={() => setAssignmentTarget('route')} className="text-primary-600 focus:ring-primary-500" />
                <span className="text-sm font-bold text-slate-700">Asignar a Ruta</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" checked={assignmentTarget === 'employee'} onChange={() => setAssignmentTarget('employee')} className="text-primary-600 focus:ring-primary-500" />
                <span className="text-sm font-bold text-slate-700">Asignar a Personal</span>
              </label>
           </div>

           {assignmentTarget === 'route' ? (
             <>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                   <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Sucursal / Ciudad</label>
                   <select 
                     value={cityId}
                     onChange={e => setCityId(e.target.value)}
                     className="w-full bg-slate-50 border-transparent rounded-xl px-4 py-3 text-sm font-medium text-slate-900 hover:border-slate-200 focus:border-primary-500 focus:bg-white focus:ring-0 transition-all outline-none"
                   >
                     <option value="">Selecciona Ciudad</option>
                     {cities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                   </select>
                 </div>
                 <div className="space-y-2">
                   <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Asesor</label>
                   <select 
                     value={employeeId}
                     onChange={e => handleAsesorChange(e.target.value)}
                     disabled={!cityId}
                     className="w-full bg-slate-50 border-transparent rounded-xl px-4 py-3 text-sm font-medium text-slate-900 hover:border-slate-200 focus:border-primary-500 focus:bg-white focus:ring-0 transition-all outline-none disabled:opacity-50"
                   >
                     <option value="">Selecciona Asesor</option>
                     {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                   </select>
                 </div>
               </div>

               <div className="space-y-2">
                 <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Ruta</label>
                 <select 
                   value={routeId}
                   onChange={e => setRouteId(e.target.value)}
                   disabled={!cityId}
                   className="w-full bg-slate-50 border-transparent rounded-xl px-4 py-3 text-sm font-medium text-slate-900 hover:border-slate-200 focus:border-primary-500 focus:bg-white focus:ring-0 transition-all outline-none disabled:opacity-50"
                 >
                   <option value="">Selecciona Ruta</option>
                   {routes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                 </select>
               </div>
             </>
           ) : (
             <div className="space-y-2">
               <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Personal Administrativo / Asesor</label>
               <select 
                 value={employeeId}
                 onChange={e => setEmployeeId(e.target.value)}
                 className="w-full bg-slate-50 border-transparent rounded-xl px-4 py-3 text-sm font-medium text-slate-900 hover:border-slate-200 focus:border-primary-500 focus:bg-white focus:ring-0 transition-all outline-none"
               >
                 <option value="">Selecciona Personal</option>
                 {employees.map(e => <option key={e.id} value={e.id}>{e.name} {e.position ? `(${e.position})` : ''}</option>)}
               </select>
             </div>
           )}

          {/* Current equipment detection & inventory status */}
          <div className="space-y-4 pt-2">
            {checkingPrevious && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex items-center gap-2 text-xs text-slate-500 font-medium">
                <Loader2 className="w-4 h-4 animate-spin text-primary-500" />
                Consultando equipos actuales de la ruta...
              </div>
            )}

            {/* Resumen de inventario actual en la ruta */}
            {!checkingPrevious && ((assignmentTarget === 'route' && routeId) || (assignmentTarget === 'employee' && employeeId)) && routeAssignedAssets.length > 0 && (
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    📦 Inventario actual en esta ruta ({routeAssignedAssets.length})
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {routeAssignedAssets.map(item => {
                    const isSameType = deliveringType && normalizeEquipmentType(item.type) === deliveringType;
                    return (
                      <div 
                        key={item.id} 
                        className={cn(
                          "p-2.5 rounded-xl border text-xs flex items-center justify-between gap-2",
                          isSameType 
                            ? "bg-amber-50/70 border-amber-200 text-amber-900" 
                            : "bg-white border-slate-200 text-slate-700"
                        )}
                      >
                        <div className="min-w-0">
                          <p className="font-bold truncate">
                            {normalizeEquipmentType(item.type)}: {formatBrandModel(item.brandName, item.model)}
                          </p>
                          <p className="text-[11px] font-mono text-slate-500 truncate">
                            S/N: {item.uid}
                          </p>
                        </div>
                        <span className={cn(
                          "text-[10px] font-black uppercase px-2 py-0.5 rounded-md shrink-0",
                          isSameType 
                            ? "bg-amber-200 text-amber-900" 
                            : "bg-emerald-100 text-emerald-800"
                        )}>
                          {isSameType ? 'Mismo Tipo' : 'Protegido'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Equipo a Entregar (Disponible)</label>
                <select
                  value={selectedAssetId}
                  onChange={e => setSelectedAssetId(e.target.value)}
                  required
                  className="w-full bg-slate-50 border-transparent rounded-xl px-4 py-3 text-sm font-medium text-slate-900 hover:border-slate-200 focus:border-primary-500 focus:bg-white focus:ring-0 transition-all outline-none"
                >
                  <option value="">Selecciona Inventario Disponible</option>
                  {availableAssets.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.type} - {a.brandName || a.model} (S/N: {a.uid})
                    </option>
                  ))}
                </select>
                {availableAssets.length === 0 && (
                  <p className="text-xs text-red-500 font-bold mt-1">No hay equipos disponibles en inventario.</p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Motivo de Cambio</label>
                <select 
                  value={motifId}
                  onChange={e => setMotifId(e.target.value)}
                  required
                  className="w-full bg-slate-50 border-transparent rounded-xl px-4 py-3 text-sm font-medium text-slate-900 hover:border-slate-200 focus:border-primary-500 focus:bg-white focus:ring-0 transition-all outline-none"
                >
                  <option value="">Selecciona Motivo</option>
                  {motifs.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Valor Declarado (Op.)</label>
                <input 
                  type="number" 
                  step="0.01"
                  min="0"
                  value={price}
                  onChange={e => setPrice(e.target.value)}
                  placeholder="$0.00"
                  className="w-full bg-slate-50 border-transparent rounded-xl px-4 py-3 text-sm font-medium text-slate-900 hover:border-slate-200 focus:border-primary-500 focus:bg-white focus:ring-0 transition-all outline-none"
                />
              </div>
            </div>

            {/* Banner de protección para equipos de OTRO tipo (ej: Impresora intacta cuando se entrega Celular) */}
            {!checkingPrevious && selectedAssetId && otherTypeAssignedAssets.length > 0 && (
              <div className="p-4 bg-emerald-50/90 border border-emerald-200 rounded-2xl flex items-start gap-3">
                <div className="p-2 bg-emerald-100 rounded-xl text-emerald-700 shrink-0">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div className="flex-1 text-xs text-emerald-900">
                  <p className="font-bold text-emerald-950 flex items-center gap-1.5">
                    <span>Equipos protegidos que permanecen asignados a la ruta:</span>
                  </p>
                  <p className="mt-1 font-medium leading-relaxed">
                    {otherTypeAssignedAssets.map(a => `${normalizeEquipmentType(a.type)} (${formatBrandModel(a.brandName, a.model)} - ${a.uid})`).join(', ')} 
                    <strong> continuará intacto en la ruta</strong>. No será reemplazado ni retirado.
                  </p>
                </div>
              </div>
            )}

            {/* Banner de reemplazo / conservación para equipos del MISMO tipo */}
            {!checkingPrevious && selectedAssetId && sameTypeAssignedAssets.length > 0 && previousAsset && (
              <div className="p-4 bg-amber-50/90 border border-amber-200 rounded-2xl space-y-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-amber-100 rounded-xl text-amber-700 shrink-0">
                    <RefreshCw className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 text-[11px] font-black uppercase tracking-wider bg-amber-200 text-amber-900 rounded-md">
                        {deliveringType} anterior detectado
                      </span>
                    </div>
                    <p className="text-sm font-black text-slate-900 mt-1">
                      {normalizeEquipmentType(previousAsset.type)}: {formatBrandModel(previousAsset.brandName, previousAsset.model)}
                    </p>
                    <p className="text-xs font-mono text-slate-600 mt-0.5">
                      S/N o IMEI: <span className="font-bold">{previousAsset.uid}</span>
                    </p>
                  </div>
                </div>

                <div className="pt-2 border-t border-amber-200/60 space-y-3">
                  <label className="text-xs font-bold text-amber-950 block">
                    ¿Qué deseas hacer con el {deliveringType} anterior de la ruta?
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setReplaceMode('replace')}
                      className={cn(
                        "p-3 rounded-xl border text-left text-xs transition-all",
                        replaceMode === 'replace'
                          ? "bg-amber-100 border-amber-400 font-bold text-amber-950 ring-2 ring-amber-400"
                          : "bg-white border-amber-200 text-slate-700 hover:bg-amber-50/50"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-3.5 h-3.5 rounded-full border-2 border-amber-600 flex items-center justify-center">
                          {replaceMode === 'replace' && <span className="w-2 h-2 rounded-full bg-amber-600" />}
                        </span>
                        <span className="font-bold">Reemplazar {deliveringType}</span>
                      </div>
                      <p className="text-[11px] text-slate-600 mt-1 pl-5 font-normal">
                        Retira el equipo anterior ({previousAsset.uid}) de la ruta.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setReplaceMode('add')}
                      className={cn(
                        "p-3 rounded-xl border text-left text-xs transition-all",
                        replaceMode === 'add'
                          ? "bg-emerald-100 border-emerald-400 font-bold text-emerald-950 ring-2 ring-emerald-400"
                          : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-3.5 h-3.5 rounded-full border-2 border-emerald-600 flex items-center justify-center">
                          {replaceMode === 'add' && <span className="w-2 h-2 rounded-full bg-emerald-600" />}
                        </span>
                        <span className="font-bold">Conservar ambos ({deliveringType} adicional)</span>
                      </div>
                      <p className="text-[11px] text-slate-600 mt-1 pl-5 font-normal">
                        No retira nada; mantiene ambos activos en la ruta.
                      </p>
                    </button>
                  </div>

                  {replaceMode === 'replace' && (
                    <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-amber-100/60 p-3 rounded-xl border border-amber-300">
                      <label className="text-xs font-bold text-amber-900">
                        ¿Qué destino tendrá el equipo retirado ({previousAsset.uid})?
                      </label>
                      <select
                        value={previousDeviceStatus}
                        onChange={(e) => setPreviousDeviceStatus(e.target.value as any)}
                        className="bg-white border border-amber-300 text-slate-800 text-xs font-bold rounded-xl px-3 py-2 outline-none focus:border-amber-500 shadow-sm"
                      >
                        <option value="maintenance">🛠️ Enviar a Taller / Mantenimiento</option>
                        <option value="available">📦 Reingresar a Inventario Disponible</option>
                        <option value="retired">❌ Dar de Baja / Retirar</option>
                      </select>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Ruta sin ningún equipo previo */}
            {!checkingPrevious && selectedAssetId && ((assignmentTarget === 'route' && routeId) || (assignmentTarget === 'employee' && employeeId)) && routeAssignedAssets.length === 0 && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-2 text-xs text-emerald-800 font-semibold">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                Esta ruta no cuenta con equipos asignados previamente (Se registrará como entrega / asignación inicial).
              </div>
            )}
          </div>

          <div className="pt-6 border-t border-slate-100 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => navigate('/exchanges')}
              className="px-6 py-3 font-bold text-sm text-slate-600 hover:bg-slate-50 rounded-xl transition-colors uppercase tracking-widest"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || availableAssets.length === 0}
              className="flex items-center gap-2 px-8 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-bold text-sm transition-all shadow-lg shadow-primary-500/20 disabled:opacity-50 uppercase tracking-widest"
            >
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              Guardar y Generar PDF
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
