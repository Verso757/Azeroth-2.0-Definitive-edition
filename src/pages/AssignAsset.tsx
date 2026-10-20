import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, doc, writeBatch, serverTimestamp, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../AuthContext';
import { Asset, City, Route, Motif } from '../types';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, RotateCcw, PenTool, AlertTriangle, Activity, Upload, RefreshCw, Loader2, ShieldCheck, Info } from 'lucide-react';
import { cn, normalizeEquipmentType, formatBrandModel } from '../lib/utils';

type Operation = 'assign' | 'return' | 'maintenance' | 'lost' | 'retirement';

const compressImage = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800; // max reasonable size for evidence
        const MAX_HEIGHT = 800;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.6));
      };
    };
    reader.onerror = error => reject(error);
  });
};

export default function AssignAsset() {
  const { id } = useParams();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [asset, setAsset] = useState<Asset | null>(null);

  const [operation, setOperation] = useState<Operation>('assign');
  
  // Assignment states
  const [cities, setCities] = useState<City[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [assignmentTarget, setAssignmentTarget] = useState<'route' | 'employee'>('route');
  const [selectedCity, setSelectedCity] = useState('');
  const [selectedRoute, setSelectedRoute] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [supervisorName, setSupervisorName] = useState('');
  const [notes, setNotes] = useState('');
  const [evidenceBase64, setEvidenceBase64] = useState<string | null>(null);

  const [motifs, setMotifs] = useState<Motif[]>([]);
  const [motifId, setMotifId] = useState('');
  const [routeAssignedAssets, setRouteAssignedAssets] = useState<Asset[]>([]);
  const [replaceMode, setReplaceMode] = useState<'replace' | 'add'>('replace');
  const [previousAsset, setPreviousAsset] = useState<Asset | null>(null);
  const [previousDeviceStatus, setPreviousDeviceStatus] = useState<'maintenance' | 'available' | 'retired'>('maintenance');
  const [checkingPrevious, setCheckingPrevious] = useState(false);

  // Normalizar el tipo del equipo que se está asignando (ej: Celular, Impresora Térmica)
  const deliveringType = asset ? normalizeEquipmentType(asset.type) : '';

  // Activos de la ruta del MISMO tipo (ej: Celular si estamos asignando Celular)
  const sameTypeAssignedAssets = routeAssignedAssets.filter(
    a => deliveringType && normalizeEquipmentType(a.type) === deliveringType && a.id !== id
  );

  // Activos de la ruta de OTRO tipo (ej: Impresora si estamos asignando Celular) -> Quedan 100% protegidos e intactos
  const otherTypeAssignedAssets = routeAssignedAssets.filter(
    a => deliveringType && normalizeEquipmentType(a.type) !== deliveringType && a.id !== id
  );

  useEffect(() => {
    if (!profile || !id) return;
    
    const fetchAsset = async () => {
      try {
        const d = await getDoc(doc(db, 'assets', id));
        if (d.exists()) {
          setAsset({ id: d.id, ...d.data() } as Asset);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    const fetchOptions = async () => {
      try {
        const allowedGuilds = profile.allowedGuilds ? [profile.guildId, ...profile.allowedGuilds] : [profile.guildId];
        const citySnap = await getDocs(query(collection(db, 'cities'), where('guildId', 'in', allowedGuilds.slice(0, 30))));
        setCities(citySnap.docs.map(d => ({ id: d.id, ...d.data() } as City)).sort((a,b) => (a.name || '').localeCompare(b.name || '')));

        const empSnap = await getDocs(query(collection(db, 'employees'), where('guildId', 'in', allowedGuilds.slice(0, 30))));
        setEmployees(empSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a:any, b:any) => (a.name || '').localeCompare(b.name || '')));

        const motifSnap = await getDocs(query(collection(db, 'motifs'), where('guildId', 'in', allowedGuilds.slice(0, 30))));
        setMotifs(motifSnap.docs.map(d => ({ id: d.id, ...d.data() } as Motif)).sort((a,b) => (a.name || '').localeCompare(b.name || '')));
      } catch (err) {
        console.error(err);
      }
    };

    fetchAsset();
    fetchOptions();
  }, [profile, id]);

  useEffect(() => {
    const checkExistingEquipment = async () => {
      if (operation !== 'assign') {
        setRouteAssignedAssets([]);
        setPreviousAsset(null);
        return;
      }
      const targetId = assignmentTarget === 'route' ? selectedRoute : selectedEmployee;
      if (!targetId || !profile) {
        setRouteAssignedAssets([]);
        setPreviousAsset(null);
        return;
      }

      setCheckingPrevious(true);
      try {
        const allowedGuilds = profile.allowedGuilds ? [profile.guildId, ...profile.allowedGuilds] : [profile.guildId];
        // Query assets for this route
        const q = query(
          collection(db, 'assets'),
          where('guildId', 'in', allowedGuilds.slice(0, 30)),
          where('currentRouteId', '==', targetId),
          where('status', '==', 'assigned')
        );
        const snap = await getDocs(q);
        const docsList: Asset[] = snap.docs
          .filter(d => d.id !== id)
          .map(d => ({ id: d.id, ...d.data() } as Asset));
        setRouteAssignedAssets(docsList);
      } catch (err) {
        console.error("Error checking previous assets in AssignAsset:", err);
        setRouteAssignedAssets([]);
      } finally {
        setCheckingPrevious(false);
      }
    };

    checkExistingEquipment();
  }, [operation, assignmentTarget, selectedRoute, selectedEmployee, profile, id]);

  // Vincular previousAsset solo si coincide en TIPO y el usuario eligió reemplazarlo
  useEffect(() => {
    if (replaceMode === 'add') {
      setPreviousAsset(null);
      return;
    }
    if (sameTypeAssignedAssets.length > 0) {
      setPreviousAsset(sameTypeAssignedAssets[0]);
    } else {
      setPreviousAsset(null);
    }
  }, [routeAssignedAssets, replaceMode, deliveringType]);

  useEffect(() => {
    const fetchRoutes = async () => {
      if (!selectedCity || !profile) return;
      try {
        const allowedGuilds = profile.allowedGuilds ? [profile.guildId, ...profile.allowedGuilds] : [profile.guildId];
        const q = query(collection(db, 'routes'), where('guildId', 'in', allowedGuilds.slice(0, 30)), where('cityId', '==', selectedCity));
        const res = await getDocs(q);
        setRoutes(res.docs.map(d => ({ id: d.id, ...d.data() } as Route)).sort((a,b) => (a.name || '').localeCompare(b.name || '')));
      } catch (err) {}
    };
    fetchRoutes();
  }, [selectedCity, profile]);

  // Set default operation based on current status
  useEffect(() => {
    if (asset) {
      if (asset.status === 'available') setOperation('assign');
      else if (asset.status === 'assigned') setOperation('return');
      else setOperation('assign');
    }
  }, [asset]);

  const handleEvidenceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (file.size > 5 * 1024 * 1024) {
       alert("El archivo es demasiado grande. Por favor sube una imagen menor a 5MB.");
       return;
    }

    try {
      const base64 = await compressImage(file);
      setEvidenceBase64(base64);
    } catch(err) {
      alert("Error procesando la imagen de evidencia.");
    }
  };

  const handleAsesorChange = (empId: string) => {
    setSelectedEmployee(empId);
    const emp = employees.find(e => e.id === empId);
    if (emp) setSupervisorName(emp.name);
    else setSupervisorName('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !asset) return;
    
    // validation
    if (operation === 'assign') {
      if (assignmentTarget === 'route' && (!selectedCity || !selectedRoute || !supervisorName)) {
        alert("Selecciona ciudad, ruta y asesor");
        return;
      }
      if (assignmentTarget === 'employee' && !selectedEmployee) {
        alert("Selecciona al personal administrativo / asesor");
        return;
      }
      if (previousAsset && !motifId) {
        alert("Por favor selecciona el Motivo de Cambio para el equipo que se reemplaza.");
        return;
      }
    }

    if ((operation === 'lost' || operation === 'retirement') && !evidenceBase64) {
       alert("Es obligatorio adjuntar evidencia fotográfica para reportes de extravío o baja.");
       return;
    }

    setSubmitting(true);
    try {
      const batch = writeBatch(db);
      
      const city = cities.find(c => c.id === selectedCity);
      const route = routes.find(r => r.id === selectedRoute);
      const employee = employees.find(e => e.id === selectedEmployee);
      const motif = motifs.find(m => m.id === motifId);

      const toStatus = operation === 'assign' ? 'assigned' :
                       operation === 'return' ? 'available' :
                       operation === 'maintenance' ? 'maintenance' :
                       operation === 'retirement' ? 'retired' :
                       operation === 'lost' ? 'lost' : 'available';

      const updateData: any = {
        guildId: asset.guildId || profile.guildId || '',
        status: toStatus,
        updatedAt: serverTimestamp()
      };

      if (operation === 'assign') {
        if (assignmentTarget === 'route') {
          updateData.currentCityId = selectedCity;
          updateData.currentCityName = city?.name;
          updateData.currentRouteId = selectedRoute;
          updateData.currentRouteName = route?.name;
          updateData.currentSupervisor = supervisorName;
        } else {
          updateData.currentCityId = 'N/A';
          updateData.currentCityName = 'Personal Administrativo';
          updateData.currentRouteId = selectedEmployee;
          updateData.currentRouteName = employee?.name || 'Administrativo';
          updateData.currentSupervisor = employee?.name || 'Personal Administrativo';
        }
      } else if (operation === 'return') {
        // Clear assignment
        updateData.currentCityId = null;
        updateData.currentCityName = null;
        updateData.currentRouteId = null;
        updateData.currentRouteName = null;
        updateData.currentSupervisor = null;
      }

      batch.update(doc(db, 'assets', asset.id), updateData);

      const txRouteId = operation === 'assign' ? (assignmentTarget === 'route' ? selectedRoute : selectedEmployee) : (asset.currentRouteId || null);
      const txRouteName = operation === 'assign' ? (assignmentTarget === 'route' ? route?.name : employee?.name) : (asset.currentRouteName || null);
      const txSup = operation === 'assign' ? (assignmentTarget === 'route' ? supervisorName : employee?.name) : (asset.currentSupervisor || null);
      
      const txRef = doc(collection(db, 'asset_transactions'));
      batch.set(txRef, {
        guildId: asset.guildId || profile.guildId || '',
        assetId: asset.id,
        assetUid: asset.uid,
        assetType: asset.type,
        type: operation,
        fromStatus: asset.status,
        toStatus: toStatus,
        routeId: txRouteId,
        routeName: txRouteName,
        supervisorName: txSup,
        notes: notes || (previousAsset ? `Asignado por cambio (Motivo: ${motif?.name || ''})` : 'Movimiento de inventario'),
        evidenceImage: evidenceBase64 || null,
        recordedBy: profile.uid,
        recordedByName: profile.displayName || profile.email,
        createdAt: serverTimestamp()
      });

      // Si se confirmó el reemplazo de un equipo previo del mismo tipo
      if (operation === 'assign' && replaceMode === 'replace' && previousAsset && previousAsset.id !== 'legacy_responsiva') {
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
          routeId: txRouteId,
          routeName: txRouteName,
          supervisorName: txSup,
          notes: `Retirado por cambio de equipo (Motivo: ${motif?.name || notes || 'Cambio'}). Reemplazado por: ${asset.uid}`,
          recordedBy: profile.uid,
          recordedByName: profile.displayName || profile.email,
          createdAt: serverTimestamp()
        });
      }

      // Si fue cambio o asignación con motivo, registrar en equipment_exchanges para reporteo y auditoría
      if (operation === 'assign' && ((replaceMode === 'replace' && previousAsset) || motifId)) {
        const fullBrandName = formatBrandModel(asset.brandName, asset.model);
        const normalizedEquipmentType = normalizeEquipmentType(asset.type);

        const exchangeRef = doc(collection(db, 'equipment_exchanges'));
        batch.set(exchangeRef, {
          guildId: asset.guildId || profile.guildId || '',
          cityId: assignmentTarget === 'route' ? selectedCity : 'N/A',
          cityName: assignmentTarget === 'route' ? (city?.name || '') : 'Administrativo',
          routeId: txRouteId,
          routeName: txRouteName,
          equipmentType: normalizedEquipmentType,
          brandId: asset.brandId || '',
          brandName: fullBrandName,
          motifId: motifId || '',
          motifName: motif?.name || (previousAsset && replaceMode === 'replace' ? 'Cambio de equipo' : 'Asignación inicial'),
          newEquipment: asset.uid || '',
          previousEquipment: (replaceMode === 'replace' && previousAsset) ? previousAsset.uid : null,
          previousEquipmentDetails: (replaceMode === 'replace' && previousAsset) ? `${normalizeEquipmentType(previousAsset.type)} ${formatBrandModel(previousAsset.brandName, previousAsset.model)}` : null,
          previousEquipmentDestination: (replaceMode === 'replace' && previousAsset) ? previousDeviceStatus : null,
          isExchange: replaceMode === 'replace' && !!previousAsset,
          userId: profile.uid,
          userName: profile.displayName || profile.email,
          userEmail: profile.email || '',
          affectedPerson: txSup,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      // Actualizar la responsiva para la ruta (los demás equipos de la ruta se mantienen intactos)
      if (operation === 'assign') {
        const respId = assignmentTarget === 'route' ? selectedRoute : selectedEmployee;
        const responsivaRef = doc(db, 'route_responsivas', respId);
        
        let existingSig = null;
        if (assignmentTarget === 'route') {
           const routeRef = routes.find(r => r.id === selectedRoute);
           if (routeRef && routeRef.employeeId) {
             const emp = employees.find(e => e.id === routeRef.employeeId);
             if (emp && emp.signatureUrl) existingSig = emp.signatureUrl;
           }
        } else {
           if (employee && employee.signatureUrl) {
              existingSig = employee.signatureUrl;
           }
        }

        const fullBrandName = formatBrandModel(asset.brandName, asset.model);
        const normalizedEquipmentType = normalizeEquipmentType(asset.type);

        // Los equipos que se mantienen en la ruta: todos los asignados excepto el retirado
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

        batch.set(responsivaRef, {
          guildId: asset.guildId || profile.guildId || '',
          cityId: assignmentTarget === 'route' ? selectedCity : 'N/A',
          cityName: assignmentTarget === 'route' ? (city?.name || '') : 'Administrativo',
          routeId: respId,
          routeName: (assignmentTarget === 'route' ? route?.name : employee?.name) || '',
          assignedEquipments: allAssignedEquipments,
          equipmentType: allAssignedEquipments.map(e => e.type).join(' + '),
          brandName: allAssignedEquipments.map(e => e.brandName).join(' • '),
          newEquipment: allAssignedEquipments.map(e => e.uid).join(' / '),
          userId: profile.uid,
          userName: profile.displayName || profile.email,
          affectedPerson: txSup,
          ...(existingSig ? { digitalSignature: existingSig } : {}),
          updatedAt: serverTimestamp()
        }, { merge: true });
      }

      await batch.commit();
      navigate('/assets');

    } catch (error: any) {
      console.error(error);
      alert('Error en la transacción: ' + (error?.message || 'Error desconocido'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-500 font-medium">Cargando...</div>;
  if (!asset) return <div className="p-8 text-center text-red-500 font-medium">Activo no encontrado</div>;

  const canDoMaintenance = profile?.role === 'admin' || profile?.role === 'superadmin';

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <button 
          onClick={() => navigate('/assets')}
          className="p-3 bg-white rounded-full hover:bg-slate-50 transition-colors shadow-sm"
        >
          <ArrowLeft className="w-5 h-5 text-slate-600" />
        </button>
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Movimiento de Activo</h1>
          <p className="text-slate-500 mt-1 font-mono">{asset.uid} - {asset.model}</p>
        </div>
      </div>

      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col gap-2">
         <p className="text-sm font-medium text-slate-500 uppercase tracking-widest">Estado Actual</p>
         <div className="flex items-center gap-3">
            <span className={cn(
              "px-3 py-1 text-xs font-bold rounded-full uppercase tracking-wider",
              asset.status === 'available' ? 'bg-emerald-100 text-emerald-800' :
              asset.status === 'assigned' ? 'bg-blue-100 text-blue-800' :
              asset.status === 'maintenance' ? 'bg-amber-100 text-amber-800' :
              asset.status === 'retired' ? 'bg-slate-200 text-slate-800' :
              asset.status === 'lost' ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-800'
            )}>
              {asset.status}
            </span>
            {asset.status === 'assigned' && (
              <span className="text-sm font-bold text-slate-700">
                {asset.currentSupervisor} ({asset.currentRouteName})
              </span>
            )}
         </div>
      </div>

      <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm">
        <form onSubmit={handleSubmit} className="space-y-8">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <button
              type="button"
              onClick={() => { setOperation('assign'); setEvidenceBase64(null); }}
              className={cn("p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all", operation === 'assign' ? 'border-primary-600 bg-primary-50 text-primary-700' : 'border-slate-100 bg-white hover:border-slate-200 hover:bg-slate-50 text-slate-600')}
            >
              <CheckCircle2 className="w-6 h-6" />
              <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-center">Asignar</span>
            </button>
            <button
              type="button"
              onClick={() => { setOperation('return'); setEvidenceBase64(null); }}
              className={cn("p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all", operation === 'return' ? 'border-emerald-600 bg-emerald-50 text-emerald-700' : 'border-slate-100 bg-white hover:border-slate-200 hover:bg-slate-50 text-slate-600')}
            >
              <RotateCcw className="w-6 h-6" />
              <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-center">
                 {asset.status === 'maintenance' ? 'A Disponible' : 'Retornar'}
              </span>
            </button>
            
            {canDoMaintenance && (
              <button
                type="button"
                onClick={() => { setOperation('maintenance'); setEvidenceBase64(null); }}
                className={cn("p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all", operation === 'maintenance' ? 'border-amber-600 bg-amber-50 text-amber-700' : 'border-slate-100 bg-white hover:border-slate-200 hover:bg-slate-50 text-slate-600')}
              >
                <PenTool className="w-6 h-6" />
                <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-center">Mantenimiento</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setOperation('lost')}
              className={cn("p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all", operation === 'lost' ? 'border-red-600 bg-red-50 text-red-700' : 'border-slate-100 bg-white hover:border-slate-200 hover:bg-slate-50 text-slate-600')}
            >
              <AlertTriangle className="w-6 h-6" />
              <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-center">Extraviado</span>
            </button>
            <button
              type="button"
              onClick={() => setOperation('retirement')}
              className={cn("p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all", operation === 'retirement' ? 'border-slate-800 bg-slate-100 text-slate-900' : 'border-slate-100 bg-white hover:border-slate-200 hover:bg-slate-50 text-slate-600')}
            >
              <Activity className="w-6 h-6" />
              <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-center">Baja</span>
            </button>
          </div>

          {operation === 'assign' && (
            <div className="space-y-6 pt-6 border-t border-slate-100">
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
                       <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Ciudad</label>
                       <select 
                         value={selectedCity}
                         onChange={e => setSelectedCity(e.target.value)}
                         className="w-full bg-slate-50 border-transparent rounded-xl px-4 py-3 text-sm font-medium text-slate-900 hover:border-slate-200 focus:border-primary-500 focus:bg-white focus:ring-0 transition-all outline-none"
                       >
                         <option value="">Selecciona Ciudad</option>
                         {cities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                       </select>
                     </div>
                     <div className="space-y-2">
                       <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Asesor</label>
                       <select 
                         value={selectedEmployee}
                         onChange={e => handleAsesorChange(e.target.value)}
                         disabled={!selectedCity}
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
                       value={selectedRoute}
                       onChange={e => setSelectedRoute(e.target.value)}
                       disabled={!selectedCity}
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
                     value={selectedEmployee}
                     onChange={e => setSelectedEmployee(e.target.value)}
                     className="w-full bg-slate-50 border-transparent rounded-xl px-4 py-3 text-sm font-medium text-slate-900 hover:border-slate-200 focus:border-primary-500 focus:bg-white focus:ring-0 transition-all outline-none"
                   >
                     <option value="">Selecciona Personal</option>
                     {employees.map(e => <option key={e.id} value={e.id}>{e.name} {e.position ? `(${e.position})` : ''}</option>)}
                   </select>
                 </div>
               )}

                {/* Detección y protección de equipos en la ruta / asesor */}
                {checkingPrevious && (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex items-center gap-2 text-xs text-slate-500 font-medium">
                    <Loader2 className="w-4 h-4 animate-spin text-primary-500" />
                    Consultando equipos actuales de la ruta...
                  </div>
                )}

                {/* Resumen de inventario actual en la ruta */}
                {!checkingPrevious && ((assignmentTarget === 'route' && selectedRoute) || (assignmentTarget === 'employee' && selectedEmployee)) && routeAssignedAssets.length > 0 && (
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

                {/* Banner de protección para equipos de OTRO tipo (ej: Impresora intacta cuando se asigna Celular) */}
                {!checkingPrevious && ((assignmentTarget === 'route' && selectedRoute) || (assignmentTarget === 'employee' && selectedEmployee)) && otherTypeAssignedAssets.length > 0 && (
                  <div className="p-4 bg-emerald-50/90 border border-emerald-200 rounded-2xl flex items-start gap-3">
                    <div className="p-2 bg-emerald-100 rounded-xl text-emerald-700 shrink-0">
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                    <div className="flex-1 text-xs text-emerald-900">
                      <p className="font-bold text-emerald-950 flex items-center gap-1.5">
                        <span>Equipos protegidos que permanecen asignados:</span>
                      </p>
                      <p className="mt-1 font-medium leading-relaxed">
                        {otherTypeAssignedAssets.map(a => `${normalizeEquipmentType(a.type)} (${formatBrandModel(a.brandName, a.model)} - ${a.uid})`).join(', ')} 
                        <strong> continuará intacto en la ruta</strong>. No será reemplazado ni retirado.
                      </p>
                    </div>
                  </div>
                )}

                {/* Banner de reemplazo / conservación para equipos del MISMO tipo */}
                {!checkingPrevious && sameTypeAssignedAssets.length > 0 && previousAsset && (
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
                {!checkingPrevious && ((assignmentTarget === 'route' && selectedRoute) || (assignmentTarget === 'employee' && selectedEmployee)) && routeAssignedAssets.length === 0 && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-2 text-xs text-emerald-800 font-semibold">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    Esta ruta no cuenta con equipos asignados previamente (Se registrará como entrega / asignación inicial).
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    {previousAsset ? 'Motivo de Cambio (Obligatorio)' : 'Motivo de Asignación (Opcional)'}
                  </label>
                  <select 
                    value={motifId}
                    onChange={e => setMotifId(e.target.value)}
                    required={!!previousAsset}
                    className="w-full bg-slate-50 border-transparent rounded-xl px-4 py-3 text-sm font-medium text-slate-900 hover:border-slate-200 focus:border-primary-500 focus:bg-white focus:ring-0 transition-all outline-none"
                  >
                    <option value="">{previousAsset ? 'Selecciona Motivo de Cambio' : 'Sin motivo específico / Asignación normal'}</option>
                    {motifs.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
            </div>
          )}

          {(operation === 'lost' || operation === 'retirement') && (
            <div className="space-y-6 pt-6 border-t border-slate-100">
               <div className="bg-amber-50 text-amber-800 p-4 rounded-xl text-sm font-medium">
                  Se requiere subir evidencia fotográfica (por ejemplo, reporte FIRMADO de extravío, imagen del daño irreparable del equipo, formato de baja, etc.).
               </div>
               
               <div className="space-y-2">
                   <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Subir Evidencia (Obligatorio)</label>
                   {evidenceBase64 ? (
                      <div className="relative w-full max-w-sm border-2 border-slate-200 rounded-2xl overflow-hidden group">
                         <img src={evidenceBase64} alt="Evidencia" className="w-full h-auto object-cover" />
                         <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <button type="button" onClick={() => setEvidenceBase64(null)} className="text-white font-bold underline bg-black/40 px-3 py-1 rounded-lg">Cambiar Foto</button>
                         </div>
                      </div>
                   ) : (
                      <label className="flex flex-col items-center justify-center w-full max-w-sm h-32 border-2 border-dashed border-slate-300 rounded-2xl cursor-pointer hover:border-primary-400 hover:bg-primary-50 transition-colors">
                        <Upload className="w-6 h-6 text-slate-400 mb-2" />
                        <span className="text-sm font-bold text-slate-500">Haz clic para subir foto</span>
                        <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleEvidenceUpload} />
                      </label>
                    )}
                </div>
             </div>
           )}

          <div className="space-y-2 pt-4 border-t border-slate-100">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Notas Adicionales</label>
            <textarea 
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Razón, número de ticket o detalles de la operación..."
              rows={3}
              required={operation === 'maintenance' || operation === 'lost' || operation === 'retirement'}
              className="w-full bg-slate-50 border-transparent rounded-xl px-4 py-3 text-sm font-medium text-slate-900 hover:border-slate-200 focus:border-primary-500 focus:bg-white focus:ring-0 transition-all outline-none"
            />
          </div>

          <div className="pt-6 border-t border-slate-100 flex justify-end gap-3">
            <button 
              type="submit"
              disabled={submitting}
              className="px-8 py-3 bg-slate-900 hover:bg-black text-white font-bold rounded-xl transition-all shadow-sm disabled:opacity-50"
            >
              {submitting ? 'Procesando...' : 'Confirmar Movimiento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
