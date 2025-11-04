import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { flightService } from '../services/flightService';
import { aeropuertoService } from '../services/aeropuertoService';
import type { Vuelo } from '../types/vuelo';
import type { Aeropuerto } from '../types/aeropuerto';

export interface VueloSimulacion extends Vuelo {
  latActual: number;
  lonActual: number;
  progreso: number;
}

export const useSimulacion = () => {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['escenaSimulacion'],
    queryFn: async () => {
      const [vuelos, aeropuertos] = await Promise.all([
        flightService.getAll(),
        aeropuertoService.getAll(),
      ]);
      return { vuelos, aeropuertos };
    },
  });

  const [tiempoSimulacion, setTiempoSimulacion] = useState(0);
  const [estaActivo, setEstaActivo] = useState(false);

  const coordsAeropuertos = useMemo(() => {
    const map = new Map<string, { lat: number; lon: number }>();
    data?.aeropuertos?.forEach(a => map.set(a.codigo, { lat: a.latitud, lon: a.longitud }));
    return map;
  }, [data?.aeropuertos]);

  useEffect(() => {
    if (!estaActivo) return;
    const interval = setInterval(() => {
      setTiempoSimulacion(prev => prev + 1);
    }, 50); // ✅ Reducimos el intervalo a 50ms para un movimiento más fluido

    return () => clearInterval(interval);
  }, [estaActivo]);

  const vuelosSimulados: VueloSimulacion[] = useMemo(() => {
    if (!data?.vuelos) return [];

    return data.vuelos.map(vuelo => {
      const origen = coordsAeropuertos.get(vuelo.origen);
      const destino = coordsAeropuertos.get(vuelo.destino);

      if (!origen || !destino) return { ...vuelo, latActual: 0, lonActual: 0, progreso: 0 };

      // ✅ Nueva lógica de progreso: más rápido y en bucle
      // Cada vuelo tiene su propia velocidad basada en su ID para desfasarlos
      const velocidadBase = 0.4;
      const velocidadVuelo = velocidadBase + (vuelo.id % 5) * 0.05; // 0.4, 0.45, 0.5...
      const progreso = (tiempoSimulacion * velocidadVuelo) % 100; // El módulo (%) crea el bucle

      const ratio = progreso / 100;

      const latActual = origen.lat + (destino.lat - origen.lat) * ratio;
      const lonActual = origen.lon + (destino.lon - origen.lon) * ratio;

      return {
        ...vuelo,
        latActual,
        lonActual,
        progreso,
      };
    });
  }, [data?.vuelos, tiempoSimulacion, coordsAeropuertos]);

  const iniciar = useCallback(() => setEstaActivo(true), []);
  const pausar = useCallback(() => setEstaActivo(false), []);
  const reiniciar = useCallback(() => {
    setEstaActivo(false);
    setTiempoSimulacion(0);
  }, []);

  return {
    vuelos: vuelosSimulados,
    aeropuertos: data?.aeropuertos ?? [],
    isLoading,
    isError,
    estaActivo,
    iniciar,
    pausar,
    reiniciar,
  };
};