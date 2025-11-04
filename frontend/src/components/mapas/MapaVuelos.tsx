import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import L, { LatLngBoundsExpression } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Aeropuerto } from '../../types/aeropuerto';
import type { VueloSimulacion } from '../../hooks/useSimulacion';
import MapResizer from './MapResizer';

// --- Iconos ---
const planeIcon = new L.Icon({
  iconUrl: '/images/plane-icon.png',
  iconSize: [25, 25],
  iconAnchor: [12, 12],
});

const hubIcon = new L.Icon({
  iconUrl: '/images/hub-icon.png',
  iconSize: [30, 40],
  iconAnchor: [10, 10],
});

// --- Props ---
interface MapaVuelosProps {
  vuelos: VueloSimulacion[];
  aeropuertos: Aeropuerto[];
  isLoading: boolean;
}

// límites del mundo
const worldBounds: LatLngBoundsExpression = [
  [-90, -180],
  [90, 180]
];

export function MapaVuelos({ vuelos, aeropuertos, isLoading }: MapaVuelosProps) {
  const initialPosition: L.LatLngExpression = [-12.02, -77.11];

  const coordsAeropuertos = new Map(
    aeropuertos.map(a => [a.codigo, [a.latitud, a.longitud] as L.LatLngExpression])
  );

  return (
    <MapContainer
      center={initialPosition}
      zoom={3}
      className="w-full h-full z-0"
      // Añade estas propiedades para limitar el mapa
      minZoom={2}
      maxBounds={worldBounds}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        noWrap={true}
      />

      {/* Componente que arregla el tamaño */}
      <MapResizer isLoading={isLoading} />

      {/* LEYENDA (Completa) */}
      <div className="absolute bottom-4 left-4 z-[1000] card bg-base-100 p-2 shadow-lg">
        <h4 className="font-bold mb-1">Leyenda</h4>
        <ul className="text-sm space-y-1">
          <li className="flex items-center gap-2">
            <img src="/images/plane-icon.png" alt="avión azul" className="w-4 h-4" /> En curso
          </li>
          <li className="flex items-center gap-2">
            <img src="/images/plane-icon-green.png" alt="avión verde" className="w-4 h-4" /> Finalizado
          </li>
          <li className="flex items-center gap-2">
            <img src="/images/plane-icon-red.png" alt="avión rojo" className="w-4 h-4" /> Retrasado
          </li>
        </ul>
      </div>

      {/* Dibuja solo las sedes principales */}
      {aeropuertos
        .filter(aeropuerto => aeropuerto.esExportador)
        .map(aeropuerto => (
          <Marker
            key={aeropuerto.codigo}
            position={[aeropuerto.latitud, aeropuerto.longitud]}
            icon={hubIcon}
          >
            <Popup><strong>{aeropuerto.codigo}</strong><br />Sede Principal</Popup>
          </Marker>
      ))}

      {/* Dibuja los aviones y sus trayectorias */}
      {vuelos.map(vuelo => {
        const origenCoords = coordsAeropuertos.get(vuelo.origen);
        const destinoCoords = coordsAeropuertos.get(vuelo.destino);

        if (!origenCoords || !destinoCoords) return null;

        return (
          <React.Fragment key={vuelo.id}>
            <Polyline
              positions={[origenCoords, destinoCoords]}
              color="#3b82f6"
              weight={2}
              opacity={0.5}
              dashArray="5, 10"
            />
            <Marker
              position={[vuelo.latActual, vuelo.lonActual]}
              icon={planeIcon}
            >
              <Popup>
                Vuelo #{vuelo.id}<br />
                {vuelo.origen} → {vuelo.destino}<br />
                Progreso: {Math.round(vuelo.progreso)}%
              </Popup>
            </Marker>
          </React.Fragment>
        );
      })}
    </MapContainer>
  );
}