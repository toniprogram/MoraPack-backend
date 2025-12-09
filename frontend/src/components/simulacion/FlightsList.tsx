import { Plane } from 'lucide-react';
import type { SegmentoVuelo } from '../../hooks/useSimulacion';

interface FlightsListProps {
  vuelos: SegmentoVuelo[];
  onSelectFlight?: (flightId: string | null) => void;
  onSelectOrders?: (orderIds: string[] | null) => void;
}

export function FlightsList({ vuelos, onSelectFlight, onSelectOrders }: FlightsListProps) {
  if (vuelos.length === 0) {
    return <div className="text-xs text-base-content/60 px-3 py-2">No hay vuelos activos</div>;
  }

  return (
    <div className="max-h-24 overflow-y-auto space-y-1 pr-1 scrollbar-thin scrollbar-thumb-base-300 scrollbar-track-transparent">
      {vuelos.map((vuelo) => (
        <div
          key={vuelo.id}
          className="flex justify-between items-center bg-base-200 p-1.5 rounded text-[10px] hover:bg-base-300 cursor-pointer transition-colors"
          onClick={() => {
            onSelectFlight?.(vuelo.id);
            onSelectOrders?.(vuelo.orderIds || []);
          }}
        >
          <div className="flex items-center gap-1.5">
            <Plane size={10} className="text-info rotate-45" />
            <span className="font-bold text-base-content">{vuelo.flightId}</span>
          </div>
          <div className="flex items-center gap-1 opacity-70">
            <span className="font-mono">➔ {vuelo.destination}</span>
          </div>
        </div>
      ))}
    </div>
  );
}