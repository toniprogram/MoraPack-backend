import type { SimulationSnapshot } from '../../types/simulation';
import type { EnvioInfo } from '../../types/simulacionUI';

interface SidebarEnviosPanelProps {
  panelSnapshot: SimulationSnapshot | null;
  enviosFiltrados: EnvioInfo[];
  ordenesParaSimular: unknown[];
}

export function SidebarEnviosPanel({
  panelSnapshot,
  enviosFiltrados,
  ordenesParaSimular,
}: SidebarEnviosPanelProps) {
  return (
    <>
      {(!panelSnapshot || panelSnapshot.orderPlans.length === 0) && (
        <div className="text-center text-base-content/60 py-8">
          {ordenesParaSimular.length > 0
            ? 'Sincroniza y presiona "Iniciar" para comenzar la simulación'
            : 'Carga pedidos proyectados o usa los ya guardados para iniciar.'}
        </div>
      )}
      {panelSnapshot && enviosFiltrados.length === 0 && (
         <div className="text-center text-base-content/60 py-8">
          No se encontraron envíos con los filtros actuales.
        </div>
      )}

      {enviosFiltrados.map(({ plan, estado, creationMs }) => {
        const segmentos = plan.routes?.flatMap(r => r.segments ?? []) ?? [];
        const primerSegmento = segmentos[0];
        const ultimoSegmento = segmentos[segmentos.length - 1];
        const cantidadTotal = plan.routes?.reduce((acc, r) => acc + (r.quantity ?? 0), 0) ?? 0;
        const rutaCount = segmentos.length;

        const estadoClase =
          estado === 'En tránsito'
            ? 'badge-info'
            : estado === 'Entregado'
              ? 'badge-success'
              : estado === 'Planificado'
                ? 'badge-warning'
                : 'badge-neutral';

        const fechaRegistro = Number.isFinite(creationMs) && creationMs > 0
          ? new Date(creationMs).toLocaleDateString('es-PE', {
              day: '2-digit',
              month: 'short',
              year: 'numeric'
            })
          : 'N/A';
        const horaRegistro = Number.isFinite(creationMs) && creationMs > 0
          ? new Date(creationMs).toLocaleTimeString('es-PE', {
              hour: '2-digit',
              minute: '2-digit'
            })
          : 'N/A';

        return (
          <div
            key={plan.orderId}
            className={`card bg-base-200 border-l-4 shadow-sm hover:shadow-md transition-shadow ${
              estado === 'En tránsito'
                ? 'border-info'
                : estado === 'Entregado'
                  ? 'border-success'
                  : estado === 'Planificado'
                    ? 'border-warning'
                    : 'border-base-300'
            }`}
          >
            <div className="card-body p-3">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-sm text-primary">
                    Pedido {plan.orderId}
                  </h3>
                  <p className="text-xs text-base-content/70">
                    Cantidad: {cantidadTotal || 'N/A'}
                  </p>
                </div>
                <span className={`badge badge-sm ${estadoClase}`}>
                  {estado}
                </span>
              </div>

              <div className="mt-2 pt-2 border-t border-base-300">
                <p className="text-[10px] text-base-content/60 mb-1">Fecha de Registro:</p>
                <div className="flex gap-3 text-xs">
                  <div>
                    <span className="text-base-content/70">📅</span> {fechaRegistro}
                  </div>
                  <div>
                    <span className="text-base-content/70">🕒</span> {horaRegistro}
                  </div>
                </div>
              </div>

              <div className="text-xs mt-2 space-y-1">
                <div className="flex justify-between">
                  <span className="text-base-content/70">Origen:</span>
                  <span className="font-semibold">{primerSegmento?.origin || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-base-content/70">Destino:</span>
                  <span className="font-semibold">
                    {ultimoSegmento?.destination || 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-base-content/70">Holgura:</span>
                  <span className={`font-semibold ${
                    estado === 'Entregado'
                      ? 'text-success'
                      : estado === 'En tránsito'
                        ? 'text-info'
                        : 'text-warning'
                  }`}>
                    {plan.slackMinutes} min
                  </span>
                </div>
              </div>

              <div className="mt-2 pt-2 border-t border-base-300">
                <p className="text-xs font-semibold text-base-content/70 mb-1">
                  Ruta ({rutaCount} tramos):
                </p>
                {segmentos.map((seg, idx) => (
                  <div key={idx} className="text-xs text-base-content/70 ml-2 mb-1">
                    • {seg.origin} → {seg.destination}
                    {seg.departureUtc && seg.arrivalUtc && (
                      <span className="text-[10px] text-base-content/60 ml-2">
                        ({new Date(seg.departureUtc).toLocaleTimeString('es-PE', {
                          hour: '2-digit',
                          minute: '2-digit',
                          timeZone: 'UTC'
                        })} - {new Date(seg.arrivalUtc).toLocaleTimeString('es-PE', {
                          hour: '2-digit',
                          minute: '2-digit',
                          timeZone: 'UTC'
                        })})
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}
