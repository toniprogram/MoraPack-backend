import React from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Aeropuerto } from '../../types/aeropuerto';
import type { VueloSimulacion } from '../../hooks/useSimulacion';

const planeIcon = new L.Icon({
  iconUrl: '/images/plane-icon.png',
  iconSize: [25, 25],
  iconAnchor: [12, 12],
});

const hubIcon = new L.Icon({
  iconUrl: '/images/hub-icon.png',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

interface MapaVuelosProps {
  vuelos: VueloSimulacion[];
  aeropuertos: Aeropuerto[];
}

export function MapaVuelos({ vuelos, aeropuertos }: MapaVuelosProps) {
  const initialPosition: L.LatLngExpression = [-12.02, -77.11];

  const coordsAeropuertos = new Map(
    aeropuertos.map(a => [a.codigo, [a.latitud, a.longitud] as L.LatLngExpression])
  );

  return (
    <MapContainer center={initialPosition} zoom={3} className="w-full h-full z-0">
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />

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
            {/* 1. Dibuja la trayectoria del vuelo */}
            <Polyline
              positions={[origenCoords, destinoCoords]}
              color="#3b82f6"
              weight={2}
              opacity={0.5}
              dashArray="5, 10" // Línea punteada
            />

            {/* 2. Dibuja el avión */}
            <Marker
              position={[vuelo.latActual, vuelo.lonActual]}
              icon={planeIcon} // Usamos el ícono de imagen
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