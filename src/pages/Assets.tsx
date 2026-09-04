import React, { useState, useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot, writeBatch, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../AuthContext';
import { Asset, OperationType } from '../types';
import { handleFirestoreError } from '../constants';
import { Search, Plus, Upload, Filter, MonitorSmartphone } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import Papa from 'papaparse';
import { cn } from '../lib/utils';
import { LayoutDashboard } from 'lucide-react';

const TYPE_TRANSLATIONS: Record<string, string> = {
  printer: 'Impresora',
  smartphone: 'Celular',
  tablet: 'Tablet',
  other: 'Otro'
};

const STATUS_TRANSLATIONS: Record<string, string> = {
  available: 'Disponible',
  assigned: 'Asignado',
  maintenance: 'En Mantenimiento',
  lost: 'Extraviado',
  retired: 'Baja'
};

const STATUS_CLASSES: Record<string, string> = {
  available: 'bg-emerald-100 text-emerald-800',
  assigned: 'bg-blue-100 text-blue-800',
  maintenance: 'bg-amber-100 text-amber-800',
  lost: 'bg-red-100 text-red-800',
  retired: 'bg-slate-200 text-slate-800'
};

export default function Assets() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [equipmentTypes, setEquipmentTypes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilt, setTypeFilt] = useState('all');
  const [statusFilt, setStatusFilt] = useState('all');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    if (!profile) return;
    
    // Load equipment types
    const typesQ = query(collection(db, 'equipmentTypes'), where('guildId', '==', profile.guildId));
    const unsubTypes = onSnapshot(typesQ, (snap) => setEquipmentTypes(snap.docs.map(d => ({id: d.id, ...d.data()}))));

    let q = query(collection(db, 'assets'));
    if (profile.role !== 'superadmin') {
       const allowedGuilds = Array.from(new Set([profile.guildId, ...(profile.allowedGuilds || [])])).filter(Boolean).slice(0, 30);
       if (allowedGuilds.length > 0) {
         q = query(collection(db, 'assets'), where('guildId', 'in', allowedGuilds));
       }
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Asset[];
      list.sort((a, b) => {
         const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
         const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
         return timeB - timeA;
      });
      setAssets(list);
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'assets'));

    return () => {
      unsubscribe();
      unsubTypes();
    };
  }, [profile]);

  const filteredAssets = assets.filter(asset => {
    const matchesSearch = asset.uid.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          asset.model.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (asset.brandName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (asset.currentSupervisor || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (asset.currentRouteName || '').toLowerCase().includes(searchTerm.toLowerCase());
    
    if (!matchesSearch) return false;
    if (typeFilt !== 'all' && asset.type !== typeFilt) return false;
    if (statusFilt !== 'all' && asset.status !== statusFilt) return false;
    
    return true;
  });

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;

    setIsImporting(true);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const batch = writeBatch(db);
          let count = 0;
          for (const row of results.data as any[]) {
            if (!row.uid || !row.type || !row.model) continue; // uid, type, model req
            const newRef = doc(collection(db, 'assets'));
            
            const typeLower = row.type.toLowerCase().trim();
            let parsedType = 'other';
            if (typeLower.includes('impresora') || typeLower.includes('printer')) parsedType = 'printer';
            else if (typeLower.includes('cel') || typeLower.includes('smartphone')) parsedType = 'smartphone';
            else if (typeLower.includes('tablet')) parsedType = 'tablet';

            batch.set(newRef, {
              guildId: profile.guildId,
              type: parsedType,
              brandName: row.brandName || '',
              model: row.model || '',
              uid: row.uid || '',
              status: 'available',
              notes: row.notes || 'Importado desde CSV',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            });
            count++;
          }
          if (count > 0) {
            await batch.commit();
            alert(`Se importaron ${count} activos exitosamente.`);
          } else {
            alert('No se encontraron registros válidos. Verifica que las columnas uid, type y model existan.');
          }
        } catch (error) {
          console.error(error);
          alert('Error al importar activos.');
        } finally {
          setIsImporting(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      },
      error: (error) => {
        console.error(error);
        alert('Error leyendo el archivo CSV.');
        setIsImporting(false);
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Inventario de Activos</h1>
          <p className="text-slate-500 mt-1">Gestiona impresoras, celulares, tablets y más.</p>
        </div>
        <div className="flex items-center gap-2">
          <button 
            disabled={isImporting}
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-3 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-50"
          >
            <Upload className="w-5 h-5" />
            {isImporting ? 'Importando...' : 'Importar CSV'}
          </button>
          <input 
            type="file" 
            accept=".csv" 
            className="hidden" 
            ref={fileInputRef} 
            onChange={handleImportCSV} 
          />
          <Link
            to="/new-asset"
            className="flex items-center gap-2 px-4 py-3 bg-primary-600 text-white rounded-xl font-bold hover:bg-primary-700 transition-colors shadow-sm"
          >
            <Plus className="w-5 h-5" />
            Nuevo Activo
          </Link>
        </div>
      </div>

      <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100 flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por IMEI, MAC, modelo o asesor..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-slate-50 border-transparent rounded-2xl text-sm focus:border-primary-500 focus:bg-white focus:ring-0 transition-all outline-none"
          />
        </div>
        
        <div className="flex gap-2">
          <select 
            value={typeFilt}
            onChange={e => setTypeFilt(e.target.value)}
            className="bg-slate-50 border-transparent rounded-2xl px-4 py-3 text-sm font-bold text-slate-600 outline-none hover:border-slate-200 focus:border-primary-500 cursor-pointer"
          >
            <option value="all">Tipos: Todos</option>
            {equipmentTypes.length > 0 ? (
              Array.from(new Set([...equipmentTypes.map(e => e.name), ...Object.values(TYPE_TRANSLATIONS)])).map(name => {
                const k = Object.keys(TYPE_TRANSLATIONS).find(key => TYPE_TRANSLATIONS[key] === name);
                const val = k ? k : name;
                return <option key={val} value={val}>{name}</option>;
              })
            ) : (
              Object.entries(TYPE_TRANSLATIONS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))
            )}
          </select>
          
          <select 
            value={statusFilt}
            onChange={e => setStatusFilt(e.target.value)}
            className="bg-slate-50 border-transparent rounded-2xl px-4 py-3 text-sm font-bold text-slate-600 outline-none hover:border-slate-200 focus:border-primary-500 cursor-pointer"
          >
            <option value="all">Estado: Todos</option>
            {Object.entries(STATUS_TRANSLATIONS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">ID (IMEI/MAC)</th>
                <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Tipo / Modelo</th>
                <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Estado</th>
                <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Asignación</th>
                <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-400">Cargando inventario...</td>
                </tr>
              ) : filteredAssets.length > 0 ? (
                filteredAssets.map(asset => (
                  <tr key={asset.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-mono text-sm font-bold text-slate-900">{asset.uid}</p>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary-50 flex items-center justify-center text-primary-600 flex-shrink-0">
                          <MonitorSmartphone className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 leading-tight">{asset.model}</p>
                          <p className="text-sm text-slate-500 font-medium">{asset.brandName || '-'} • {equipmentTypes.find(et => et.name === asset.type)?.name || TYPE_TRANSLATIONS[asset.type] || asset.type}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn("px-3 py-1 text-xs font-bold rounded-full uppercase tracking-wider", STATUS_CLASSES[asset.status] || 'bg-slate-100 text-slate-800')}>
                        {STATUS_TRANSLATIONS[asset.status] || asset.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {asset.status === 'assigned' ? (
                        <div>
                          <p className="font-bold text-slate-800 text-sm">{asset.currentSupervisor || 'Sin Asesor'}</p>
                          <p className="text-xs text-slate-500">{asset.currentRouteName || 'Sin Ruta'} • {asset.currentCityName || 'Sin Ciudad'}</p>
                        </div>
                      ) : (
                        <span className="text-sm text-slate-400 font-medium">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                         <button 
                           onClick={() => navigate(`/assign-asset/${asset.id}`)}
                           className="text-primary-600 hover:text-primary-800 text-sm font-bold bg-primary-50 hover:bg-primary-100 px-3 py-1.5 rounded-lg transition-colors"
                         >
                           Movimiento
                         </button>
                         <button 
                           onClick={() => navigate(`/asset-history/${asset.id}`)}
                           className="text-slate-600 hover:text-slate-800 text-sm font-bold bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors"
                         >
                           Historial
                         </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-400 font-medium">No se encontraron activos.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
