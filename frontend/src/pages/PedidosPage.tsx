import { useState } from "react";
import { Eye, Plus, Trash2, RefreshCw } from "lucide-react";
import { usePedidos } from "../hooks/usePedidos";
import type { Pedido } from "../types/pedido";

export default function PedidosPage() {
  const { list, create, update, remove } = usePedidos();

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Omit<Pedido, "id">>({
    destino: "",
    cantidad: 0,
    estado: "pendiente",
    fecha: new Date().toISOString().slice(0, 10),
  });

  // 🟢 Crear nuevo pedido
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate(form, {
      onSuccess: () => {
        setForm({
          destino: "",
          cantidad: 0,
          estado: "pendiente",
          fecha: new Date().toISOString().slice(0, 10),
        });
        setShowForm(false);
      },
    });
  };

  // 🟠 Estados
  if (list.isLoading)
    return <div className="p-6 text-center">Cargando pedidos...</div>;

  if (list.isError)
    return (
      <div className="p-6 text-center text-error">
        Error al cargar pedidos
        <button
          className="btn btn-sm ml-2"
          onClick={() => list.refetch()}
        >
          Reintentar
        </button>
      </div>
    );

  return (
    <div className="p-6 space-y-4">
      {/*Encabezado*/}
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-semibold">Gestión de Pedidos</h1>
        <div className="flex gap-2">
          <button
            className="btn btn-outline btn-sm"
            onClick={() => list.refetch()}
          >
            <RefreshCw size={16} />
            Actualizar
          </button>
          <button
            className="btn btn-primary btn-sm flex items-center gap-2"
            onClick={() => setShowForm((s) => !s)}
          >
            <Plus size={16} />
            Nuevo Pedido
          </button>
        </div>
      </div>

      {/*Formulario*/}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="card bg-base-200 p-4 shadow-md border border-base-300"
        >
          <div className="grid grid-cols-3 gap-4">
            <input
              type="text"
              placeholder="Destino"
              className="input input-bordered input-sm w-full"
              value={form.destino}
              onChange={(e) =>
                setForm({ ...form, destino: e.target.value })
              }
              required
            />
            <input
              type="number"
              placeholder="Cantidad"
              className="input input-bordered input-sm w-full"
              value={form.cantidad}
              onChange={(e) =>
                setForm({ ...form, cantidad: parseInt(e.target.value) })
              }
              required
            />
            <select
              className="select select-bordered select-sm w-full"
              value={form.estado}
              onChange={(e) =>
                setForm({
                  ...form,
                  estado: e.target.value as Pedido["estado"],
                })
              }
            >
              <option value="pendiente">Pendiente</option>
              <option value="en ruta">En ruta</option>
              <option value="entregado">Entregado</option>
            </select>
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

      {/* 🔹 Tabla */}
      <div className="overflow-x-auto">
        <table className="table table-zebra text-sm">
          <thead>
            <tr>
              <th>ID</th>
              <th>Destino</th>
              <th>Cantidad</th>
              <th>Estado</th>
              <th>Fecha</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {list.data?.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center opacity-60 py-4">
                  No hay pedidos registrados
                </td>
              </tr>
            ) : (
              list.data?.map((pedido) => (
                <tr key={pedido.id}>
                  <td>{pedido.id}</td>
                  <td>{pedido.destino}</td>
                  <td>{pedido.cantidad}</td>
                  <td>
                    <span
                      className={`badge ${
                        pedido.estado === "pendiente"
                          ? "badge-warning"
                          : pedido.estado === "en ruta"
                          ? "badge-info"
                          : "badge-success"
                      } capitalize`}
                    >
                      {pedido.estado}
                    </span>
                  </td>
                  <td>{pedido.fecha}</td>
                  <td className="flex gap-2">
                    <button
                      className="btn btn-ghost btn-xs"
                      title="Ver detalle"
                    >
                      <Eye size={16} />
                    </button>
                    <button
                      className="btn btn-ghost btn-xs text-error"
                      title="Eliminar"
                      onClick={() => remove.mutate(pedido.id)}
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
    </div>
  );
}
