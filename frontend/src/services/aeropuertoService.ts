import { API } from "../api/api";
import type { Aeropuerto } from "../types/aeropuerto";

export const aeropuertoService = {
  getAll: () => API.get<Aeropuerto[]>("/aeropuertos").then(res => res.data),
};