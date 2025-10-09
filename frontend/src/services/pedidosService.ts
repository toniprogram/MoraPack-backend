import { API } from "../api/api";
import type { Pedido } from "../types/pedido";

export const pedidosService = {
    getAll: () => API.get<Pedido[]>("/pedidos").then(res => res.data),
    getOne: (id: string) => API.get<Pedido>(`/pedidos/${id}`).then(res => res.data),
    create: (pedido: Omit<Pedido, "id">) => API.post<Pedido>("/pedidos", pedido).then(res => res.data),
    update: (id: string, pedido: Partial<Pedido>) => API.put<Pedido>(`/pedidos/${id}`, pedido).then(res => res.data),
    delete: (id: string) => API.delete(`/pedidos/${id}`),
  };