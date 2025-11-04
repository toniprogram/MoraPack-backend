export interface Pedido {
  id: string;
  destino: string;
  cantidad: number;
  estado: "pendiente" | "en ruta" | "entregado";
  fecha: string;
}