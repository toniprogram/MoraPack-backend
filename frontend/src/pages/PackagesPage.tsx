import React, { useState } from "react";
import type { Shipment } from "../services/packageService";
import { usePackages } from "../hooks/usePackages";

export default function PackagesPage() {
  const [form, setForm] = useState<Shipment>({
    code: "",
    origin: "",
    destination: "",
  });
  const {
    packages,
    loading,
    creating,
    error,
    createPackage,
  } = usePackages();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createPackage(form);
      setForm({ code: "", origin: "", destination: "" });
    } catch (err) {
      console.error("Error al crear paquete:", err);
    }
  };

  return (
    <div className="min-h-screen bg-base-200 p-10 flex flex-col items-center">
      <h1 className="text-3xl font-bold mb-6 text-primary">📦 MoraPack Packages</h1>

      <form onSubmit={handleSubmit} className="card bg-base-100 p-6 w-96 shadow-lg mb-8">
        <input
          className="input input-bordered w-full mb-2"
          name="code"
          placeholder="Código"
          value={form.code}
          onChange={handleChange}
        />
        <input
          className="input input-bordered w-full mb-2"
          name="origin"
          placeholder="Origen"
          value={form.origin}
          onChange={handleChange}
        />
        <input
          className="input input-bordered w-full mb-4"
          name="destination"
          placeholder="Destino"
          value={form.destination}
          onChange={handleChange}
        />
        <button className="btn btn-primary w-full" disabled={creating}>
          {creating ? "Guardando..." : "Guardar"}
        </button>
      </form>

      <div className="w-full max-w-lg">
        <h2 className="text-xl font-semibold mb-3">Lista de Paquetes</h2>
        {loading && <p>Cargando paquetes...</p>}
        {error && <p className="text-error">{error}</p>}
        <ul className="space-y-2">
          {packages.map((p) => (
            <li key={p.id} className="card bg-base-100 p-4 shadow-sm">
              <strong>{p.code}</strong> — {p.origin} ➜ {p.destination}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
