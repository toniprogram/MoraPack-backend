package com.morapack.skyroute.simulation.live;

import com.morapack.skyroute.models.Order;
import com.morapack.skyroute.config.Config;
import com.morapack.skyroute.simulation.dto.ActiveSegment;
import com.morapack.skyroute.simulation.dto.OrderLoadTick;
import com.morapack.skyroute.simulation.dto.OrderStatusTick;
import com.morapack.skyroute.simulation.dto.SimulationOrderPlan;
import com.morapack.skyroute.simulation.dto.SimulationRoute;
import com.morapack.skyroute.simulation.dto.SimulationSegment;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.function.Consumer;

/**
 * Clase dedicada EXCLUSIVAMENTE a la Operación en Vivo.
 * Contiene la lógica corregida para Fast Forward y manejo de vuelos reales.
 */
public class LiveOperationWorld {
    private final String operationId;
    private final Instant startTime;
    private Instant currentSimTime;

    private final Map<String, LiveFlight> activeFlights = new HashMap<>();
    private final PriorityQueue<LiveFlight> scheduledFlights = new PriorityQueue<>();
    private final Map<String, LiveFlight> scheduledByKey = new HashMap<>();
    private final List<LiveFlight> completedFlights = new ArrayList<>();
    private final Map<String, LiveOrder> orders = new HashMap<>();
    private final Map<String, LiveAirport> airports = new HashMap<>();
    // Inventario por aeropuerto y pedido
    private final Map<String, Map<String, Integer>> airportInventory = new HashMap<>();
    private final PriorityQueue<ReleaseEvent> releaseQueue = new PriorityQueue<>(Comparator.comparing(ReleaseEvent::releaseTime));
    // KPIs en tiempo real
    private final Map<String, Integer> airportLoads = new HashMap<>();
    private final Map<String, Integer> maxObservedLoad = new HashMap<>();
    private final Map<String, Instant> airportResetMap = new HashMap<>();
    private final Set<String> deliveredEmitted = new HashSet<>();
    private final Map<String, OrderStatusTick> deliveredOnce = new HashMap<>();
    private final Map<String, OrderStatusTick> plannedOnce = new HashMap<>();

    public LiveOperationWorld(String operationId,
                              Instant startTime,
                              Map<String, LiveAirport> baseAirports) {
        this.operationId = operationId;
        this.startTime = startTime;
        this.currentSimTime = startTime;

        if (baseAirports != null) {
            this.airports.putAll(baseAirports);
            // Inicializar mapa de reseteo para el fix de Fast Forward
            Instant startHour = startTime.truncatedTo(ChronoUnit.HOURS);
            this.airports.keySet().forEach(code -> airportResetMap.put(code, startHour));
        }
    }

    // --- MÉTODOS DE REGISTRO ---
    public void registerOrderBasic(String orderId,
                                   int quantity,
                                   String destinationCode,
                                   Instant creationUtc,
                                   Instant dueUtc) {
        if (orderId == null || quantity <= 0) return;
        if (orders.containsKey(orderId)) return;
        orders.put(orderId, new LiveOrder(
                orderId,
                quantity,
                destinationCode,
                creationUtc != null ? creationUtc : startTime,
                dueUtc != null ? dueUtc : startTime.plus(Config.WAREHOUSE_DWELL)
        ));
    }

    public void scheduleFutureFlight(LiveFlight flight, String orderId, int quantity) {
        String key = flight.getFlightId() + "|" + flight.getDepartureTime();
        LiveFlight target = scheduledByKey.computeIfAbsent(key, k -> {
            scheduledFlights.add(flight);
            return flight;
        });
        target.addLoad(orderId, quantity);

        LiveOrder order = orders.get(orderId);
        if (order != null) {
            order.addLeg(new OrderFlightLeg(
                    target.getFlightId(),
                    target.getOrigin(),
                    target.getDestination(),
                    target.getDepartureTime(),
                    target.getArrivalTime(),
                    quantity
            ));
            order.decrementPending(quantity);
        }
    }

    public void registerPlanned(OrderStatusTick planned) {
        if (planned == null || planned.orderId() == null) return;
        plannedOnce.put(planned.orderId(), planned);
    }

