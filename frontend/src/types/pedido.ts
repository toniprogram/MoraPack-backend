export interface Pedido {
  id: string;
  destino: string;
  cantidad: string;
  estado: "pendiente" | "en ruta" | "entregado";
  fecha: string;
}