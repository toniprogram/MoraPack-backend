import { API } from "../api/api";
import type { Flight } from "../types/flight";

export const flightService = {
  getAll: () => API.get<Vuelo[]>("/base/flights").then(res => res.data),
  create: (vueloData: Omit<Vuelo, 'id'>) => API.post<Vuelo>("/base/flights", vueloData).then(res => res.data),
};