    public void tick(long simSeconds) {
        if (simSeconds <= 0) return;
        currentSimTime = currentSimTime.plusSeconds(simSeconds);

        // Procesar vuelos programados
        while (!scheduledFlights.isEmpty() && !scheduledFlights.peek().getDepartureTime().isAfter(currentSimTime)) {
            LiveFlight flight = scheduledFlights.poll();
            scheduledByKey.remove(flight.getFlightId() + "|" + flight.getDepartureTime());

            LiveAirport origin = airports.get(flight.getOrigin());
            if (origin != null) {
                Instant flightHour = flight.getDepartureTime().truncatedTo(ChronoUnit.HOURS);
                Instant lastReset = airportResetMap.getOrDefault(flight.getOrigin(), Instant.MIN);

                // Si la hora del vuelo es nueva para este aeropuerto, reseteamos su capacidad
                if (!flightHour.equals(lastReset)) {
                    origin.resetHour();
                    airportResetMap.put(flight.getOrigin(), flightHour);
                }
            }
            if (origin == null || !origin.canProcess(flight.getCapacityUsed())) {
                continue;
            }
            // Gestión de inventario en origen (Salida)
            if (flight.getCapacityUsed() > 0) {
                Map<String, Integer> inv = airportInventory.computeIfAbsent(flight.getOrigin(), k -> new HashMap<>());
                flight.getOrderLoads().forEach((orderId, qty) -> {
                    int current = inv.getOrDefault(orderId, 0);
                    int remaining = Math.max(0, current - qty);
                    if (remaining > 0) inv.put(orderId, remaining);
                    else inv.remove(orderId);
                });
                recomputeAirportLoad(flight.getOrigin());
            }

            origin.process(flight.getCapacityUsed());
            flight.tryDepart();
            activeFlights.put(flight.getFlightId() + "|" + flight.getDepartureTime(), flight);
            // Actualizar estado de órdenes a IN_TRANSIT
            flight.getOrderLoads().forEach((orderId, qty) -> {
                LiveOrder order = orders.get(orderId);
                if (order != null) {
                    order.markInTransit(flight.getDepartureTime(), flight.getOrigin(), flight.getFlightId(), qty);
                }
            });
        }
        // Procesar llegadas (Arrivals)
        List<String> toRemove = new ArrayList<>();
        for (Map.Entry<String, LiveFlight> entry : activeFlights.entrySet()) {
            LiveFlight flight = entry.getValue();
            if (flight.hasArrived(currentSimTime)) {
                flight.markCompleted();
                completedFlights.add(flight);

                // Gestión de inventario en destino (Llegada)
                if (flight.getCapacityUsed() > 0) {
                    Map<String, Integer> inv = airportInventory.computeIfAbsent(flight.getDestination(), k -> new HashMap<>());
                    flight.getOrderLoads().forEach((orderId, qty) -> inv.merge(orderId, qty, Integer::sum));
                    recomputeAirportLoad(flight.getDestination());
                }
                // Actualizar órdenes
                flight.getOrderLoads().forEach((orderId, qty) -> {
                    LiveOrder order = orders.get(orderId);
                    if (order != null) {
                        boolean esDestinoFinal = order.getDestinationCode() != null && order.getDestinationCode().equals(flight.getDestination());
                        if (esDestinoFinal) {
                            order.decrementRemainingToDestination(qty);
                            order.markWaiting(flight.getArrivalTime());
                            // Programar liberación del almacén (Dwell time)
                            releaseQueue.add(new ReleaseEvent(
                                    flight.getArrivalTime().plus(Config.WAREHOUSE_DWELL),
                                    flight.getDestination(),
                                    orderId,
                                    qty
                            ));
                        }
                    }
                });
                toRemove.add(entry.getKey());
            }
        }
        toRemove.forEach(activeFlights::remove);

        // Procesar liberaciones (Deliveries)
        while (!releaseQueue.isEmpty() && !releaseQueue.peek().releaseTime.isAfter(currentSimTime)) {
            ReleaseEvent ev = releaseQueue.poll();
            Map<String, Integer> inv = airportInventory.computeIfAbsent(ev.airportCode, k -> new HashMap<>());
            int current = inv.getOrDefault(ev.orderId, 0);
            int toRelease = Math.min(current, ev.quantity);
            if (toRelease > 0) {
                int remaining = current - toRelease;
                if (remaining > 0) inv.put(ev.orderId, remaining);
                else inv.remove(ev.orderId);

                recomputeAirportLoad(ev.airportCode);
                LiveOrder order = orders.get(ev.orderId);
                if (order != null) {
                    order.deliver(toRelease, ev.releaseTime, ev.airportCode, "release");
                }
            }
        }
    }

