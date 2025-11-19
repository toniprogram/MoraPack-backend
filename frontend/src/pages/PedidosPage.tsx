import { useEffect, useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Plus,
  Trash2,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { usePedidos, type PedidoScope } from "../hooks/usePedidos";
import type { Order } from "../types/order";
import type { OrderRequest } from "../types/orderRequest";
import { aeropuertoService } from "../services/aeropuertoService";
import PedidosSummary from "../components/PedidosSummary";

const PAGE_SIZE_OPTIONS = [20, 50, 100, 250, 500];
const DEFAULT_PAGE_SIZE = 50;

const buildDefaultForm = (projected: boolean): OrderRequest => ({
  id: "",
  customerReference: "",
  destinationAirportCode: "",
  quantity: 1,
  creationLocal: new Date().toISOString().slice(0, 16),
  projected,
});

const formatUtc = (value: string) =>
  new Date(value).toLocaleString("es-PE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  });

const ensureSeconds = (value: string) =>
  value.length === 16 ? `${value}:00` : value;

export default function PedidosPage() {
  const [scope, setScope] = useState<PedidoScope>("REAL");
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [page, setPage] = useState<number>(0); // zero-based
  const [jumpValue, setJumpValue] = useState<string>("1");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<OrderRequest>(buildDefaultForm(scope === "PROJECTED"));

  const { data: aeropuertos = [] } = useQuery({
    queryKey: ["aeropuertos"],
    queryFn: aeropuertoService.getAll,
  });

  const { list, create, remove } = usePedidos(scope, page, pageSize);

  useEffect(() => {
    setPage(0);
    setJumpValue("1");
  }, [scope, pageSize]);

  useEffect(() => {
    setForm(buildDefaultForm(scope === "PROJECTED"));
  }, [scope]);

  const pageData = list.data;
  const items = pageData?.items ?? [];
  const totalPages = Math.max(pageData?.totalPages ?? 1, 1);
  const currentPage = Math.min(page, totalPages - 1);

  useEffect(() => {
    if (page >= totalPages) {
      setPage(totalPages - 1);
      setJumpValue(String(totalPages));
    }
  }, [page, totalPages]);

  const visiblePages = useMemo(() => {
    const pages = new Set<number>();
    pages.add(0);
    pages.add(totalPages - 1);
    for (let offset = -2; offset <= 2; offset++) {
      const candidate = currentPage + offset;
      if (candidate > 0 && candidate < totalPages - 1) {
        pages.add(candidate);
      }
    }
    return Array.from(pages).sort((a, b) => a - b);
  }, [currentPage, totalPages]);

  const handleJump = () => {
    const numeric = Number(jumpValue);
    if (Number.isNaN(numeric) || numeric < 1 || numeric > totalPages) {
      return;
    }
    setPage(numeric - 1);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    create.mutate(
      { ...form, creationLocal: ensureSeconds(form.creationLocal) },
      {
        onSuccess: () => {
          setForm(buildDefaultForm(scope === "PROJECTED"));
          setShowForm(false);
        },
      }
    );
  };

  const handleDelete = (order: Order) => {
    const confirmed = window.confirm(
      `¿Eliminar el pedido ${order.id} (${order.destinationAirport?.code ?? "N/A"})?`
    );
    if (!confirmed) return;
    remove.mutate(order.id);
  };

  if (list.isLoading) {
    return <div className="p-6 text-center">Cargando pedidos...</div>;
  }

  if (list.isError) {
    return (
      <div className="p-6 text-center text-error">
        Error al cargar pedidos
        <button className="btn btn-sm ml-2" onClick={() => list.refetch()}>
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-xl font-semibold">Gestión de Pedidos</h1>
          <div className="flex flex-wrap gap-2 items-center">
            {(["REAL", "PROJECTED"] as PedidoScope[]).map((option) => (
              <button
                key={option}
                className={`btn btn-sm ${
                  scope === option ? "btn-primary" : "btn-outline"
                }`}
                onClick={() => setScope(option)}
              >
                {option === "REAL" ? "Operativos" : "Proyectados"}
              </button>
            ))}
            <select
              className="select select-bordered select-sm w-32"
              value={pageSize}
              onChange={(event) => setPageSize(Number(event.target.value))}
            >
              {PAGE_SIZE_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {value} por página
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-outline btn-sm" onClick={() => list.refetch()}>
            <RefreshCw size={16} />
            Actualizar
          </button>
          <button
            className="btn btn-primary btn-sm flex items-center gap-2"
            onClick={() => setShowForm((prev) => !prev)}
          >
            <Plus size={16} />
            Nuevo Pedido
          </button>
        </div>
      </div>

      <PedidosSummary data={pageData} scope={scope} pageSize={pageSize} />

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="card bg-base-200 p-4 shadow-md border border-base-300"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="form-control">
              <input
                type="text"
                placeholder="ID (dejar vacío para autogenerar)"
                className="input input-bordered input-sm w-full"
                value={form.id}
                onChange={(e) => setForm({ ...form, id: e.target.value })}
              />
              <label className="label">
                <span className="label-text-alt">Prefix 1... = REAL, 0... = PROJECTED</span>
              </label>
            </div>
            <input
              type="text"
              placeholder="Referencia cliente"
              className="input input-bordered input-sm w-full"
              value={form.customerReference}
              onChange={(e) =>
                setForm({ ...form, customerReference: e.target.value })
              }
              required
            />
            <div className="form-control">
              <label className="label">
                <span className="label-text">Aeropuerto destino</span>
              </label>
              <select
                className="select select-bordered select-sm w-full"
                value={form.destinationAirportCode}
                onChange={(e) =>
                  setForm({
                    ...form,
                    destinationAirportCode: e.target.value,
                  })
                }
                required
              >
                <option value="" disabled>
                  Selecciona aeropuerto
                </option>
                {aeropuertos.map((ap) => (
                  <option key={ap.code} value={ap.code}>
                    {ap.code} - {ap.name}
                  </option>
                ))}
              </select>
            </div>
            <input
              type="number"
              min={1}
              placeholder="Cantidad"
              className="input input-bordered input-sm w-full"
              value={form.quantity}
              onChange={(e) =>
                setForm({ ...form, quantity: Number(e.target.value) })
              }
              required
            />
            <input
              type="datetime-local"
              className="input input-bordered input-sm w-full"
              value={form.creationLocal}
              onChange={(e) =>
                setForm({ ...form, creationLocal: e.target.value })
              }
              required
            />
            <label className="label cursor-pointer gap-2">
              <span className="label-text">Marcar como proyectado</span>
              <input
                type="checkbox"
                className="toggle toggle-primary"
                checked={form.projected ?? false}
                onChange={(e) =>
                  setForm({ ...form, projected: e.target.checked })
                }
              />
            </label>
          </div>
          <div className="flex justify-end mt-4 gap-2">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setShowForm(false)}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={create.isPending}
            >
              {create.isPending ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </form>
      )}

      <div className="overflow-x-auto">
        <table className="table table-zebra text-sm">
          <thead>
            <tr>
              <th>ID</th>
              <th>Cliente</th>
              <th>Destino</th>
              <th>Cantidad</th>
              <th>Scope</th>
              <th>Creación (UTC)</th>
              <th>Entrega (UTC)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center opacity-60 py-4">
                  No hay pedidos registrados
                </td>
              </tr>
            ) : (
              items.map((order) => (
                <tr key={order.id}>
                  <td className="font-mono text-xs">{order.id}</td>
                  <td>{order.customerReference}</td>
                  <td>
                    <div className="flex flex-col">
                      <span className="font-medium">
                        {order.destinationAirport?.name ?? "N/A"}
                      </span>
                      <span className="text-xs opacity-70">
                        {order.destinationAirport?.code ?? "—"}
                      </span>
                    </div>
                  </td>
                  <td>{order.quantity}</td>
                  <td>
                    <span
                      className={`badge ${
                        order.scope === "REAL" ? "badge-success" : "badge-info"
                      }`}
                    >
                      {order.scope === "REAL" ? "Operativo" : "Proyectado"}
                    </span>
                  </td>
                  <td>{formatUtc(order.creationUtc)}</td>
                  <td>{formatUtc(order.dueUtc)}</td>
                  <td>
                    <button
                      className="btn btn-ghost btn-xs text-error"
                      title="Eliminar"
                      onClick={() => handleDelete(order)}
                      disabled={remove.isPending}
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {items.length > 0 && (
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="text-sm opacity-70">
            Página {currentPage + 1} de {totalPages}
          </div>
          <div className="flex items-center gap-2">
            <button
              className="btn btn-sm"
              onClick={() => setPage((prev) => Math.max(prev - 1, 0))}
              disabled={currentPage === 0}
            >
              <ChevronLeft size={16} />
            </button>
            {visiblePages.map((pageIndex) => (
              <button
                key={pageIndex}
                className={`btn btn-sm ${
                  pageIndex === currentPage ? "btn-primary" : "btn-outline"
                }`}
                onClick={() => {
                  setPage(pageIndex);
                  setJumpValue(String(pageIndex + 1));
                }}
              >
                {pageIndex + 1}
              </button>
            ))}
            <button
              className="btn btn-sm"
              onClick={() =>
                setPage((prev) => Math.min(prev + 1, totalPages - 1))
              }
              disabled={currentPage >= totalPages - 1}
            >
              <ChevronRight size={16} />
            </button>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={totalPages}
                className="input input-bordered input-xs w-20"
                value={jumpValue}
                onChange={(event) => setJumpValue(event.target.value)}
              />
              <button className="btn btn-xs" onClick={handleJump}>
                Ir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
