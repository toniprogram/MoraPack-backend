import { API } from "../api/api";
import type { Vuelo } from "../types/vuelo";

export const flightService = {
  getAll: () => API.get<Vuelo[]>("/vuelos").then(res => res.data),
  create: (vueloData: Omit<Vuelo, 'id'>) => API.post<Vuelo>("/vuelos", vueloData).then(res => res.data),
};