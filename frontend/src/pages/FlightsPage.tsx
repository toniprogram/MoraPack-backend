import React, { useEffect, useState } from "react";
import { getFlights, createFlight } from "../api/flightService";
import type { Flight } from "../api/flightService";

const parseHHMM = (time: string): number => {
  if (!time.includes(":")) return 0;
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};
const formatMinutes = (minutes: number): string => {
  const h = Math.floor(minutes / 60).toString().padStart(2, '0');
  const m = (minutes % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
};

export default function FlightsPage() {
  const [flights, setFlights] = useState<Flight[]>([]);

  const [form, setForm] = useState({
    orig: "",
    dest: "",
    depTime: "",
    arrTime: "",
    capacity: "100"
  });

  useEffect(() => {
    getFlights().then(setFlights).catch(console.error);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const newFlight: Omit<Flight, 'id'> = {
      orig: form.orig.toUpperCase(),
      dest: form.dest.toUpperCase(),
      depLocalMin: parseHHMM(form.depTime),
      arrLocalMin: parseHHMM(form.arrTime),
      capacity: parseInt(form.capacity, 10)
    };

    const createdFlight = await createFlight(newFlight);
    setFlights([...flights, createdFlight]);

    setForm({ orig: "", dest: "", depTime: "", arrTime: "", capacity: "100" });
  };

  return (
    <div className="min-h-screen bg-base-200 p-10 flex flex-col items-center">
      <h1 className="text-3xl font-bold mb-6 text-primary">✈️ Gestión de Vuelos</h1>

      <form onSubmit={handleSubmit} className="card bg-base-100 p-6 w-full max-w-md shadow-lg mb-8">
        <div className="grid grid-cols-2 gap-4">
          <input
            className="input input-bordered"
            name="orig"
            placeholder="Origen"
            value={form.orig}
            onChange={handleChange}
            maxLength={4}
            required
          />
          <input
            className="input input-bordered"
            name="dest"
            placeholder="Destino"
            value={form.dest}
            onChange={handleChange}
            maxLength={4}
            required
          />
          <input
            className="input input-bordered"
            name="depTime"
            placeholder="Salida (HH:MM)"
            type="time"
            value={form.depTime}
            onChange={handleChange}
            required
          />
          <input
            className="input input-bordered"
            name="arrTime"
            placeholder="Llegada (HH:MM)"
            type="time"
            value={form.arrTime}
            onChange={handleChange}
            required
          />
        </div>
        <input
          className="input input-bordered w-full mt-4"
          name="capacity"
          placeholder="Capacidad"
          type="number"
          value={form.capacity}
          onChange={handleChange}
          required
        />
        <button className="btn btn-primary w-full mt-4">Guardar Vuelo</button>
      </form>

      <div className="w-full max-w-2xl">
        <h2 className="text-xl font-semibold mb-3">Lista de Vuelos</h2>
        <ul className="space-y-2">
          {flights.map((flight) => (
            <li key={flight.id} className="card bg-base-100 p-4 shadow-sm flex justify-between items-center">
              <div>
                <strong>{flight.orig} ➜ {flight.dest}</strong>
                <span className="text-sm ml-4 text-gray-500">
                  {formatMinutes(flight.depLocalMin)} - {formatMinutes(flight.arrLocalMin)}
                </span>
              </div>
              <div className="badge badge-outline">Cap: {flight.capacity}</div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}