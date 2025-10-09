import React from "react";
import PackagesPage from "./pages/PackagesPages";
import Navbar from "./components/Navbar";

export default function App() {
  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="p-8">
        <PackagesPage />
      </div>
    </div>
  );
}