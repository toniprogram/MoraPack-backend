import React from "react";
import { Routes, Route } from "react-router-dom";
import PackagesPage from "./pages/PackagesPage";
import FlightsPage from "./pages/FlightsPage";
import PedidosPage from "./pages/PedidosPage";
import Navbar from "./components/Navbar";

export default function App() {
  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="p-8">
        <Routes>
          <Route path="/" element={<PackagesPage />} />
          <Route path="/packages" element={<PackagesPage />} />
          <Route path="/flights" element={<FlightsPage />} />
        </Routes>
        <PedidosPage />
      </div>
    </div>
  );
}