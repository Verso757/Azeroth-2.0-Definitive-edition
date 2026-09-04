import React, { useState, useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';
import { useAuth } from '../AuthContext';
import { RouteResponsiva, OperationType } from '../types';
import { handleFirestoreError } from '../constants';
import { Printer, Search, MapPin, Upload, FileImage, CheckCircle2, PenTool } from 'lucide-react';
import SignatureCanvas from 'react-signature-canvas';

const compressImage = undefined; // Deleted

export default function Responsivas() {
  const { profile } = useAuth();
  const [responsivas, setResponsivas] = useState<RouteResponsiva[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [printingDoc, setPrintingDoc] = useState<RouteResponsiva | null>(null);
  const [signingDoc, setSigningDoc] = useState<RouteResponsiva | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const sigCanvas = useRef<SignatureCanvas>(null);

  useEffect(() => {
    if (!profile) return;
    
    let q = query(collection(db, 'route_responsivas'));
    if (profile.role !== 'superadmin') {
       const allowedGuilds = Array.from(new Set([profile.guildId, ...(profile.allowedGuilds || [])])).filter(Boolean).slice(0, 30);
       if (allowedGuilds.length > 0) {
         q = query(collection(db, 'route_responsivas'), where('guildId', 'in', allowedGuilds));
       }
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as RouteResponsiva[];
      list.sort((a, b) => {
         const timeA = a.updatedAt?.toMillis ? a.updatedAt.toMillis() : 0;
         const timeB = b.updatedAt?.toMillis ? b.updatedAt.toMillis() : 0;
         return timeB - timeA;
      });
      setResponsivas(list);
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'route_responsivas'));

    return () => unsubscribe();
  }, [profile]);

  const filteredResponsivas = responsivas.filter(r => 
    r.routeName.toLowerCase().includes(searchTerm.toLowerCase()) || 
    r.cityName.toLowerCase().includes(searchTerm.toLowerCase()) || 
    r.affectedPerson.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handlePrint = (r: RouteResponsiva) => {
    setPrintingDoc(r);
    setTimeout(() => {
      window.print();
      setPrintingDoc(null);
    }, 500);
  };

  const handleUploadScan = async (responsivaId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingId(responsivaId);
    try {
      // Create a reference to the file in Firebase Storage
      const storageRef = ref(storage, `responsivas/${responsivaId}/${Date.now()}_${file.name}`);
      
      // Upload the file
      const snapshot = await uploadBytes(storageRef, file);
      
      // Get the download URL
      const downloadURL = await getDownloadURL(snapshot.ref);

      // Update Firestore document securely with the reliable URL
      await updateDoc(doc(db, 'route_responsivas', responsivaId), {
        scannedDocument: downloadURL,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      console.error(err);
      alert('Error al subir la imagen. Por favor, intenta de nuevo.');
    } finally {
      setUploadingId(null);
    }
  };

  const handleSaveSignature = async () => {
    if (!signingDoc || !sigCanvas.current || sigCanvas.current.isEmpty()) {
       alert("Por favor firma antes de guardar.");
       return;
    }
    
    setUploadingId(signingDoc.id);
    try {
      // Get the signature canvas as a blob
      const canvas = sigCanvas.current.getTrimmedCanvas();
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      
      if (!blob) throw new Error("No se pudo generar la imagen de la firma.");

      // Upload signature to Firebase Storage
      const storageRef = ref(storage, `signatures/${signingDoc.id}/${Date.now()}_signature.png`);
      const snapshot = await uploadBytes(storageRef, blob);
      const downloadURL = await getDownloadURL(snapshot.ref);

      await updateDoc(doc(db, 'route_responsivas', signingDoc.id), {
        digitalSignature: downloadURL,
        updatedAt: serverTimestamp()
      });
      setSigningDoc(null);
    } catch (err) {
      console.error(err);
      alert('Error al guardar la firma digital.');
    } finally {
      setUploadingId(null);
    }
  };

  return (
    <div className="space-y-6 relative">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Responsivas por Ruta</h1>
          <p className="text-slate-500 mt-1">Descarga o escanea las responsivas firmadas de cada ruta.</p>
        </div>
      </div>

      <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por ruta, ciudad o asesor..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-slate-50 border-transparent rounded-2xl text-sm focus:border-primary-500 focus:bg-white focus:ring-0 transition-all outline-none"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-40 bg-white rounded-3xl border border-slate-100 animate-pulse" />
          ))
        ) : filteredResponsivas.length > 0 ? (
          filteredResponsivas.map((r) => (
            <div key={r.id} className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col gap-4">
               <div>
                  <div className="flex items-center gap-2 text-primary-600 mb-1">
                    <MapPin className="w-4 h-4" />
                    <span className="text-sm font-bold">{r.cityName}</span>
                  </div>
                  <h3 className="text-lg font-black text-slate-800">{r.routeName}</h3>
               </div>
               
               <div className="text-sm text-slate-600 space-y-1">
                 <p><span className="font-semibold text-slate-800">Asesor:</span> {r.affectedPerson}</p>
                 <p><span className="font-semibold text-slate-800">Equipo:</span> {r.brandName} - {r.equipmentType}</p>
                 <p><span className="font-semibold text-slate-800">Serie/IMEI:</span> {r.newEquipment || 'No registrado'}</p>
                 <p className="text-xs text-slate-400 mt-2">
                    Actualizado: {r.updatedAt?.toDate ? r.updatedAt.toDate().toLocaleDateString() : 'N/A'}
                 </p>
               </div>

               <div className="mt-4 pt-4 border-t border-slate-100 space-y-2">
                 {(r.scannedDocument || r.digitalSignature) ? (
                   <div className="flex items-center justify-between bg-emerald-50 text-emerald-700 px-3 py-2 rounded-xl text-sm font-bold">
                     <span className="flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> Documento Firmado</span>
                     <button onClick={() => setPreviewImage(r.scannedDocument || r.digitalSignature!)} className="underline hover:text-emerald-900">Ver</button>
                   </div>
                 ) : (
                   <div className="flex items-center gap-2 text-amber-600 text-sm font-bold px-3 py-2 bg-amber-50 rounded-xl">
                     <span className="flex items-center gap-1">Falta firma digitalizada</span>
                   </div>
                 )}

                 <div className="flex gap-2 w-full mt-2">
                   <button 
                     onClick={() => handlePrint(r)}
                     title="Imprimir formato en blanco"
                     className="flex-1 flex items-center justify-center py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-colors"
                   >
                     <Printer className="w-4 h-4" />
                   </button>
                   
                   <button 
                     onClick={() => setSigningDoc(r)}
                     title="Firmar"
                     className="flex-[1.5] flex items-center justify-center gap-1 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl font-bold transition-colors"
                   >
                     <PenTool className="w-4 h-4" />
                     <span className="text-xs">Firmar</span>
                   </button>

                   <label className="flex-1 flex items-center justify-center gap-1 py-2 bg-primary-50 hover:bg-primary-100 text-primary-700 rounded-xl font-bold transition-colors cursor-pointer relative overflow-hidden" title="Subir Foto">
                     {uploadingId === r.id ? (
                       <span className="text-xs">...</span>
                     ) : (
                       <>
                         <Upload className="w-4 h-4" />
                         <span className="text-xs">Subir</span>
                         <input 
                           type="file" 
                           accept="image/*" 
                           capture="environment"
                           className="absolute inset-0 opacity-0 cursor-pointer"
                           onChange={(e) => handleUploadScan(r.id, e)}
                           disabled={uploadingId === r.id}
                         />
                       </>
                     )}
                   </label>
                 </div>
               </div>
            </div>
          ))
        ) : (
          <div className="col-span-full py-12 text-center text-slate-400 font-medium">
            No se encontraron responsivas registradas.
          </div>
        )}
      </div>

      {previewImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
          <div className="relative bg-white rounded-3xl overflow-hidden max-w-2xl w-full max-h-[90vh] flex flex-col">
             <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
               <h3 className="font-bold text-slate-800 flex items-center gap-2"><FileImage className="w-5 h-5"/> Vista del Documento</h3>
               <button onClick={() => setPreviewImage(null)} className="text-slate-500 font-bold hover:text-slate-900">
                 Cerrar
               </button>
             </div>
             <div className="p-4 overflow-y-auto flex-1 flex justify-center bg-slate-100">
               <img src={previewImage} alt="Documento escaneado" className="max-w-full h-auto object-contain rounded-xl shadow-sm bg-white" />
             </div>
          </div>
        </div>
      )}

      {signingDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
          <div className="relative bg-white rounded-3xl overflow-hidden max-w-xl w-full flex flex-col max-h-[90vh]">
             <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
               <h3 className="font-bold text-slate-800 flex items-center gap-2"><PenTool className="w-5 h-5"/> Firma Digital</h3>
               <button onClick={() => setSigningDoc(null)} className="text-slate-500 font-bold hover:text-slate-900">
                 Cerrar
               </button>
             </div>
             <div className="p-6 overflow-y-auto bg-slate-100 flex-1 space-y-6">
                <div className="bg-white p-6 rounded-2xl shadow-sm text-sm space-y-4 text-slate-700">
                    <h4 className="font-black text-center text-lg text-slate-900">CARTA RESPONSIVA DE EQUIPO</h4>
                    <p>Por medio de la presente, el Sr(a). <strong>{signingDoc.affectedPerson}</strong>, encargado(a) de la ruta <strong>{signingDoc.routeName}</strong> de la sucursal <strong>{signingDoc.cityName}</strong>, recibe de conformidad el siguiente equipo de trabajo:</p>
                    <ul className="list-disc pl-6 font-medium">
                      <li>Tipo: {signingDoc.equipmentType}</li>
                      <li>Marca/Modelo: {signingDoc.brandName}</li>
                      <li>IMEI/Serie: {signingDoc.newEquipment || 'No registrado'}</li>
                    </ul>
                    <p>Me comprometo a cuidar y mantener en buen estado el equipo que se me entrega, utilizándolo exclusivamente para los fines de la empresa. En caso de daño, pérdida o robo por negligencia, asumiré la responsabilidad correspondiente.</p>
                </div>
                
                <div className="bg-white p-4 rounded-2xl shadow-sm flex flex-col items-center">
                   <p className="text-center text-xs font-bold text-slate-400 mb-3 uppercase tracking-wide">Firma del Asesor ({signingDoc.affectedPerson})</p>
                   <div className="border-2 border-dashed border-slate-300 rounded-xl overflow-hidden w-full h-48 bg-slate-50 cursor-crosshair">
                       <SignatureCanvas 
                          ref={sigCanvas} 
                          penColor="black" 
                          canvasProps={{ className: 'w-full h-full' }} 
                       />
                   </div>
                </div>
             </div>
             <div className="p-4 border-t border-slate-100 bg-white flex justify-end gap-3">
                <button 
                  onClick={() => sigCanvas.current?.clear()}
                  className="px-6 py-2 text-slate-600 font-bold hover:bg-slate-50 rounded-xl transition-colors"
                >
                  Limpiar
                </button>
                <button 
                  onClick={handleSaveSignature}
                  disabled={uploadingId === signingDoc.id}
                  className="px-8 py-2 bg-primary-600 hover:bg-primary-700 text-white font-bold rounded-xl transition-all disabled:opacity-50"
                >
                  {uploadingId === signingDoc.id ? 'Guardando...' : 'Guardar Firma'}
                </button>
             </div>
          </div>
        </div>
      )}

      {/* Seccion de impresión oculta en pantalla usando media query de Tailwind (print:block hidden) */}
      {printingDoc && (
        <div className="hidden print:block fixed inset-0 bg-white text-black p-12 z-50">
          <div className="max-w-3xl mx-auto space-y-8">
            <div className="text-center pb-8 border-b-2 border-black">
              <h1 className="text-3xl font-black uppercase tracking-widest">CARTA RESPONSIVA DE EQUIPO</h1>
              <p className="text-lg mt-2">Entrega y Asignación de Herramientas de Trabajo</p>
            </div>
            
            <div className="space-y-4 text-lg">
               <p>
                 Por medio de la presente, el Sr(a). <strong>{printingDoc.affectedPerson}</strong>, encargado(a) de la 
                 ruta <strong>{printingDoc.routeName}</strong> de la sucursal <strong>{printingDoc.cityName}</strong>, 
                 recibe de conformidad el siguiente equipo de trabajo:
               </p>

               <ul className="list-disc pl-8 space-y-2 font-medium">
                 <li><strong>Tipo de Equipo:</strong> {printingDoc.equipmentType}</li>
                 <li><strong>Marca y Modelo:</strong> {printingDoc.brandName}</li>
                 <li><strong>IMEI / Serie:</strong> {printingDoc.newEquipment || '_______________'}</li>
               </ul>

               <p>
                 Me comprometo a cuidar y mantener en buen estado el equipo que se me entrega, 
                 utilizándolo exclusivamente para los fines de la empresa. En caso de daño, pérdida o robo por negligencia, 
                 asumiré la responsabilidad correspondiente.
               </p>
            </div>

            <div className="pt-24 mt-24 flex justify-between">
               <div className="text-center w-64">
                  <div className="border-t border-black pt-2">
                     <strong>Entrega (Responsable)</strong><br/>
                     {printingDoc.userName}
                  </div>
               </div>
               <div className="text-center w-64 relative flex flex-col items-center">
                  {printingDoc.digitalSignature && (
                    <img src={printingDoc.digitalSignature} alt="Firma" className="absolute bottom-full mb-2 h-20 object-contain w-full" />
                  )}
                  <div className="border-t border-black w-full pt-2">
                     <strong>Recibe (Asesor)</strong><br/>
                     {printingDoc.affectedPerson}
                  </div>
               </div>
            </div>

            <div className="text-sm text-gray-500 text-center mt-12">
               Documento generado el {new Date().toLocaleDateString()} a las {new Date().toLocaleTimeString()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
