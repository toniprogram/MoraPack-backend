import { API } from "../api/api";

export interface Flight {
  id?: number;
  orig: string;
  dest: string;
  depLocalMin: number;
  arrLocalMin: number;
  capacity: number;
}

export const getFlights = async (): Promise<Flight[]> => {
  const res = await API.get<Flight[]>("/flights");
  return res.data;
};

export const createFlight = async (flight: Flight): Promise<Flight> => {
  const res = await API.post<Flight>("/flights", flight);
  return res.data;
};