import { Box, Plane } from 'lucide-react';
import type { SegmentoVuelo } from '../../hooks/useSimulacion';

interface OutgoingOrdersListProps {
  outgoingFlights: SegmentoVuelo[];
  selectedOrders?: string[] | null;
  selectedFlightId?: string | null;
  onSelectOrder?: (orderId: string) => void;
  onSelectFlight?: (flightId: string) => void;
}

interface FlatOutgoingOrder {
  orderId: string;
  quantity: number;
  segmentId: string;
  flightCode: string;
  destination: string;
}

export function OutgoingOrdersList({
  outgoingFlights,
  selectedOrders,
  selectedFlightId,
  onSelectOrder,
  onSelectFlight
}: OutgoingOrdersListProps) {
  const flatOrders: FlatOutgoingOrder[] = outgoingFlights.flatMap(vuelo => {
    if (vuelo.orderLoads && vuelo.orderLoads.length > 0) {
      return vuelo.orderLoads.map(load => ({
        orderId: load.orderId,
        quantity: load.quantity,
        segmentId: vuelo.id,
        flightCode: vuelo.flightId,
        destination: vuelo.destination
      }));
    }
    if (vuelo.orderIds && vuelo.orderIds.length > 0) {
      return vuelo.orderIds.map(id => ({
        orderId: id,
        quantity: 1,
        segmentId: vuelo.id,
        flightCode: vuelo.flightId,
        destination: vuelo.destination
      }));
    }
    return [];
  });

  if (flatOrders.length === 0) {
    return <div className="text-xs text-base-content/60 px-3 py-2">No hay pedidos salientes</div>;
  }
  const isOrderSelected = (id: string) => !!selectedOrders?.includes(id);
  return (
    <div className="max-h-24 overflow-y-auto scrollbar-thin bg-transparent rounded border border-base-content/10">
      <table className="table table-xs table-pin-rows w-full">
        <tbody>
          {flatOrders.map((item, idx) => {
            const isSelected = isOrderSelected(item.orderId);
            return (
              <tr
                key={`${item.orderId}-${item.segmentId}-${idx}`}
                className={`hover:bg-base-200/40 cursor-pointer transition-colors border-b border-base-100 last:border-none ${
                  isSelected ? 'bg-primary/10' : ''
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectOrder?.(item.orderId);
                }}
              >
                <td className="pl-2 py-1">
                  <div className={`font-mono font-bold text-[10px] ${isSelected ? 'text-primary' : 'text-base-content'}`}>
                    {item.orderId}
                  </div>
                </td>

                <td className="text-right font-mono pr-2 py-1">
                  <div className="flex items-center justify-end gap-1.5 text-[10px]">
                    <Box size={12} className="text-sky-400 opacity-90" strokeWidth={2} />
                    <span className="font-medium text-base-content/90">{item.quantity}</span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}