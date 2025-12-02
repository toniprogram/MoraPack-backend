import { Plane } from 'lucide-react';
import type { VueloEnMovimiento } from '../../hooks/useSimulacion';
import type { FlightGroup } from '../../types/simulacionUI';

interface SidebarVuelosPanelProps {
  vuelosFiltrados: FlightGroup[];
  vuelosTotal: number;
  vuelosEnMovimiento: VueloEnMovimiento[];
}

export function SidebarVuelosPanel({ vuelosFiltrados, vuelosTotal, vuelosEnMovimiento }: SidebarVuelosPanelProps) {
  return (
    <>
      {vuelosTotal === 0 && (
        <div className="text-center text-base-content/60 py-8">
          No hay vuelos activos
        </div>
      )}
      {vuelosTotal > 0 && vuelosFiltrados.length === 0 && (
         <div className="text-center text-base-content/60 py-8">
          No se encontraron vuelos con los filtros actuales.
        </div>
      )}

      {vuelosFiltrados.map(vuelo => {
          const vueloEnCurso = vuelosEnMovimiento.find(v => v.id === vuelo.departureUtc);

          return (
            <div key={vuelo.departureUtc} className="card bg-base-200 shadow-sm hover:shadow-md transition-shadow">
              <div className="card-body p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Plane size={16} className="text-primary" />
                    <span className="font-bold text-sm text-primary">
                      {vuelo.origen} → {vuelo.destino}
                    </span>
                  </div>

                  {vueloEnCurso && (
                    <span className={`badge badge-xs ${
                      vueloEnCurso.progreso >= 100
                        ? 'badge-info'
                        : 'badge-success'
                    }`}>
                      {vueloEnCurso.progreso >= 100 ? 'Aterrizado' : 'En vuelo'}
                    </span>
                  )}
                </div>
                <div className="text-xs text-base-content/70 font-semibold mb-1">
                  📅 {vuelo.fecha}
                </div>

                <div className="flex justify-between text-xs text-base-content/60 mb-2">
                  <div>
                    <span className="text-base-content/60">Salida:</span> {vuelo.hora}
                  </div>
                  <div>
                    <span className="text-base-content/60">Llegada:</span> {vuelo.horaLlegada}
                  </div>
                </div>

                <div className="mt-2 pt-2 border-t border-base-300">
                  <p className="text-xs text-base-content/70 font-semibold mb-1">
                    Pedidos ({vuelo.pedidos.length}):
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {vuelo.pedidos.map(pedido => (
                      <span key={pedido} className="badge badge-xs bg-base-300 text-base-content border-base-200">
                        {pedido}
                      </span>
                    ))}
                  </div>
                </div>

                {vueloEnCurso && (
                  <div className="mt-3">
                    <div className="w-full bg-base-300 rounded-full h-2">
                      <div
                        className="bg-success h-2 rounded-full transition-all"
                        style={{ width: `${Math.min(vueloEnCurso.progreso, 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-base-content/70 mt-1 text-center">
                      {Math.round(vueloEnCurso.progreso)}%
                      {vueloEnCurso.progreso >= 100 && ' - Completado'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
    </>
  );
}
