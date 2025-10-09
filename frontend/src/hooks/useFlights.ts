import { useCallback } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  createFlight as createFlightRequest,
  getFlights,
  type Flight,
} from "../services/flightService";

interface FlightFormData extends Omit<Flight, "id"> {}

const flightsListKey = ["flights", "list"] as const;
const flightDetailKey = (id: number | string) =>
  ["flights", "detail", id] as const;

export function useFlights() {
  const queryClient = useQueryClient();

  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: flightsListKey,
    queryFn: getFlights,
  });

  const createFlightMutation = useMutation({
    mutationFn: createFlightRequest,
    onSuccess: (created) => {
      queryClient.setQueryData<Flight[]>(
        flightsListKey,
        (prev = []) => [...prev, created]
      );
      if (created.id !== undefined) {
        queryClient.setQueryData(flightDetailKey(created.id), created);
      }
    },
  });

  const createFlight = useCallback(
    (flight: FlightFormData) => createFlightMutation.mutateAsync(flight),
    [createFlightMutation]
  );

  const friendlyError =
    error || createFlightMutation.error
      ? "No se pudieron cargar o actualizar los vuelos"
      : null;

  return {
    flights: data ?? [],
    loading: isLoading,
    fetching: isFetching,
    error: friendlyError,
    queryError: error,
    mutationError: createFlightMutation.error,
    fetchFlights: refetch,
    createFlight,
    creating: createFlightMutation.isPending,
  };
}