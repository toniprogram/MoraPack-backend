import type { Airport } from './airport';

export interface Order {
  id: string;
  customerReference: string;
  destinationAirport: Airport;
  quantity: number;
  creationUtc: string;
  dueUtc: string;
}