    // --- MÉTODOS DE VISUALIZACIÓN ---

    public List<ActiveSegment> toActiveSegments() {
        List<ActiveSegment> list = new ArrayList<>();
        for (LiveFlight flight : activeFlights.values()) {
            List<String> orderIds = new ArrayList<>(flight.getOrderLoads().keySet());
            List<OrderLoadTick> loads = flight.getOrderLoads().entrySet().stream()
                    .map(e -> new OrderLoadTick(e.getKey(), e.getValue()))
                    .toList();
            Double lat = null, lon = null, progress = null;

            LiveAirport origin = airports.get(flight.getOrigin());
            LiveAirport dest = airports.get(flight.getDestination());

            if (origin != null && dest != null) {
                Instant dep = flight.getDepartureTime();
                Instant arr = flight.getArrivalTime();
                double pct = 0.0;
                if (currentSimTime.isAfter(arr) || currentSimTime.equals(arr)) pct = 1.0;
                else if (currentSimTime.isBefore(dep)) pct = 0.0;
                else {
                    long total = arr.toEpochMilli() - dep.toEpochMilli();
                    long elapsed = currentSimTime.toEpochMilli() - dep.toEpochMilli();
                    pct = total > 0 ? Math.min(1.0, Math.max(0.0, (double) elapsed / total)) : 0.0;
                }
                lat = origin.getLatitude() + (dest.getLatitude() - origin.getLatitude()) * pct;
                lon = origin.getLongitude() + (dest.getLongitude() - origin.getLongitude()) * pct;
                progress = pct * 100.0;
            }
            list.add(new ActiveSegment(
                    flight.getFlightId() + "|" + flight.getDepartureTime(),
                    flight.getFlightId(),
                    flight.getOrigin(),
                    flight.getDestination(),
                    flight.getDepartureTime().toString(),
                    flight.getArrivalTime().toString(),
                    orderIds,
                    flight.getCapacityUsed(),
                    flight.getCapacityTotal(),
                    loads,
                    lat,
                    lon,
                    progress
            ));
        }
        return list;
    }

    public List<OrderStatusTick> buildOrderStatuses() {
        List<OrderStatusTick> list = new ArrayList<>();
        Map<String, String> orderStatus = new HashMap<>();
        Map<String, Integer> orderQty = new HashMap<>();
        Map<String, String> orderLoc = new HashMap<>();

        for (LiveFlight flight : activeFlights.values()) {
            flight.getOrderLoads().forEach((orderId, qty) -> {
                orderStatus.put(orderId, "IN_TRANSIT");
                orderQty.merge(orderId, qty, Integer::sum);
                orderLoc.put(orderId, flight.getDestination());
            });
        }

        airportInventory.forEach((airport, inv) -> {
            inv.forEach((orderId, qty) -> {
                if (qty > 0) {
                    String current = orderStatus.getOrDefault(orderId, "IN_TRANSIT");
                    orderStatus.put(orderId, current);
                    orderQty.merge(orderId, qty, Integer::sum);
                    orderLoc.put(orderId, airport);
                }
            });
        });

        orders.values().forEach(order -> {
            if (order.getDeliveredQuantity() >= order.getTotalQuantity()) {
                if (!deliveredEmitted.contains(order.getOrderId())) {
                    OrderStatusTick delivered = new OrderStatusTick(
                            order.getOrderId(), "DELIVERED", order.getDestinationCode(), order.getDeliveredQuantity());
                    list.add(delivered);
                    deliveredEmitted.add(order.getOrderId());
                    deliveredOnce.put(order.getOrderId(), delivered);
                }
                return;
            }
            String status = orderStatus.get(order.getOrderId());
            int qty = orderQty.getOrDefault(order.getOrderId(), 0);
            String loc = orderLoc.getOrDefault(order.getOrderId(), "");
            if (status == null) return;
            if (order.getDestinationCode().equals(loc) && order.getRemainingToDestination() == 0) status = "READY_PICKUP";
            list.add(new OrderStatusTick(order.getOrderId(), status, loc, qty));
        });
        return list;
    }

