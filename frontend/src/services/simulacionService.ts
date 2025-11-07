import { API } from "../api/api";
import type { OrderRequest } from "../types/orderRequest";
import type { SimulationStartResponse, SimulationStartRequest } from "../types/simulacion";

const startSimulation = async (request: SimulationStartRequest): Promise<SimulationStartResponse> => {
  const res = await API.post<SimulationStartResponse>("/simulations", request);
  return res.data;
};

export const simulacionService = {
  startSimulation,
};