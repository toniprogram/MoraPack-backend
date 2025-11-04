import { useState } from 'react';
import { useSimulacion } from '../hooks/useSimulacion';
import { MapaVuelos } from '../components/mapas/MapaVuelos';
import { Check, Package, AlertTriangle, Play, Pause, XCircle } from 'lucide-react';

export default function SimulacionPage() {
  // 1. Llama al hook
  const {
    vuelos,
    aeropuertos,
    kpis,
    reloj,
    isLoading,
    isError,
    estaActivo,
    iniciar,
    pausar,
    terminar,
  } = useSimulacion();

  // Estado para los selectores de escenario
  const [escenario, setEscenario] = useState('diario');

  // 2. Manejo de estados de carga (sin cambios)
  if (isLoading) { /* ... */ }
  if (isError) { /* ... */ }

  // 3. Renderizado
  return (
    <div className="flex flex-col h-screen w-full bg-base-300">

      {/* --- 1. BARRA SUPERIOR --- */}
      <div className="flex flex-wrap justify-between items-center bg-base-100 p-2 shadow-md z-20">

        {/* Opciones de Escenario */}
        <div className="flex gap-2 items-center">
          <span className="font-semibold">Escenario:</span>
          <div className="form-control">
            <label className="label cursor-pointer gap-1">
              <input type="radio" name="escenario" className="radio radio-xs" checked={escenario === 'diario'} onChange={() => setEscenario('diario')} /> Diario
            </label>
          </div>
          <div className="form-control">
            <label className="label cursor-pointer gap-1">
              <input type="radio" name="escenario" className="radio radio-xs" checked={escenario === 'semanal'} onChange={() => setEscenario('semanal')} /> Semanal
            </label>
          </div>
          <div className="form-control">
            <label className="label cursor-pointer gap-1">
              <input type="radio" name="escenario" className="radio radio-xs" checked={escenario === 'colapso'} onChange={() => setEscenario('colapso')} /> Colapso
            </label>
          </div>
        </div>

       {/* KPIs Globales */}
       <div className="flex gap-4 text-sm">
         <div className="flex items-center gap-1"><Check size={16} className="text-success" /> Entregas a tiempo: <strong>{kpis.entregas}%</strong></div>
         <div className="flex items-center gap-1"><AlertTriangle size={16} className="text-error" /> Pedidos retrasados: <strong>{kpis.retrasados}%</strong></div>
       </div>

        {/* Botones de Simulación */}
        <div className="flex gap-2">
          <button
            className="btn btn-sm btn-success"
            onClick={iniciar}
            disabled={estaActivo}
          >
            <Play size={16} /> Iniciar
          </button>
          <button
            className="btn btn-sm btn-warning"
            onClick={pausar}
            disabled={!estaActivo}
          >
            <Pause size={16} /> Pausar
          </button>
          <button
            className="btn btn-sm btn-error"
            onClick={terminar}
          >
            <XCircle size={16} /> Terminar
          </button>
        </div>

        {/* Reloj de Simulación */}
        <div className="flex flex-col items-end">
          <span className="font-semibold">Tiempo transcurrido</span>
          <span className="text-sm font-mono">{reloj}</span>
        </div>
      </div>

      {/* --- 2. CONTENIDO PRINCIPAL --- */}
      <div className="flex-1 relative overflow-hidden">
        <MapaVuelos
            vuelos={vuelos}
            aeropuertos={aeropuertos}
            isLoading={isLoading}
          />
      </div>
    </div>
  );
}