// Corresponde a SimulationSegment.java
export interface SimulationSegment {
  flightId: string;
  origin: string;
  destination: string;
  date: string;
  quantity: number;
  departureUtc: string;
  arrivalUtc: string;
}

// Corresponde a SimulationRoute.java
export interface SimulationRoute {
  quantity: number;
  slackMinutes: number;
  segments: SimulationSegment[];
}

// Corresponde a SimulationOrderPlan.java
export interface SimulationOrderPlan {
  orderId: string;
  slackMinutes: number;
  routes: SimulationRoute[];
}

export interface OrderPlansDiff {
  simTime: string;
  added: SimulationOrderPlan[];
  updated: SimulationOrderPlan[];
  removed: string[];
}

// Corresponde a SimulationSnapshot.java
export interface SimulationSnapshot {
  simulationId: string;
  processedOrders: number;
  totalOrders: number;
  fitness: number;
  generatedAt: string;
  orderPlans: SimulationOrderPlan[];
}

// Corresponde a SimulationMessageType.java
export type SimulationMessageType = "PROGRESS" | "COMPLETED" | "ERROR";

// Corresponde a SimulationMessage.java
export interface SimulationMessage {
  simulationId: string;
  type: SimulationMessageType;
  snapshot: SimulationSnapshot | null;
  tick?: SimulationTick | null;
  error: string | null;
}

export interface ActiveSegmentTick {
  id: string;
  flightId: string;
  origin: string;
  destination: string;
  departureUtc: string;
  arrivalUtc: string;
  orderIds: string[];
  capacityUsed: number;
  capacityTotal: number;
  orderLoads?: { orderId: string; quantity: number }[];
}

export interface ActiveAirportTick {
  airportCode: string;
  currentLoad: number;
  maxThroughputPerHour: number;
  orderLoads?: { orderId: string; quantity: number }[];
}

export interface SimulationTick {
  simulationId: string;
  simTime: string;
  speed: number;
  status: string;
  orderPlans: SimulationOrderPlan[];
  orderPlansDiff?: OrderPlansDiff;
  activeSegments: ActiveSegmentTick[];
  activeAirports?: ActiveAirportTick[];
  deliveredOrders?: number;
  inTransitOrders?: number;
  orderStatuses?: OrderStatusTick[];
}

export interface OrderStatusTick {
  orderId: string;
  status: string; // PLANNED, IN_TRANSIT, READY_PICKUP
  location: string;
  quantity: number;
}

// Corresponde a SimulationStartRequest.java
export interface SimulationStartRequest {
  startDate?: string; // ISO 8601 sin zona
  endDate?: string;
  windowMinutes?: number;
  useHeuristicSeed?: boolean;
  prewarmToken?: string;
}

// Corresponde a SimulationStartResponse.java
export interface SimulationStartResponse {
  simulationId: string;
}

// Corresponde a SimulationStatus.java
export interface SimulationStatus {
  simulationId: string;
  processedOrders: number;
  totalOrders: number;
  completed: boolean;
  cancelled: boolean;
  error: string | null;
  lastSnapshot: SimulationSnapshot | null;
}
