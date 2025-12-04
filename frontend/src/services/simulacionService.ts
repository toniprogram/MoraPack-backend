import { API } from "../api/api";
import type { SimulationStartResponse, SimulationStartRequest, SimulationStatus } from "../types/simulation";
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

export const simulacionService = {
  startSimulation,
  prewarmWorld,
  cancelSimulation,
  pauseSimulation,
  resumeSimulation,
  touchSimulation,
  getStatus,
  getReport,
};
