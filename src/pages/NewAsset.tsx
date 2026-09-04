import React, { useState, useEffect } from 'react';
import { collection, serverTimestamp, doc, writeBatch, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../AuthContext';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';

const TYPE_OPTIONS = [
  { value: 'printer', label: 'Impresora' },
  { value: 'smartphone', label: 'Celular' },
  { value: 'tablet', label: 'Tablet' },
  { value: 'other', label: 'Otro' }
];

export default function NewAsset() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [equipmentTypes, setEquipmentTypes] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);

  const [type, setType] = useState('smartphone');
  const [brandName, setBrandName] = useState('');
  const [model, setModel] = useState('');
  const [uid, setUid] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!profile) return;
    const qTypes = query(collection(db, 'equipmentTypes'), where('guildId', '==', profile.guildId));
    const unsubTypes = onSnapshot(qTypes, (snapshot) => {
      const types = snapshot.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
      setEquipmentTypes(types);
      if (types.length > 0 && type === 'smartphone') {
        setType(types[0].name);
      }
    });

    const qBrands = query(collection(db, 'brands'), where('guildId', '==', profile.guildId));
    const unsubBrands = onSnapshot(qBrands, (snapshot) => {
      setBrands(snapshot.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
    });

    return () => {
      unsubTypes();
      unsubBrands();
    };
  }, [profile]);

  const handleBrandChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setBrandName(val);
    
    // Auto-select type if brand is known
    const foundBrand = brands.find(b => b.name?.toLowerCase() === val.toLowerCase());
    if (foundBrand && foundBrand.type) {
      setType(foundBrand.type);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSubmitting(true);
    
    try {
      const assetRef = doc(collection(db, 'assets'));
      const batch = writeBatch(db);

      batch.set(assetRef, {
        guildId: profile.guildId,
        type,
        brandName,
        model,
        uid,
        status: 'available',
        notes,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      const txRef = doc(collection(db, 'asset_transactions'));
      batch.set(txRef, {
        guildId: profile.guildId,
        assetId: assetRef.id,
        assetUid: uid,
        assetType: type,
        type: 'entry',
        toStatus: 'available',
        notes: 'Alta manual de activo',
        recordedBy: profile.uid,
        recordedByName: profile.displayName || profile.email,
        createdAt: serverTimestamp()
      });

      await batch.commit();
      navigate('/assets');
    } catch (error) {
      console.error(error);
      alert('Error al registrar el activo');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <button 
          onClick={() => navigate('/assets')}
          className="p-3 bg-white rounded-full hover:bg-slate-50 transition-colors shadow-sm"
        >
          <ArrowLeft className="w-5 h-5 text-slate-600" />
        </button>
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Nuevo Activo</h1>
          <p className="text-slate-500 mt-1">Registra un nuevo equipo al inventario disponible.</p>
        </div>
      </div>

      <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Tipo de Equipo</label>
            <select 
              value={type}
              onChange={e => setType(e.target.value)}
              className="w-full bg-slate-50 border-transparent rounded-xl px-4 py-3 text-sm font-medium text-slate-900 hover:border-slate-200 focus:border-primary-500 focus:bg-white focus:ring-0 transition-all outline-none"
            >
              {equipmentTypes.length > 0 ? (
                Array.from(new Set([...equipmentTypes.map(e => e.name), ...TYPE_OPTIONS.map(o => o.label)])).map(name => {
                  const opt = TYPE_OPTIONS.find(o => o.label === name);
                  const val = opt ? opt.value : name;
                  return <option key={val} value={val}>{name}</option>;
                })
              ) : (
                TYPE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))
              )}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">ID Único (IMEI, MAC, Serie)</label>
              <input 
                type="text" 
                required
                value={uid}
                onChange={e => setUid(e.target.value)}
                placeholder="Ej. 35X8923058..."
                className="w-full bg-slate-50 border-transparent rounded-xl px-4 py-3 text-sm font-medium text-slate-900 hover:border-slate-200 focus:border-primary-500 focus:bg-white focus:ring-0 transition-all outline-none font-mono"
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Marca</label>
              <input 
                type="text" 
                value={brandName}
                onChange={handleBrandChange}
                list="brands-list"
                placeholder="Ej. Zebra, Samsung..."
                className="w-full bg-slate-50 border-transparent rounded-xl px-4 py-3 text-sm font-medium text-slate-900 hover:border-slate-200 focus:border-primary-500 focus:bg-white focus:ring-0 transition-all outline-none"
              />
              <datalist id="brands-list">
                {brands.map(b => (
                  <option key={b.id} value={b.name} />
                ))}
              </datalist>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Modelo</label>
              <input 
                type="text" 
                required
                value={model}
                onChange={e => setModel(e.target.value)}
                placeholder="Ej. ZQ320 Plus..."
                className="w-full bg-slate-50 border-transparent rounded-xl px-4 py-3 text-sm font-medium text-slate-900 hover:border-slate-200 focus:border-primary-500 focus:bg-white focus:ring-0 transition-all outline-none"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Notas Adicionales</label>
            <textarea 
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Detalles sobre el estado del equipo..."
              rows={3}
              className="w-full bg-slate-50 border-transparent rounded-xl px-4 py-3 text-sm font-medium text-slate-900 hover:border-slate-200 focus:border-primary-500 focus:bg-white focus:ring-0 transition-all outline-none"
            />
          </div>

          <div className="pt-6 border-t border-slate-100 flex justify-end gap-3">
            <button 
              type="button"
              onClick={() => navigate('/assets')}
              className="px-6 py-3 text-slate-600 font-bold hover:bg-slate-50 rounded-xl transition-colors"
            >
              Cancelar
            </button>
            <button 
              type="submit"
              disabled={submitting}
              className="px-8 py-3 bg-slate-900 hover:bg-black text-white font-bold rounded-xl transition-all shadow-sm disabled:opacity-50 flex items-center gap-2"
            >
              <Save className="w-5 h-5" />
              {submitting ? 'Guardando...' : 'Guardar Activo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
