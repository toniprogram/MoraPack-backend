import React from "react";
import PedidosPage from "./pages/PedidosPage";
import Navbar from "./components/Navbar";

export default function App() {
  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="p-8">
        <PedidosPage />
      </div>
    </div>
  );
}