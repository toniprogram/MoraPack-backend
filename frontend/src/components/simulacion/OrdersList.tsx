import { Box } from 'lucide-react';

export interface OrderLoadView {
  orderId: string;
  cantidad: number;
}

interface OrdersListProps {
  items: OrderLoadView[];
  selectedOrders?: string[] | null;
  onSelectOrder?: (orderId: string) => void;
}

export function OrdersList({ items, selectedOrders, onSelectOrder }: OrdersListProps) {
  if (!items.length) {
    return <div className="text-xs text-base-content/60 px-3 py-2">Sin pedidos dentro</div>;
  }

  const isSelected = (id: string) => !!selectedOrders?.includes(id);

  return (
    <div className="max-h-40 overflow-y-auto scrollbar-thin bg-transparent">
      <table className="table table-xs table-pin-rows w-full">
        <thead className="bg-base-200/40 text-[10px]">
          <tr>
            <th className="pl-3">Pedido</th>
            <th className="text-right pr-3">Carga</th>
          </tr>
        </thead>
        <tbody>
          {items.map((p, idx) => (
            <tr
              key={`${p.orderId}-${idx}`}
              className={`hover:bg-base-200/40 cursor-pointer ${isSelected(p.orderId) ? 'bg-primary/20' : ''}`}
              onClick={() => onSelectOrder?.(p.orderId)}
            >
              <td className="pl-3">
                <div className={`font-mono font-bold text-xs ${isSelected(p.orderId) ? 'text-primary' : 'text-primary'}`}>
                  {p.orderId}
                </div>
              </td>
              <td className="text-right font-mono pr-3">
                <div className="flex items-center justify-end gap-1">
                  <Box size={10} className="opacity-50" />
                  {p.cantidad}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
