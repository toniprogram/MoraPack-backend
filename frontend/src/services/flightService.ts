import { API } from "../api/api";
import type { Vuelo } from "../types/vuelo";

export const getFlights = async (): Promise<Flight[]> => {
  const res = await API.get<Flight[]>("/flights");
  return res.data;
};

export const createFlight = async (flight: Flight): Promise<Flight> => {
  const res = await API.post<Flight>("/flights", flight);
  return res.data;
};