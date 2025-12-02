import type { SimulationOrderPlan } from './simulation';

export type EnvioEstado = 'Recibido' | 'Planificado' | 'En tránsito' | 'Entregado';

export interface EnvioInfo {
  plan: SimulationOrderPlan;
  estado: EnvioEstado;
  creationMs: number;
  arrivalMs: number;
}

export interface FlightGroup {
  flightId: string;
  origen: string;
  destino: string;
  pedidos: string[];
  hora: string;
  fecha: string;
  departureUtc: string;
  arrivalUtc: string;
  horaLlegada: string;
}
