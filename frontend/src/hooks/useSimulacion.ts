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

// Función para formatear el reloj de la simulación
const formatearReloj = (tiempoTotalSegundos: number) => {
  const dias = Math.floor(tiempoTotalSegundos / (24 * 60 * 60));
  const horas = Math.floor((tiempoTotalSegundos % (24 * 60 * 60)) / 3600).toString().padStart(2, '0');
  const minutos = Math.floor((tiempoTotalSegundos % 3600) / 60).toString().padStart(2, '0');
  const segundos = (tiempoTotalSegundos % 60).toString().padStart(2, '0');
  return `${dias} Días - ${horas}:${minutos}:${segundos}`;
};

export const useSimulacion = () => {
  // --- CARGA DE DATOS  ---
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

  // --- ESTADOS DE SIMULACIÓN ---
  const [tiempoSimulacion, setTiempoSimulacion] = useState(0);
  const [estaActivo, setEstaActivo] = useState(false);

  // --- DATOS MEMORIZADOS ---
  const coordsAeropuertos = useMemo(() => {
      const map = new Map<string, { lat: number; lon: number }>();
      data?.aeropuertos?.forEach(a => map.set(a.codigo, { lat: a.latitud, lon: a.longitud }));
      return map;
  }, [data?.aeropuertos]);

  // --- LÓGICA DEL "RELOJ" ---
  useEffect(() => {
    if (!estaActivo) return;
    const interval = setInterval(() => {
      const factorVelocidad = 600;
      setTiempoSimulacion(prev => prev + (factorVelocidad * 0.05));
    }, 50);

    return () => clearInterval(interval);
  }, [estaActivo]);


  // --- LÓGICA DE MOVIMIENTO DE VUELOS ---
  const vuelosSimulados: VueloSimulacion[] = useMemo(() => {
    if (!data?.vuelos) return [];

    return data.vuelos.map(vuelo => {
      const origen = coordsAeropuertos.get(vuelo.origen);
      const destino = coordsAeropuertos.get(vuelo.destino);
      if (!origen || !destino) return { ...vuelo, latActual: 0, lonActual: 0, progreso: 0 };
o
      const duracionVuelo = 100;
      const tiempoInicio = (vuelo.id * 10) % 100; // Desfasa los vuelos
      let progreso = ((tiempoSimulacion - tiempoInicio) / duracionVuelo) * 100;
      progreso = (progreso % 100); // Bucle

      const ratio = progreso / 100;
      const latActual = origen.lat + (destino.lat - origen.lat) * ratio;
      const lonActual = origen.lon + (destino.lon - origen.lon) * ratio;

      return { ...vuelo, latActual, lonActual, progreso };
    });
  }, [data?.vuelos, tiempoSimulacion, coordsAeropuertos]);

// --- LÓGICA DE KPIs ---
  const kpis = useMemo(() => {
    if (!vuelosSimulados || vuelosSimulados.length === 0) {
      return { entregas: 0, retrasados: 0 };
    }

    let entregasATiempo = 0;
    let pedidosRetrasados = 0;

    vuelosSimulados.forEach(vuelo => {
      if (vuelo.progreso > 50) {
        if (vuelo.id % 4 === 0) {
          pedidosRetrasados++;
        } else {
          entregasATiempo++;
        }
      }
    });

    const totalEntregas = entregasATiempo + pedidosRetrasados;
    if (totalEntregas === 0) {
      return { entregas: 0, retrasados: 0 };
    }

    // Calculamos los porcentajes
    const porcentajeEntregas = Math.round((entregasATiempo / totalEntregas) * 100);
    const porcentajeRetrasados = 100 - porcentajeEntregas;

    return {
      entregas: porcentajeEntregas,
      retrasados: porcentajeRetrasados,
    };
  }, [vuelosSimulados]);

  // --- FUNCIONES DE CONTROL ---
  const iniciar = useCallback(() => setEstaActivo(true), []);
  const pausar = useCallback(() => setEstaActivo(false), []);
  const terminar = useCallback(() => {
    setEstaActivo(false);
    setTiempoSimulacion(0);
  }, []);

  // --- DATOS DEVUELTOS ---
  return {
    vuelos: vuelosSimulados,
    aeropuertos: data?.aeropuertos ?? [],
    isLoading,
    isError,
    estaActivo,
    iniciar,
    pausar,
    terminar,
    reloj: formatearReloj(Math.floor(tiempoSimulacion)),
    kpis: kpis,
  };
};