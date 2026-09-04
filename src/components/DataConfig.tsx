import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, query, addDoc, deleteDoc, updateDoc, doc, where, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../AuthContext';
import { OperationType } from '../types';
import { handleFirestoreError } from '../constants';
import { Plus, Trash2, Loader2, Database, MapPin, Route, Tags, Tag, MonitorSmartphone, Edit2, Check, X } from 'lucide-react';

interface DataConfigProps {
  collectionName: string;
  title: string;
  fields?: { name: string; label: string; type?: 'text' | 'select'; options?: {value:string, label:string}[] }[];
  parentCollection?: { name: string; localField: string; parentField: string; docNameField: string };
  selectedGuild?: string;
  extraActions?: ({ icon: React.ReactNode; title: string; onClick: (item: any) => void })[];
}

const getIconForCollection = (name: string) => {
  switch (name) {
    case 'cities': return <MapPin className="w-5 h-5 text-slate-400" />;
    case 'routes': return <Route className="w-5 h-5 text-slate-400" />;
    case 'categories': return <Tags className="w-5 h-5 text-slate-400" />;
    case 'motifs': return <Tag className="w-5 h-5 text-slate-400" />;
    case 'brands': return <MonitorSmartphone className="w-5 h-5 text-slate-400" />;
    default: return <Database className="w-5 h-5 text-slate-400" />;
  }
};

