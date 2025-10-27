import { useState } from "react";
import { Eye, Plus, Trash2, RefreshCw, Plane } from "lucide-react";
import { useFlights } from "../hooks/useFlights";
import type { Vuelo } from "../types/vuelo";

// Función Helper para convertir minutos a formato HH:MM
const formatMinutes = (minutes: number) => {
  if (isNaN(minutes)) return '00:00';
  const h = Math.floor(minutes / 60).toString().padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
};

export default function FlightsPage() {
  const { list, create } = useFlights();

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Omit<Vuelo, "id">>({
    origen: "",
    destino: "",
    salidaLocalMin: 0,
    llegadaLocalMin: 0,
    capacidad: 250,
  });

  // 🟢 Crear nuevo vuelo
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate(form, {
      onSuccess: () => {
        // Resetea el formulario al estado inicial
        setForm({
          origen: "",
          destino: "",
          salidaLocalMin: 0,
          llegadaLocalMin: 0,
          capacidad: 250,
        });
        setShowForm(false);
      },
    });
  };

  // 🟠 Estados de Carga y Error
  if (list.isLoading)
    return <div className="p-6 text-center">Cargando vuelos...</div>;

  if (list.isError)
    return (
      <div className="p-6 text-center text-error">
        Error al cargar vuelos
        <button className="btn btn-sm ml-2" onClick={() => list.refetch()}>
          Reintentar
        </button>
      </div>
    );

  return (
    <div className="p-6 space-y-4">
      {/*Encabezado*/}
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-semibold">Gestión de Vuelos</h1>
        <div className="flex gap-2">
          <button className="btn btn-outline btn-sm" onClick={() => list.refetch()}>
            <RefreshCw size={16} />
            Actualizar
          </button>
          <button
            className="btn btn-primary btn-sm flex items-center gap-2"
            onClick={() => setShowForm((s) => !s)}
          >
            <Plus size={16} />
            Nuevo Vuelo
          </button>
        </div>
      </div>

      {/* Resumen de Vuelos (integrado) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card border border-base-300 bg-base-100 shadow-sm">
          <div className="card-body flex flex-row items-center justify-between p-4">
            <div className="flex flex-col">
              <span className="text-sm opacity-70">Total Vuelos</span>
              <span className="text-2xl font-bold">{list.data?.length ?? 0}</span>
            </div>
            <div className="flex items-center">
              <Plane className="text-primary" size={22} />
            </div>
          </div>
        </div>
      </div>

      {/*Formulario para Nuevo Vuelo*/}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="card bg-base-200 p-4 shadow-md border border-base-300"
        >
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <input type="text" placeholder="Origen (ej. SPIM)" className="input input-bordered input-sm w-full" value={form.origen} onChange={(e) => setForm({ ...form, origen: e.target.value.toUpperCase() })} required />
            <input type="text" placeholder="Destino (ej. UBBB)" className="input input-bordered input-sm w-full" value={form.destino} onChange={(e) => setForm({ ...form, destino: e.target.value.toUpperCase() })} required />
            <input type="number" placeholder="Minuto Salida" className="input input-bordered input-sm w-full" value={form.salidaLocalMin} onChange={(e) => setForm({ ...form, salidaLocalMin: parseInt(e.target.value) || 0 })} required />
            <input type="number" placeholder="Minuto Llegada" className="input input-bordered input-sm w-full" value={form.llegadaLocalMin} onChange={(e) => setForm({ ...form, llegadaLocalMin: parseInt(e.target.value) || 0 })} required />
            <input type="number" placeholder="Capacidad" className="input input-bordered input-sm w-full" value={form.capacidad} onChange={(e) => setForm({ ...form, capacidad: parseInt(e.target.value) || 250 })} required />
          </div>
          <div className="flex justify-end mt-4 gap-2">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowForm(false)}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={create.isPending}>
              {create.isPending ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </form>
      )}

      {/* 🔹 Tabla de Vuelos */}
      <div className="overflow-x-auto">
        <table className="table table-zebra text-sm">
          <thead>
            <tr>
              <th>ID</th>
              <th>Ruta</th>
              <th>Horario</th>
              <th>Capacidad</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {list.data?.length === 0 ? (
              <tr><td colSpan={5} className="text-center opacity-60 py-4">No hay vuelos registrados</td></tr>
            ) : (
              list.data?.map((vuelo) => (
                <tr key={vuelo.id}>
                  <td>{vuelo.id}</td>
                  <td><strong>{vuelo.origen} → {vuelo.destino}</strong></td>
                  <td>{formatMinutes(vuelo.salidaLocalMin)} - {formatMinutes(vuelo.llegadaLocalMin)}</td>
                  <td>{vuelo.capacidad} paquetes</td>
                  <td className="flex gap-2">
                    <button className="btn btn-ghost btn-xs" title="Ver detalle"><Eye size={16} /></button>
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