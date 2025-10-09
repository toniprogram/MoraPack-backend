import { Package, MapPin, Truck, CheckCircle } from "lucide-react";
import { usePedidos } from "../hooks/usePedidos";

export default function PedidosSummary() {
  const { list } = usePedidos();

  if (list.isLoading)
    return <div className="p-4 text-center">Cargando resumen...</div>;

  const pedidos = list.data ?? [];
  const total = pedidos.length;
  const pendientes = pedidos.filter((p) => p.estado === "pendiente").length;
  const enRuta = pedidos.filter((p) => p.estado === "en ruta").length;
  const entregados = pedidos.filter((p) => p.estado === "entregado").length;

  const cards = [
    {
      label: "Total Pedidos",
      value: total,
      icon: <Package className="text-primary" size={22} />,
    },
    {
      label: "Pendientes",
      value: pendientes,
      icon: <MapPin className="text-warning" size={22} />,
    },
    {
      label: "En Ruta",
      value: enRuta,
      icon: <Truck className="text-info" size={22} />,
    },
    {
      label: "Entregados",
      value: entregados,
      icon: <CheckCircle className="text-success" size={22} />,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {cards.map((c) => (
        <div
          key={c.label}
          className="card border border-base-300 bg-base-100 shadow-sm"
        >
          <div className="card-body flex flex-row items-center justify-between p-4">
            <div className="flex flex-col">
              <span className="text-sm opacity-70">{c.label}</span>
              <span className="text-2xl font-bold">{c.value}</span>
            </div>
            <div className="flex items-center">{c.icon}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