export default function DataConfig({ collectionName, title, fields = [], parentCollection, selectedGuild, extraActions }: DataConfigProps) {
  const { profile } = useAuth();
  const [data, setData] = useState<any[]>([]);
  const [parentData, setParentData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Adding new records
  const [submitting, setSubmitting] = useState(false);
  const [newItem, setNewItem] = useState<Record<string, string>>({});
  
  // Filtering
  const [filterParentId, setFilterParentId] = useState<string>('');

  // Editing logic
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editItem, setEditItem] = useState<Record<string, string>>({});
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    if (!profile) return;
    const currentGuild = selectedGuild || profile.guildId;
    
    // Parent Data Load if needed
    if (parentCollection) {
      const qParent = query(collection(db, parentCollection.name), where('guildId', '==', currentGuild));
      const unSubParent = onSnapshot(qParent, (snap) => {
        const pData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        pData.sort((a, b) => (a[parentCollection.parentField] || '').localeCompare(b[parentCollection.parentField] || ''));
        setParentData(pData);
      });
      return () => unSubParent();
    }
  }, [profile, parentCollection, selectedGuild]);

  useEffect(() => {
    if (!profile) return;
    const currentGuild = selectedGuild || profile.guildId;
    
    let q = query(collection(db, collectionName), where('guildId', '==', currentGuild));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setData(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, (error) => {
      console.warn(error);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [profile, collectionName, selectedGuild]);

  const displayData = useMemo(() => {
    let filtered = data;
    if (parentCollection && filterParentId) {
      filtered = data.filter(item => item[parentCollection.localField] === filterParentId);
    }
    return [...filtered].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [data, parentCollection, filterParentId]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    const currentGuild = selectedGuild || profile.guildId;
    
    setSubmitting(true);
    try {
      await addDoc(collection(db, collectionName), {
        ...newItem,
        ...(parentCollection && filterParentId ? { [parentCollection.localField]: filterParentId } : {}),
        guildId: currentGuild,
        createdAt: serverTimestamp()
      });
      setNewItem({});
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, collectionName);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('¿Seguro que deseas eliminar este registro?')) return;
    try {
      await deleteDoc(doc(db, collectionName, id));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, collectionName);
    }
  };

  const startEdit = (item: any) => {
    setEditingId(item.id);
    setEditItem({ ...item });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditItem({});
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setSavingEdit(true);
    try {
      await updateDoc(doc(db, collectionName, editingId), {
        ...editItem,
        updatedAt: serverTimestamp()
      });
      setEditingId(null);
      setEditItem({});
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, collectionName);
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col h-[700px] overflow-hidden">
      <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          {getIconForCollection(collectionName)}
          <h3 className="text-base font-bold text-slate-800 tracking-tight leading-none">{title}</h3>
        </div>
        
        {parentCollection && (
          <select
            value={filterParentId}
            onChange={e => setFilterParentId(e.target.value)}
            className="w-full bg-white border text-sm font-medium border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-indigo-500 transition-colors shadow-sm"
          >
            <option value="">{`Todas las ${parentCollection.docNameField}s`}</option>
            {parentData.map(p => <option key={p.id} value={p.id}>{p[parentCollection.parentField]}</option>)}
          </select>
        )}
      </div>
      
      <div className="p-4 border-b border-slate-100 bg-white">
        <form onSubmit={handleAdd} className="flex gap-2">
          {(!parentCollection || filterParentId) && fields.map(f => (
            <div key={f.name} className="flex-1 min-w-0">
                {f.type === 'select' ? (
                <select
                    required
                    value={newItem[f.name] || ''}
                    onChange={e => setNewItem(prev => ({...prev, [f.name]: e.target.value}))}
                    className="w-full bg-slate-50 border text-sm font-medium border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-indigo-500 transition-colors"
                >
                    <option value="">{f.label}</option>
                    {f.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                ) : (
                <input
                    required
                    type="text"
                    placeholder={f.label}
                    value={newItem[f.name] || ''}
                    onChange={e => setNewItem(prev => ({...prev, [f.name]: e.target.value}))}
                    className="w-full bg-slate-50 border text-sm font-medium border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-indigo-500 transition-colors placeholder:text-slate-400"
                />
                )}
            </div>
          ))}
          {parentCollection && !filterParentId ? (
             <div className="text-xs text-slate-500 flex-1 flex items-center">{`Selecciona un/a ${parentCollection.docNameField} para agregar.`}</div>
          ) : (
            <button
              type="submit"
              disabled={submitting}
              className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-3 flex items-center justify-center shrink-0 shadow-sm disabled:opacity-70 disabled:pointer-events-none transition-colors"
              title="Agregar"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            </button>
          )}
        </form>
      </div>

      {loading ? (
        <div className="flex justify-center p-8 mt-auto"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar bg-slate-50/30">
          {displayData.map(item => (
             <div key={item.id} className="group flex items-center justify-between p-3 rounded-xl bg-white border border-slate-200 shadow-sm text-left hover:border-slate-300 transition-colors">
                {editingId === item.id ? (
                  <div className="flex-1 flex items-center gap-2 pr-2">
                    {fields.map(f => (
                      <div key={f.name} className="flex-1 min-w-0">
                          {f.type === 'select' ? (
                          <select
                              value={editItem[f.name] || ''}
                              onChange={e => setEditItem(prev => ({...prev, [f.name]: e.target.value}))}
                              className="w-full bg-slate-50 border text-sm font-medium border-slate-300 rounded p-1 outline-none focus:border-indigo-500"
                          >
                              <option value="">{f.label}</option>
                              {f.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                          ) : (
                          <input
                              type="text"
                              value={editItem[f.name] || ''}
                              onChange={e => setEditItem(prev => ({...prev, [f.name]: e.target.value}))}
                              className="w-full bg-slate-50 border text-sm font-medium border-slate-300 rounded p-1 outline-none focus:border-indigo-500"
                          />
                          )}
                      </div>
                    ))}
                    <button
                      onClick={saveEdit}
                      disabled={savingEdit}
                      className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded transition-colors shrink-0 disabled:opacity-50"
                    >
                      {savingEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={cancelEdit}
                      disabled={savingEdit}
                      className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors shrink-0 disabled:opacity-50"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-col min-w-0 pr-4">
                      <span className="font-bold text-slate-800 text-sm truncate">{item.name}</span>
                      {parentCollection && !filterParentId && item[parentCollection.localField] && (
                        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider truncate mt-0.5">
                          {parentData.find(p => p.id === item[parentCollection.localField])?.[parentCollection.parentField] || 'Desconocido'}
                        </span>
                      )}
                      <div className="flex flex-wrap gap-2 mt-2">
                          {fields.filter(f => f.name !== 'name' && f.type !== 'select').map(f => (
                            <span key={f.name} className="text-[11px] text-slate-500 truncate">{f.label}: {item[f.name]}</span>
                          ))}
                          {fields.filter(f => f.name !== 'name' && f.type === 'select').map(f => (
                            <div key={f.name} className="flex items-center gap-2 mt-1" onClick={(e) => e.stopPropagation()}>
                              <span className="text-xs text-slate-500 font-bold uppercase tracking-wide">{f.label}</span>
                              <select
                                value={item[f.name] || ''}
                                onChange={async (e) => {
                                  try {
                                    await updateDoc(doc(db, collectionName, item.id), {
                                      [f.name]: e.target.value,
                                      updatedAt: serverTimestamp()
                                    });
                                  } catch (err) {
                                    console.error("Error updating field inline", err);
                                  }
                                }}
                                className="text-sm font-bold text-slate-800 bg-white hover:bg-slate-50 py-2 pl-3 pr-8 rounded-lg border-2 border-slate-200 focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 shadow-sm outline-none cursor-pointer appearance-none transition-all"
                                style={{
                                    backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                                    backgroundPosition: `right 0.5rem center`,
                                    backgroundRepeat: `no-repeat`,
                                    backgroundSize: `1.2em 1.2em`
                                }}
                              >
                                <option value="">(Asignar)</option>
                                {f.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                              </select>
                            </div>
                          ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {extraActions?.map((act, idx) => (
                        <button
                          key={idx}
                          onClick={() => act.onClick(item)}
                          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors shrink-0"
                          title={act.title}
                        >
                          {act.icon}
                        </button>
                      ))}
                      <button
                        onClick={() => startEdit(item)}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors shrink-0"
                        title="Editar"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                        title="Eliminar"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </>
                )}
             </div>
          ))}
          {displayData.length === 0 && (
             <div className="flex flex-col items-center justify-center p-6 text-center h-full">
                <Database className="w-8 h-8 text-slate-200 mb-2" />
                <p className="text-sm font-medium text-slate-500">No hay registros{(parentCollection && filterParentId) ? ' para esta selección' : ''}</p>
             </div>
          )}
        </div>
      )}
    </div>
  );
}
