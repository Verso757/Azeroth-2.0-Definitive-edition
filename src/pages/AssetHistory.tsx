import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, getDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { Asset, AssetTransaction, OperationType } from '../types';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, Activity, Briefcase, AlertTriangle, ShieldCheck, MapPin } from 'lucide-react';
import { cn } from '../lib/utils';
import { handleFirestoreError } from '../constants';

const TYPE_TRANSLATIONS: Record<string, string> = {
  entry: 'Alta Externa',
  assignment: 'Asignación',
  return: 'Devolución',
  maintenance: 'Mantenimiento',
  retirement: 'Baja',
  lost: 'Extraviado'
};

const STATUS_TRANSLATIONS: Record<string, string> = {
  available: 'Disponible',
  assigned: 'Asignado',
  maintenance: 'En Mantenimiento',
  lost: 'Extraviado',
  retired: 'Baja'
};

const ICONS: Record<string, any> = {
  entry: Briefcase,
  assignment: MapPin,
  return: Clock,
  maintenance: ShieldCheck,
  retirement: Activity,
  lost: AlertTriangle
};

const COLORS: Record<string, string> = {
  entry: 'bg-emerald-100 text-emerald-700',
  assignment: 'bg-blue-100 text-blue-700',
  return: 'bg-slate-100 text-slate-700',
  maintenance: 'bg-amber-100 text-amber-700',
  retirement: 'bg-slate-200 text-slate-700',
  lost: 'bg-red-100 text-red-700'
};

export default function AssetHistory() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [asset, setAsset] = useState<Asset | null>(null);
  const [transactions, setTransactions] = useState<AssetTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    
    // Fetch Asset
    getDoc(doc(db, 'assets', id)).then(d => {
      if (d.exists()) setAsset({ id: d.id, ...d.data() } as Asset);
    }).catch(console.error);

    // Subscribe to transactions
    const q = query(collection(db, 'asset_transactions'), where('assetId', '==', id));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as AssetTransaction[];
      list.sort((a, b) => {
         const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
         const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
         return timeB - timeA; // desc
      });
      setTransactions(list);
      setLoading(false);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'asset_transactions'));

    return () => unsubscribe();
  }, [id]);

  if (loading) return <div className="p-8 text-center text-slate-500 font-medium">Cargando historial...</div>;
  if (!asset) return <div className="p-8 text-center text-red-500 font-medium">Activo no encontrado</div>;

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
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Historial de Activo</h1>
          <p className="text-slate-500 mt-1 font-mono tracking-widest">{asset.uid} - {asset.model}</p>
        </div>
      </div>

      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
         <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-6">Línea de Tiempo de Movimientos</h3>
         
         {transactions.length > 0 ? (
           <div className="space-y-8 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent">
             {transactions.map((tx, idx) => {
               const Icon = ICONS[tx.type] || Activity;
               const bgClass = COLORS[tx.type] || 'bg-slate-100 text-slate-600';
               return (
                 <div key={tx.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                   <div className={cn(" flex items-center justify-center w-10 h-10 rounded-full border-4 border-white shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-sm", bgClass)}>
                     <Icon className="w-4 h-4" />
                   </div>
                   <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-2xl bg-slate-50 border border-slate-100 shadow-sm group-hover:shadow-md transition-shadow">
                     <div className="flex items-center justify-between mb-1">
                       <span className="font-black text-slate-800 uppercase tracking-wider text-xs">{TYPE_TRANSLATIONS[tx.type] || tx.type}</span>
                       <span className="text-xs font-semibold text-slate-400">
                         {tx.createdAt?.toDate ? tx.createdAt.toDate().toLocaleDateString() : ''}
                       </span>
                     </div>
                     
                     <div className="text-sm text-slate-600 space-y-1 mt-3">
                        {tx.type === 'assignment' && (
                          <>
                            <p><strong className="text-slate-800">Asesor:</strong> {tx.supervisorName}</p>
                            <p><strong className="text-slate-800">Ruta:</strong> {tx.routeName}</p>
                          </>
                        )}
                        <p><strong className="text-slate-800">Estado:</strong> {STATUS_TRANSLATIONS[tx.toStatus] || tx.toStatus}</p>
                        {tx.notes && <p className="text-xs mt-2 p-2 bg-white rounded-lg border border-slate-100">{tx.notes}</p>}
                        {tx.evidenceImage && (
                          <div className="mt-2">
                             <a href={tx.evidenceImage} target="_blank" rel="noreferrer" className="inline-block flex items-center gap-1 text-xs font-bold text-primary-600 hover:underline">
                               Ver Evidencia
                             </a>
                             <img src={tx.evidenceImage} alt="Evidencia" className="mt-2 h-24 object-cover rounded-lg border border-slate-200 shadow-sm" />
                          </div>
                        )}
                        <p className="text-xs text-slate-400 mt-2 block break-all">Por: {tx.recordedByName}</p>
                     </div>
                   </div>
                 </div>
               );
             })}
           </div>
         ) : (
           <div className="py-12 text-center text-slate-400 font-medium">No hay movimientos registrados.</div>
         )}
      </div>
    </div>
  );
}
