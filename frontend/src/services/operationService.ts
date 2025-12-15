import { API } from '../api/api';

export const operationService = {
  initWorld: (simTimeIso?: string) => API.post('/operation/world', simTimeIso ? { simTime: simTimeIso } : {}),
  setTime: (simTimeIso: string) => API.post('/operation/world/time', { simTime: simTimeIso }),
  getOrders: (simTimeIso: string, page = 0, size = 10) =>
    API.get('/operation/orders', { params: { simTime: simTimeIso, page, size } }).then(res => res.data),
};
