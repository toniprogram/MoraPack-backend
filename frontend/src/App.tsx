import React from "react";
import { Routes, Route } from "react-router-dom";
import FlightsPage from "./pages/FlightsPage";
import PedidosPage from "./pages/PedidosPage";
import Navbar from "./components/Navbar";

export default function App() {
  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="p-8">
        <Routes>
          <Route path="/" element={<PedidosPage />} />
          <Route path="/packages" element={<PedidosPage />} />
          <Route path="/flights" element={<FlightsPage />} />
        </Routes>
      </div>
    </div>
  );
}