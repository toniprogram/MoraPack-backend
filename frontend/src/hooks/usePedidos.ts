import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { pedidosService } from "../services/pedidosService";
import type { Pedido } from "../types/pedido";

//Claves de cache
const keys = {
  all: ["pedidos"] as const,
  one: (id: string) => ["pedidos", id] as const,
};

//Hook principal
export function usePedidos() {
  const queryClient = useQueryClient();

  // Obtener todos los pedidos
  const list = useQuery({
    queryKey: keys.all,
    queryFn: pedidosService.getAll,
  });

  //Crear pedido
  const create = useMutation({
    mutationFn: pedidosService.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all });
    },
  });

  //Actualizar pedido
  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Pedido> }) =>
      pedidosService.update(id, data),
    onSuccess: (_, variables) => {
      // Refresca tanto la lista como el detalle editado
      queryClient.invalidateQueries({ queryKey: keys.all });
      queryClient.invalidateQueries({ queryKey: keys.one(variables.id) });
    },
  });

  //Eliminar pedido
  const remove = useMutation({
    mutationFn: pedidosService.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all });
    },
  });

  return { list, create, update, remove };
}

// Obtener un pedido específico
export function usePedido(id: string) {
  return useQuery({
    queryKey: keys.one(id),
    queryFn: () => pedidosService.getOne(id),
    enabled: !!id,
  });
}
