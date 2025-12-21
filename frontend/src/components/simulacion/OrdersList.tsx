import { Box } from 'lucide-react';

export interface OrderLoadView {
  orderId: string;
  cantidad: number;
}

interface OrdersListProps {
  items: OrderLoadView[];
  selectedOrders?: string[] | null;
  onSelectOrder?: (orderId: string) => void;
  className?: string;
}

export function OrdersList({ items, selectedOrders, onSelectOrder, className }: OrdersListProps) {
  if (!items.length) {
    return <div className="text-xs text-base-content/60 px-3 py-2">Sin pedidos dentro</div>;
  }

  const isSelected = (id: string) => !!selectedOrders?.includes(id);

  return (
    <div className={`overflow-y-auto scrollbar-thin bg-base-100 ${className || 'max-h-40'}`}>
        <table className="table table-xs table-pin-rows w-full">
        <thead>
          <tr>
            <th className="bg-base-200 pl-3 z-10">Pedido</th>
            <th className="bg-base-200 text-right pr-3 z-10">Carga</th>
          </tr>
        </thead>
        <tbody>
          {items.map((p, idx) => (
            <tr
              key={`${p.orderId}-${idx}`}
              className={`hover:bg-base-200/50 cursor-pointer ${isSelected(p.orderId) ? 'bg-primary/10' : ''}`}
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
