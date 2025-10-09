import React, { useState, useMemo, useRef } from "react";
import { useFlights } from "../hooks/useFlights";
import type { Vuelo, EstadoVuelo, NuevoVueloData } from "../services/flightService";

export default function FlightsPage() {
  const {
    flights, loading, error,
    bulkCreateFlights, isBulkCreating
  } = useFlights();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<EstadoVuelo | "todos">("todos");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleLoadFlightsClick = () => {
    fileInputRef.current?.click();
  };
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const lines = text.split('\n').filter(line => line.trim() !== '');

    try {
      const newFlights: NuevoVueloData[] = lines.map(line => {
        const parts = line.split('-');
        if (parts.length < 5) throw new Error(`Línea inválida (formato incorrecto): "${line}"`);

        const [origen, destino, depTime, arrTime, capacidad] = parts;
        const parseHHMM = (time: string) => {
          if (!time || !time.includes(':')) throw new Error(`Hora inválida: "${time}"`);
          return time.split(':').map(Number).reduce((h, m) => h * 60 + m);
        };
        return {
          origen,
          destino,
          salidaLocalMin: parseHHMM(depTime),
          llegadaLocalMin: parseHHMM(arrTime),
          capacidad: parseInt(capacidad, 10),
          estado: "programado",
        };
      });
      await bulkCreateFlights(newFlights);
      alert("¡Vuelos cargados con éxito!");
    } catch (e: any) {
      console.error("Error al procesar el archivo:", e);
      alert(`Error al procesar el archivo: ${e.message}`);
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };
  const filteredFlights = useMemo(() => {
    return flights.filter((flight) => {
      if (statusFilter !== "todos" && flight.estado !== statusFilter) return false;
      if (searchTerm) {
        const lowerSearchTerm = searchTerm.toLowerCase();
        return (
          flight.codigoVuelo.toLowerCase().includes(lowerSearchTerm) ||
          flight.origen.toLowerCase().includes(lowerSearchTerm) ||
          flight.destino.toLowerCase().includes(lowerSearchTerm)
        );
      }
      return true;
    });
  }, [flights, searchTerm, statusFilter]);
  const formatMinutes = (minutes: number) => {
    if (isNaN(minutes)) return '00:00';
    const h = Math.floor(minutes / 60).toString().padStart(2, "0");
    const m = (minutes % 60).toString().padStart(2, "0");
    return `${h}:${m}`;
  };
  const getStatusBadgeClass = (status: EstadoVuelo) => {
    const statusClasses = { "en vuelo": "badge-info", "programado": "badge-success", "completado": "badge-ghost", "retrasado": "badge-error" };
    return statusClasses[status] || "badge-ghost";
  };

  const handleClearFilters = () => {
    setSearchTerm("");
    setStatusFilter("todos");
  };
  return (
    <div className="p-4 sm:p-8">
      <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
        <div><h1 className="text-3xl font-bold">Vuelos</h1><p className="text-base-content/70">Monitorea las rutas aéreas</p></div>
        <div className="flex gap-2">
          <button className="btn">Cargar aeropuertos</button>
          <button className="btn btn-primary" onClick={handleLoadFlightsClick} disabled={isBulkCreating}>
            {isBulkCreating ? <span className="loading loading-spinner"></span> : "Cargar Vuelos"}
          </button>
          <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".txt" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="stat bg-base-100 shadow rounded-lg"><div className="stat-title">Vuelos Activos</div><div className="stat-value text-primary">{flights.filter(f => f.estado === 'en vuelo').length}</div></div>
        <div className="stat bg-base-100 shadow rounded-lg"><div className="stat-title">Vuelos Programados</div><div className="stat-value text-success">{flights.filter(f => f.estado === 'programado').length}</div></div>
        <div className="stat bg-base-100 shadow rounded-lg"><div className="stat-title">Vuelos Retrasados</div><div className="stat-value text-error">{flights.filter(f => f.estado === 'retrasado').length}</div></div>
        <div className="stat bg-base-100 shadow rounded-lg"><div className="stat-title">Total Vuelos</div><div className="stat-value">{loading ? '...' : flights.length}</div></div>
      </div>
      <div className="card bg-base-100 shadow mb-6">
        <div className="card-body">
          <h2 className="card-title mb-4">Lista de Vuelos</h2>
          <div className="flex flex-wrap items-center gap-4">
            <input
              type="text"
              placeholder="Buscar vuelos..."
              className="input input-bordered w-full max-w-xs"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <select
              className="select select-bordered"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
            >
              <option value="todos">Todos los estados</option>
              <option value="en vuelo">En vuelo</option>
              <option value="programado">Programado</option>
              <option value="completado">Completado</option>
              <option value="retrasado">Retrasado</option>
            </select>
            <button className="btn btn-ghost" onClick={handleClearFilters}>
                Limpiar filtros
            </button>
          </div>
        </div>
      </div>
      <div className="w-full overflow-x-auto bg-base-100 shadow rounded-lg">
        <table className="table w-full">
          <thead>
            <tr>
              <th>Vuelo</th>
              <th>Ruta</th>
              <th>Horarios</th>
              <th>Ocupación</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {!loading && filteredFlights.map((flight) => {
              const ocupacionPct = Math.round((flight.ocupacionActual / flight.capacidad) * 100);
              return (
                <tr key={flight.id} className="hover">
                  <td><strong>{flight.codigoVuelo}</strong></td>
                  <td><div>{flight.origen} ✈️ {flight.destino}</div><div className="text-xs opacity-60">{flight.distanciaKm} km</div></td>
                  <td>{flight.aeronave}</td>
                  <td><div>{formatMinutes(flight.salidaLocalMin)} - {formatMinutes(flight.llegadaLocalMin)}</div></td>
                  <td>
                    <div className="flex items-center gap-2">
                      <span>{flight.ocupacionActual}/{flight.capacidad}</span>
                      <progress className={`progress ${ocupacionPct > 90 ? 'progress-error' : 'progress-success'}`} value={ocupacionPct} max="100"></progress>
                    </div>
                  </td>
                  <td><span className={`badge ${getStatusBadgeClass(flight.estado)}`}>{flight.estado}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!loading && filteredFlights.length === 0 && (
          <div className="text-center p-8">No se encontraron vuelos.</div>
        )}
      </div>
    </div>
  );
}