import { API } from "../api/api";
import type { Order } from "../types/order";

export const orderService = {
  getAll: () => API.get<Order[]>("/orders").then(res => res.data),
};