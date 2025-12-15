export interface Segment {
  from: string;
  to: string;
  departure: string;
  arrival: string;
  flightId: string;
}

export interface Route {
  routeId: string;
  quantity: number;
  segments: Segment[];
}

export interface OrderPlan {
  orderId: string;
  routes: Route[];
  slackMinutes?: number;
}

export interface CurrentPlanResponse {
  generatedAt: string;
  fitness: number;
  orderPlans: OrderPlan[];
}