import { API } from "../api/api";
import type { SimulationStartResponse, SimulationStartRequest, SimulationStatus, DeliveredPage } from "../types/simulation";
import type { SimulationFinalReport } from "../types/simulation";

const startSimulation = async (request: SimulationStartRequest): Promise<SimulationStartResponse> => {
  const res = await API.post<SimulationStartResponse>("/simulations", request);
  return res.data;
};

const prewarmWorld = async (): Promise<string> => {
  const res = await API.post<{ token: string }>("/simulations/prewarm");
  return res.data.token;
};

const cancelSimulation = async (simulationId: string): Promise<void> => {
  await API.delete(`/simulations/${simulationId}`);
};

const pauseSimulation = async (simulationId: string): Promise<void> => {
  await API.post(`/simulations/${simulationId}/pause`);
};

const resumeSimulation = async (simulationId: string): Promise<void> => {
  await API.post(`/simulations/${simulationId}/resume`);
};

const touchSimulation = async (simulationId: string): Promise<void> => {
  await API.post(`/simulations/${simulationId}/touch`);
};

const getStatus = async (simulationId: string): Promise<SimulationStatus> => {
  const res = await API.get<SimulationStatus>(`/simulations/${simulationId}/status`);
  return res.data;
};

const getReport = async (simulationId: string): Promise<SimulationFinalReport> => {
  const res = await API.get<SimulationFinalReport>(`/simulations/${simulationId}/report`);
  return res.data;
};

const getDeliveries = async (simulationId: string, page = 0, size = 20, search?: string): Promise<DeliveredPage> => {
  const params: Record<string, string | number> = { page, size };
  if (search) {
    params.search = search;
  }
  const res = await API.get<DeliveredPage>(`/simulations/${simulationId}/deliveries`, { params });
  return res.data;
};

export const simulacionService = {
  startSimulation,
  prewarmWorld,
  cancelSimulation,
  pauseSimulation,
  resumeSimulation,
  touchSimulation,
  getStatus,
  getReport,
  getDeliveries,
};