    public List<SimulationOrderPlan> buildOrderPlansForTick() {
        Map<String, List<SimulationSegment>> segmentsPorOrden = new HashMap<>();
        Consumer<LiveFlight> addFlightSegments = (LiveFlight flight) -> {
            flight.getOrderLoads().forEach((orderId, qty) -> {
                LocalDate date = flight.getDepartureTime().atZone(ZoneOffset.UTC).toLocalDate();
                SimulationSegment seg = new SimulationSegment(
                        flight.getFlightId(), flight.getOrigin(), flight.getDestination(),
                        date, qty, flight.getDepartureTime(), flight.getArrivalTime()
                );
                segmentsPorOrden.computeIfAbsent(orderId, k -> new ArrayList<>()).add(seg);
            });
        };
        activeFlights.values().forEach(addFlightSegments);
        completedFlights.forEach(addFlightSegments);
        for (LiveFlight flight : new ArrayList<>(scheduledFlights)) addFlightSegments.accept(flight);

        List<SimulationOrderPlan> plans = new ArrayList<>();
        segmentsPorOrden.forEach((orderId, segs) -> {
            segs.sort(Comparator.comparing(SimulationSegment::departureUtc));
            int qtyTotal = segs.stream().mapToInt(SimulationSegment::quantity).sum();
            SimulationRoute route = new SimulationRoute(qtyTotal, 0L, List.copyOf(segs));
            LiveOrder lo = orders.get(orderId);
            plans.add(new SimulationOrderPlan(orderId, lo != null ? lo.getCreationUtc() : null, 0L, List.of(route)));
        });

        orders.forEach((orderId, liveOrder) -> {
            if (!segmentsPorOrden.containsKey(orderId)) {
                SimulationRoute route = new SimulationRoute(liveOrder.getTotalQuantity(), 0L, List.of());
                plans.add(new SimulationOrderPlan(orderId, liveOrder.getCreationUtc(), 0L, List.of(route)));
            }
        });
        return plans;
    }

    // --- GETTERS Y UTILIDADES ---
    private void recomputeAirportLoad(String airportCode) {
        Map<String, Integer> inv = airportInventory.getOrDefault(airportCode, Map.of());
        int total = inv.values().stream().filter(Objects::nonNull).mapToInt(Integer::intValue).sum();
        airportLoads.put(airportCode, total);
        maxObservedLoad.merge(airportCode, total, Math::max);

        LiveAirport airport = airports.get(airportCode);
        if (airport != null && total > 0) airport.process(total);
    }

    public List<OrderStatusTick> buildDeliveredStatuses() { return new ArrayList<>(deliveredOnce.values()); }
    public List<OrderStatusTick> buildPlannedStatuses() {
        List<OrderStatusTick> p = new ArrayList<>(plannedOnce.values());
        plannedOnce.clear();
        return p;
    }
    public int countDeliveredOrders() { return (int) orders.values().stream().filter(o -> o.getDeliveredQuantity() >= o.getTotalQuantity()).count(); }
    public int countInTransitOrders() { return (int) orders.values().stream().filter(o -> o.getDeliveredQuantity() < o.getTotalQuantity() && o.getStatus() == LiveOrder.Status.IN_TRANSIT).count(); }

    public Map<String, LiveFlight> getActiveFlights() { return activeFlights; }
    public Map<String, LiveOrder> getOrders() { return orders; }
    public Instant getCurrentSimTime() { return currentSimTime; }
    public String getOperationId() { return operationId; }
    public Map<String, LiveAirport> getAirports() { return airports; }
    public Map<String, Integer> getAirportLoads() { return airportLoads; }
    public Map<String, Map<String, Integer>> getAirportInventory() { return airportInventory; }

    private record ReleaseEvent(Instant releaseTime, String airportCode, String orderId, int quantity) {}
}