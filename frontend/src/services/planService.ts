import { API } from "../api/api";
import type { CurrentPlanResponse } from "../types/plan";

export const planService = {
  // Ejecuta el algoritmo (Botón Planificar)
  runPlanning: (recalculate: boolean = true) =>
    API.post<{ status: string; message: string }>('/plan/run', { recalculate }).then(res => res.data),

  // Obtiene el plan vigente (Para pintar el mapa)
  getCurrentPlan: () =>
    API.get<CurrentPlanResponse>('/plan/current').then(res => res.data),

  // Limpia el plan (Opcional)
  resetPlan: () => API.delete('/plan/current'),

  // Limpia toda la información de planificación (plan + capacidades)
  resetAllPlans: () => API.delete('/plan/all'),
};
