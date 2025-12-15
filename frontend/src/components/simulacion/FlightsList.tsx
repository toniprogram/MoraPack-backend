import { Plane } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { SegmentoVuelo } from '../../hooks/useSimulacion';

interface FlightsListProps {
  vuelos: SegmentoVuelo[];
  selectedFlightId?: string | null;
  onSelectFlight?: (flightId: string | null) => void;
  onSelectOrders?: (orderIds: string[] | null) => void;
}

export function FlightsList({ vuelos, selectedFlightId, onSelectFlight, onSelectOrders }: FlightsListProps) {
  const selectedRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selectedFlightId && selectedRef.current) {
      selectedRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [selectedFlightId]);
  if (vuelos.length === 0) {
    return <div className="text-xs text-base-content/60 px-3 py-2">No hay vuelos activos</div>;
  }
  return (
    <div className="max-h-24 overflow-y-auto space-y-1 pr-1 scrollbar-thin scrollbar-thumb-base-300 scrollbar-track-transparent">
      {vuelos.map((vuelo) => {
        const isSelected = selectedFlightId === vuelo.id;
        return (
          <div
            key={vuelo.id}
            ref={isSelected ? selectedRef : null}
            className={`flex justify-between items-center p-1.5 rounded text-[10px] cursor-pointer transition-all duration-200 border ${
              isSelected
                ? 'bg-warning/20 border-warning text-warning-content font-medium'
                : 'bg-base-200/40 border-transparent hover:bg-base-200/60 text-base-content'
            }`}
            onClick={(e) => {
              e.stopPropagation();
              onSelectFlight?.(vuelo.id);
              onSelectOrders?.(vuelo.orderIds || []);
            }}
          >
            <div className="flex items-center gap-1.5">
              <Plane size={10} className={`rotate-45 ${isSelected ? 'text-warning' : 'text-info'}`} />
              <span>{vuelo.flightId}</span>
            </div>
            <div className="flex items-center gap-1 opacity-70">
              <span className="font-mono">➔ {vuelo.destination}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}