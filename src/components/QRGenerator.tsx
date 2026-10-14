import React, { useState, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { City, Area, Employee } from '../types';
import { QrCode, Printer, Copy, Check, ExternalLink, MapPin, LayoutGrid, Users, Download, Sparkles } from 'lucide-react';

interface QRGeneratorProps {
  guildId: string;
  guildName?: string;
  cities: City[];
  areas: Area[];
  employees: Employee[];
}

export default function QRGenerator({ guildId, guildName, cities, areas, employees }: QRGeneratorProps) {
  const [selectedCityId, setSelectedCityId] = useState<string>(cities[0]?.id || '');
  const [selectedAreaId, setSelectedAreaId] = useState<string>(areas[0]?.id || '');
  const [copied, setCopied] = useState(false);

  // Selected city & area details
  const currentCity = cities.find(c => c.id === selectedCityId) || cities[0];
  const currentArea = areas.find(a => a.id === selectedAreaId) || areas[0];

  // Integrantes for this specific City & Area
  const assignedEmployees = employees.filter(e => {
    const matchCity = !e.cityId || e.cityId === currentCity?.id;
    const matchArea = !e.areaId || e.areaId === currentArea?.id;
    return (e.cityId === currentCity?.id && e.areaId === currentArea?.id) || 
           (e.cityId === currentCity?.id && !e.areaId) ||
           (!e.cityId && e.areaId === currentArea?.id);
  });

  const exactAssignedEmployees = employees.filter(e => e.cityId === currentCity?.id && e.areaId === currentArea?.id);

  // QR Target URL
  const origin = window.location.origin;
  const qrUrl = `${origin}/quick-report?guild=${encodeURIComponent(guildId)}&city=${encodeURIComponent(currentCity?.id || '')}&area=${encodeURIComponent(currentArea?.id || '')}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(qrUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Por favor permite las ventanas emergentes para imprimir.');
      return;
    }

    const svgElement = document.getElementById('qr-printable-svg');
    const svgData = svgElement ? new XMLSerializer().serializeToString(svgElement) : '';
    const svgBase64 = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>QR de Reporte - ${currentArea?.name || 'Área'} (${currentCity?.name || 'Ciudad'})</title>
          <style>
            @page { size: portrait; margin: 15mm; }
            * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
            body { margin: 0; padding: 20px; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 90vh; background: #fff; }
            .card {
              border: 3px solid #0f172a;
              border-radius: 28px;
              padding: 40px;
              width: 100%;
              max-width: 520px;
              text-align: center;
              box-shadow: 0 10px 30px rgba(0,0,0,0.06);
            }
            .brand { font-size: 13px; font-weight: 900; letter-spacing: 3px; color: #64748b; text-transform: uppercase; margin-bottom: 8px; }
            .title { font-size: 26px; font-weight: 900; color: #0f172a; line-height: 1.15; text-transform: uppercase; margin: 0 0 16px 0; }
            .badges { display: flex; justify-content: center; gap: 10px; margin-bottom: 24px; }
            .badge {
              display: inline-block;
              padding: 6px 14px;
              border-radius: 12px;
              font-size: 12px;
              font-weight: 800;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            .badge-city { background: #f1f5f9; color: #334155; border: 1px solid #cbd5e1; }
            .badge-area { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; }
            .qr-wrapper {
              background: #fff;
              border: 2px solid #e2e8f0;
              border-radius: 20px;
              padding: 24px;
              display: inline-block;
              margin-bottom: 24px;
            }
            .qr-wrapper img { width: 220px; height: 220px; display: block; }
            .instructions { font-size: 14px; color: #334155; font-weight: 600; line-height: 1.5; margin-bottom: 12px; }
            .step-list { text-align: left; background: #f8fafc; border-radius: 14px; padding: 14px 20px; font-size: 12px; color: #475569; margin-bottom: 20px; }
            .step-list li { margin-bottom: 4px; font-weight: 600; }
            .footer { font-size: 10px; color: #94a3b8; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="brand">${guildName || guildId} • AZEROTH SOPORTE</div>
            <h1 class="title">Punto de Reporte de Incidencias</h1>
            <div class="badges">
              <span class="badge badge-city">📍 ${currentCity?.name || 'Ciudad'}</span>
              <span class="badge badge-area">🏢 ${currentArea?.name || 'División'}</span>
            </div>
            <div class="qr-wrapper">
              <img src="${svgBase64}" alt="Código QR" />
            </div>
            <div class="instructions">
              ¿Falla en equipos, sistemas o herramientas?
            </div>
            <ol class="step-list">
              <li>Abre la cámara de cualquier celular (no requiere app).</li>
              <li>Escanea este código QR.</li>
              <li>Selecciona tu nombre de la lista de integrantes del área y envía tu reporte en 30 segundos.</li>
            </ol>
            <div class="footer">Sistema Operativo de Mantenimiento e Incidencias</div>
          </div>
          <script>
            setTimeout(() => {
              window.print();
              setTimeout(() => { window.close(); }, 500);
            }, 500);
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="bg-gradient-to-r from-primary-600 via-primary-700 to-indigo-700 rounded-3xl p-6 text-white shadow-xl shadow-primary-600/20 relative overflow-hidden">
        <div className="relative z-10 space-y-2 max-w-2xl">
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-[10px] font-black uppercase tracking-widest text-white border border-white/20">
              Control en Sitio
            </span>
            <span className="text-primary-200 text-xs font-bold">• 0 Dispositivos dedicados requeridos</span>
          </div>
          <h2 className="text-2xl lg:text-3xl font-black tracking-tight">Códigos QR por Ciudad y División</h2>
          <p className="text-primary-100 text-sm leading-relaxed font-medium">
            Imprime y pega estos códigos en las estaciones de trabajo de tus sucursales. Al escanearlo con cualquier teléfono personal,
            el sistema pre-selecciona automáticamente la Ciudad y el Área, mostrando la lista de integrantes registrados para levantar un ticket en segundos.
          </p>
        </div>
        <QrCode className="absolute top-1/2 right-6 -translate-y-1/2 w-48 h-48 text-white/10 pointer-events-none" />
      </div>

      {/* Selectors and Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Controls Column */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-5">
            <h3 className="text-base font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary-600" /> Configurar Punto QR
            </h3>

            {/* City Selector */}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-primary-500" /> 1. Selecciona Ciudad / Sucursal
              </label>
              <select
                value={selectedCityId}
                onChange={(e) => setSelectedCityId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-primary-500 transition-all"
              >
                {cities.length === 0 && <option value="">No hay ciudades registradas</option>}
                {cities.map((city) => (
                  <option key={city.id} value={city.id}>{city.name}</option>
                ))}
              </select>
            </div>

            {/* Area Selector */}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <LayoutGrid className="w-3.5 h-3.5 text-primary-500" /> 2. Selecciona Área / División
              </label>
              <select
                value={selectedAreaId}
                onChange={(e) => setSelectedAreaId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-primary-500 transition-all"
              >
                {areas.length === 0 && <option value="">No hay áreas registradas</option>}
                {areas.map((area) => (
                  <option key={area.id} value={area.id}>{area.name}</option>
                ))}
              </select>
            </div>

            {/* Registered Employees preview for this selection */}
            <div className="pt-2 border-t border-slate-100 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-600">
                <span className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-indigo-500" />
                  Integrantes asignados a este punto:
                </span>
                <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full font-black text-[10px]">
                  {exactAssignedEmployees.length} personal
                </span>
              </div>

              {exactAssignedEmployees.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-1 bg-slate-50/70 rounded-xl border border-slate-100">
                  {exactAssignedEmployees.map((emp) => (
                    <span
                      key={emp.id}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-700 shadow-xs"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      {emp.name}
                      {emp.position && <span className="text-[10px] text-slate-400 font-normal">({emp.position})</span>}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-800 text-xs font-medium">
                  Aún no hay personal asignado específicamente a <strong>{currentCity?.name}</strong> en <strong>{currentArea?.name}</strong>.
                  El usuario podrá ingresar su nombre manualmente o puedes vincularlos en la pestaña <strong>Catálogos → Personal</strong>.
                </div>
              )}
            </div>

            {/* Quick Action Buttons */}
            <div className="pt-2 flex flex-col gap-2.5">
              <button
                onClick={handlePrint}
                className="w-full py-3.5 px-4 bg-primary-600 hover:bg-primary-700 text-white font-black text-xs uppercase tracking-wider rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-primary-600/20 transition-all cursor-pointer"
              >
                <Printer className="w-4 h-4" /> Imprimir Rótulo Oficial
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleCopyLink}
                  className="py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? '¡Copiado!' : 'Copiar Enlace'}
                </button>
                <a
                  href={qrUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="py-2.5 px-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all text-center"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Probar Vista
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Live Preview Card */}
        <div className="lg:col-span-7 flex justify-center items-start">
          <div className="bg-white rounded-3xl border-2 border-slate-200 p-8 shadow-xl max-w-md w-full flex flex-col items-center text-center relative overflow-hidden">
            {/* Corner Tag */}
            <div className="absolute top-4 right-4 px-3 py-1 bg-slate-100 rounded-full text-[9px] font-black uppercase tracking-widest text-slate-500 border border-slate-200">
              Vista Previa de Rótulo
            </div>

            <div className="w-12 h-12 rounded-2xl bg-primary-50 border border-primary-100 flex items-center justify-center text-primary-600 font-black text-lg mb-3 shadow-xs">
              AZ
            </div>

            <p className="text-[11px] font-black uppercase tracking-[0.25em] text-slate-400 mb-1">
              {guildName || guildId} • AZEROTH
            </p>
            <h4 className="text-xl font-black text-slate-900 uppercase tracking-tight mb-3">
              Punto de Reporte de Incidencias
            </h4>

            {/* Badges */}
            <div className="flex flex-wrap items-center justify-center gap-2 mb-6">
              <span className="px-3 py-1 bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-black uppercase tracking-wide flex items-center gap-1">
                <MapPin className="w-3 h-3 text-primary-600" /> {currentCity?.name || 'Ciudad'}
              </span>
              <span className="px-3 py-1 bg-primary-50 text-primary-700 border border-primary-200 rounded-xl text-xs font-black uppercase tracking-wide flex items-center gap-1">
                <LayoutGrid className="w-3 h-3 text-primary-600" /> {currentArea?.name || 'División'}
              </span>
            </div>

            {/* The QR Code */}
            <div className="p-4 bg-white rounded-2xl border-2 border-slate-200 shadow-md mb-6 hover:scale-102 transition-transform">
              <QRCodeSVG
                id="qr-printable-svg"
                value={qrUrl}
                size={220}
                level="M"
                includeMargin={false}
              />
            </div>

            <p className="text-xs font-bold text-slate-700 mb-2">
              📱 Escanea con cualquier celular (cámara estándar)
            </p>
            <p className="text-[11px] text-slate-500 font-medium leading-relaxed max-w-xs mb-4">
              Selecciona tu nombre de la lista de <strong>{currentArea?.name || 'Área'}</strong> en <strong>{currentCity?.name || 'Ciudad'}</strong> y reporta la falla en menos de 30 segundos.
            </p>

            <div className="w-full pt-4 border-t border-slate-100 flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              <span>Azeroth Ops</span>
              <span>QR ID: {currentCity?.id?.slice(0, 4)}-{currentArea?.id?.slice(0, 4)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
