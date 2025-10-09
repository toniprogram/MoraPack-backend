import React, { useEffect, useState } from "react";
import { getPackages, createPackage} from "../api/packageService";
import type { Shipment } from "../api/packageService";

export default function PackagesPage() {
  const [packages, setPackages] = useState<Shipment[]>([]);
  const [form, setForm] = useState<Shipment>({ code: "", origin: "", destination: "" });

  useEffect(() => {
    getPackages().then(setPackages).catch(console.error);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newPkg = await createPackage(form);
    setPackages([...packages, newPkg]);
    setForm({ code: "", origin: "", destination: "" });
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
        <button className="btn btn-primary w-full">Guardar</button>
      </form>

      <div className="w-full max-w-lg">
        <h2 className="text-xl font-semibold mb-3">Lista de Paquetes</h2>
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
