import { API } from '../api/api';

export const operationService = {
  initWorld: (simTimeIso?: string) => API.post('/operation/world', simTimeIso ? { simTime: simTimeIso } : {}),
  setTime: (simTimeIso: string) => API.post('/operation/world/time', { simTime: simTimeIso }),
};
