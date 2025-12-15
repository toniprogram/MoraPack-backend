import { useOperacion } from './useOperacion';
import { useSimulacion } from './useSimulacion';
import type { ActiveAirportTick } from '../types/simulation';
import type { SegmentoVuelo as SegmentoOp, VueloEnMovimiento as VueloOp, OrderStatusDetail, OperationMetrics } from './useOperacion';
import type { SegmentoVuelo as SegmentoSim, VueloEnMovimiento as VueloSim } from './useSimulacion';

type Mode = 'sim' | 'op';

type CommonSegments = SegmentoSim | SegmentoOp;
type CommonVuelos = VueloSim | VueloOp;

export interface SimEngineResult {
  mode: Mode;
  aeropuertos: ReturnType<typeof useOperacion>['aeropuertos'] | ReturnType<typeof useSimulacion>['aeropuertos'];
  activeSegments: CommonSegments[];
  vuelosEnMovimiento: CommonVuelos[];
  orderStatuses: OrderStatusDetail[] | ReturnType<typeof useSimulacion>['orderStatuses'];
  activeAirports?: ActiveAirportTick[];
  planSource: unknown;
  clock: Date | null;
  status: string;
  isLoading?: boolean;
  metrics?: OperationMetrics;
  // Controles (solo los que aplican)
  start?: (...args: any[]) => void;
  pause?: () => void;
  stop?: () => void;
  clearPlan?: () => void;
  resetTime?: () => void;
  isReplanning?: boolean;
  isClearingPlan?: boolean;
  lastUpdated?: Date | null;
}

/**
 * Hook envoltorio que expone un shape común tanto para simulación semanal
 * como para operación diaria. En modo "op" fija la velocidad a 1x y usa el
 * plan persistido; en modo "sim" delega al hook de simulación.
 */
export function useSimEngine(mode: Mode = 'sim'): SimEngineResult {
  if (mode === 'sim') {
    const sim = useSimulacion();
    return {
      mode,
      aeropuertos: sim.aeropuertos,
      activeSegments: sim.activeSegments,
      vuelosEnMovimiento: sim.vuelosEnMovimiento,
      orderStatuses: sim.orderStatuses,
      activeAirports: sim.activeAirports,
      planSource: sim.orderPlans,
      clock: sim.tiempoSimulado,
      status: sim.status,
      isLoading: sim.isLoading,
      start: sim.iniciar,
      pause: sim.pausar,
      stop: sim.terminar,
    };
  }

  const op = useOperacion();

  return {
    mode,
    aeropuertos: op.aeropuertos,
    activeSegments: op.activeSegments,
    vuelosEnMovimiento: op.vuelosEnMovimiento,
    orderStatuses: op.orderStatusList,
    activeAirports: undefined,
    planSource: (op as any).dayPlan ?? null,
    clock: op.simClock,
    status: op.status,
    isLoading: false,
    metrics: op.metrics,
    start: op.actions.planificar,
    clearPlan: op.actions.clearPlan,
    resetTime: op.actions.resetTime,
    isReplanning: op.isReplanning,
    isClearingPlan: op.isClearingPlan,
    lastUpdated: op.lastUpdated,
  };
}
