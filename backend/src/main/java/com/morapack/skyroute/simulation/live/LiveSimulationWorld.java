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

public class LiveSimulationWorld {
    private final String simulationId;
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
    // Inventario simplificado para KPI de capacidad
    private final Map<String, Integer> airportLoads = new HashMap<>();
    private final Map<String, Integer> maxObservedLoad = new HashMap<>();
    private Instant lastHourMark;
    // Para emitir estado final de entregados una sola vez
    private final Set<String> deliveredEmitted = new HashSet<>();
    private final Map<String, OrderStatusTick> deliveredOnce = new HashMap<>();

    public LiveSimulationWorld(String simulationId,
                               Instant startTime,
                               Map<String, LiveAirport> baseAirports,
                               List<Order> projectedOrders) {
        this.simulationId = simulationId;
        this.startTime = startTime;
        this.currentSimTime = startTime;
        this.lastHourMark = startTime.truncatedTo(ChronoUnit.HOURS);
        if (baseAirports != null) {
            this.airports.putAll(baseAirports);
        }
        if (projectedOrders != null) {
            for (Order order : projectedOrders) {
                orders.put(order.getId(), new LiveOrder(
                        order.getId(),
                        order.getQuantity(),
                        order.getDestinationCode(),
                        order.getCreationUtc(),
                        order.getDueUtc()
                ));
            }
        }
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
            order.markWaiting(flight.getDepartureTime());
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

    public void tick(long simSeconds) {
        if (simSeconds <= 0) {
            return;
        }
        Instant previous = currentSimTime;
        currentSimTime = currentSimTime.plusSeconds(simSeconds);

        // reset throughput on hour change
        Instant newHour = currentSimTime.truncatedTo(ChronoUnit.HOURS);
        if (!newHour.equals(lastHourMark)) {
            airports.values().forEach(LiveAirport::resetHour);
            lastHourMark = newHour;
        }

        // activate flights
        while (!scheduledFlights.isEmpty() && !scheduledFlights.peek().getDepartureTime().isAfter(currentSimTime)) {
            LiveFlight flight = scheduledFlights.poll();
            scheduledByKey.remove(flight.getFlightId() + "|" + flight.getDepartureTime());
            LiveAirport origin = airports.get(flight.getOrigin());
            if (origin == null || !origin.canProcess(flight.getCapacityUsed())) {
                continue;
            }
            // descargar inventario del origen si existe
            if (flight.getCapacityUsed() > 0) {
                Map<String, Integer> inv = airportInventory.computeIfAbsent(flight.getOrigin(), k -> new HashMap<>());
                flight.getOrderLoads().forEach((orderId, qty) -> {
                    int current = inv.getOrDefault(orderId, 0);
                    int remaining = Math.max(0, current - qty);
                    if (remaining > 0) {
                        inv.put(orderId, remaining);
                    } else {
                        inv.remove(orderId);
                    }
                });
                recomputeAirportLoad(flight.getOrigin());
            }
            origin.process(flight.getCapacityUsed());
            flight.tryDepart();
            activeFlights.put(flight.getFlightId() + "|" + flight.getDepartureTime(), flight);
            flight.getOrderLoads().forEach((orderId, qty) -> {
                LiveOrder order = orders.get(orderId);
                if (order != null) {
                    order.markInTransit(flight.getDepartureTime(), flight.getOrigin(), flight.getFlightId(), qty);
                }
            });
        }

        // arrive flights
        List<String> toRemove = new ArrayList<>();
        for (Map.Entry<String, LiveFlight> entry : activeFlights.entrySet()) {
            LiveFlight flight = entry.getValue();
            if (flight.hasArrived(currentSimTime)) {
                flight.markCompleted();
                completedFlights.add(flight);
                // sumar inventario al destino para visualización
                if (flight.getCapacityUsed() > 0) {
                    Map<String, Integer> inv = airportInventory.computeIfAbsent(flight.getDestination(), k -> new HashMap<>());
                    flight.getOrderLoads().forEach((orderId, qty) -> inv.merge(orderId, qty, Integer::sum));
                    recomputeAirportLoad(flight.getDestination());
                }
                flight.getOrderLoads().forEach((orderId, qty) -> {
                    LiveOrder order = orders.get(orderId);
                    if (order != null) {
                        boolean esDestinoFinal = order.getDestinationCode() != null && order.getDestinationCode().equals(flight.getDestination());
                        if (esDestinoFinal) {
                            order.decrementRemainingToDestination(qty);
                            if (order.getRemainingToDestination() == 0) {
                                int qtyTotal = airportInventory
                                        .getOrDefault(flight.getDestination(), Map.of())
                                        .getOrDefault(orderId, 0);
                                if (qtyTotal > 0) {
                                    releaseQueue.add(new ReleaseEvent(
                                            flight.getArrivalTime().plus(Config.WAREHOUSE_DWELL),
                                            flight.getDestination(),
                                            orderId,
                                            qtyTotal
                                    ));
                                }
                            }
                        }
                    }
                });
                toRemove.add(entry.getKey());
            }
        }
        toRemove.forEach(activeFlights::remove);

        // procesar liberaciones (dwell cumplido en destino)
        while (!releaseQueue.isEmpty() && !releaseQueue.peek().releaseTime.isAfter(currentSimTime)) {
            ReleaseEvent ev = releaseQueue.poll();
            Map<String, Integer> inv = airportInventory.computeIfAbsent(ev.airportCode, k -> new HashMap<>());
            int current = inv.getOrDefault(ev.orderId, 0);
            int toRelease = Math.min(current, ev.quantity);
            if (toRelease > 0) {
                int remaining = current - toRelease;
                if (remaining > 0) {
                    inv.put(ev.orderId, remaining);
                } else {
                    inv.remove(ev.orderId);
                }
                recomputeAirportLoad(ev.airportCode);
                LiveOrder order = orders.get(ev.orderId);
                if (order != null) {
                    order.deliver(toRelease, ev.releaseTime, ev.airportCode, "release");
                }
            }
        }
    }

    public Map<String, LiveFlight> getActiveFlights() {
        return activeFlights;
    }

    public Map<String, LiveOrder> getOrders() {
        return orders;
    }

    public Instant getCurrentSimTime() {
        return currentSimTime;
    }

    public String getSimulationId() {
        return simulationId;
    }

    public boolean hasPendingWork() {
        if (!activeFlights.isEmpty() || !scheduledFlights.isEmpty() || !releaseQueue.isEmpty()) {
            return true;
        }
        for (Map<String, Integer> inv : airportInventory.values()) {
            int total = inv.values().stream().mapToInt(Integer::intValue).sum();
            if (total > 0) {
                return true;
            }
        }
        for (LiveOrder order : orders.values()) {
            if (order.getStatus() != LiveOrder.Status.DELIVERED) {
                if (order.getPendingQuantity() > 0 || order.getRemainingToDestination() > 0) {
                    return true;
                }
            }
        }
        return false;
    }

    public List<ActiveSegment> toActiveSegments() {
        List<ActiveSegment> list = new ArrayList<>();
        for (LiveFlight flight : activeFlights.values()) {
            List<String> orderIds = new ArrayList<>(flight.getOrderLoads().keySet());
            List<OrderLoadTick> loads = flight.getOrderLoads().entrySet().stream()
                    .map(e -> new OrderLoadTick(e.getKey(), e.getValue()))
                    .toList();
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
                    loads
            ));
        }
        return list;
    }

    public int countDeliveredOrders() {
        int delivered = 0;
        for (LiveOrder order : orders.values()) {
            if (order.getDeliveredQuantity() >= order.getTotalQuantity()) {
                delivered++;
            }
        }
        return delivered;
    }

    public int countInTransitOrders() {
        int inTransit = 0;
        for (LiveOrder order : orders.values()) {
            if (order.getDeliveredQuantity() < order.getTotalQuantity() && order.getStatus() == LiveOrder.Status.IN_TRANSIT) {
                inTransit++;
            }
        }
        return inTransit;
    }

    public Map<String, LiveAirport> getAirports() {
        return airports;
    }

    public Map<String, Integer> getAirportLoads() {
        return airportLoads;
    }

    public Map<String, Map<String, Integer>> getAirportInventory() {
        return airportInventory;
    }

    public List<OrderStatusTick> buildOrderStatuses() {
        List<OrderStatusTick> list = new ArrayList<>();
        Map<String, String> orderStatus = new HashMap<>();
        Map<String, Integer> orderQty = new HashMap<>();
        Map<String, String> orderLoc = new HashMap<>();

        // cargas en vuelos
        for (LiveFlight flight : activeFlights.values()) {
            flight.getOrderLoads().forEach((orderId, qty) -> {
                orderStatus.put(orderId, "IN_TRANSIT");
                orderQty.merge(orderId, qty, Integer::sum);
                orderLoc.put(orderId, flight.getDestination());
            });
        }

        // inventario en aeropuertos
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

        // base en órdenes
        orders.values().forEach(order -> {
            if (order.getDeliveredQuantity() >= order.getTotalQuantity()) {
                // Enviamos estado final una sola vez como referencia de entrega
                if (!deliveredEmitted.contains(order.getOrderId())) {
                    OrderStatusTick delivered = new OrderStatusTick(
                            order.getOrderId(),
                            "DELIVERED",
                            order.getDestinationCode(),
                            order.getDeliveredQuantity()
                    );
                    list.add(delivered);
                    deliveredEmitted.add(order.getOrderId());
                    deliveredOnce.put(order.getOrderId(), delivered);
                }
                return;
            }
            String status = orderStatus.get(order.getOrderId());
            int qty = orderQty.getOrDefault(order.getOrderId(), 0);
            String loc = orderLoc.getOrDefault(order.getOrderId(), "");
            if (status == null) {
                return; // omitimos planificados
            }
            boolean destino = order.getDestinationCode().equals(loc);
            if (destino && order.getRemainingToDestination() == 0) {
                status = "READY_PICKUP";
            }
            list.add(new OrderStatusTick(order.getOrderId(), status, loc, qty));
        });
        return list;
    }

    public List<OrderStatusTick> buildDeliveredStatuses() {
        return new ArrayList<>(deliveredOnce.values());
    }

    private void recomputeAirportLoad(String airportCode) {
        Map<String, Integer> inv = airportInventory.getOrDefault(airportCode, Map.of());
        if (!inv.isEmpty() && !(inv instanceof HashMap)) {
            inv = new HashMap<>(inv);
            airportInventory.put(airportCode, inv);
        }
        if (!inv.isEmpty()) {
            inv.entrySet().removeIf(e -> e.getValue() == null || e.getValue() <= 0);
        }
        int total = inv.values().stream().mapToInt(Integer::intValue).sum();
        airportLoads.put(airportCode, total);
        maxObservedLoad.merge(airportCode, total, Math::max);
        LiveAirport airport = airports.get(airportCode);
        if (airport != null) {
            airport.resetHour();
            if (total > 0) {
                airport.process(total);
            }
        }
    }

    private record ReleaseEvent(Instant releaseTime, String airportCode, String orderId, int quantity) {}

    public SimulationFinalReport buildFinalReport() {
        List<OrderFinalReport> reports = new ArrayList<>();
        List<FlightUsageReport> flightReports = new ArrayList<>();
        List<AirportUsageReport> airportReports = new ArrayList<>();
        double totalMinutes = 0;
        int deliveredCount = 0;
        double utilAccum = 0;
        int utilCount = 0;

        int totalQuantity = 0;
        int deliveredQuantity = 0;
        int totalOrders = orders.size();

        for (LiveOrder order : orders.values()) {
            String finalStatus = order.getDeliveredQuantity() >= order.getTotalQuantity() ? "DELIVERED" : "PARTIAL";
            if (order.getDeliveryTime() != null && order.getDeliveredQuantity() >= order.getTotalQuantity()) {
                totalMinutes += order.getTotalTransitMinutes();
                deliveredCount++;
            }
            totalQuantity += order.getTotalQuantity();
            deliveredQuantity += order.getDeliveredQuantity();
            Long slackMinutes = null;
            if (order.getDeliveryTime() != null && order.getDueUtc() != null) {
                slackMinutes = java.time.Duration.between(order.getDeliveryTime(), order.getDueUtc()).toMinutes();
            }
            reports.add(new OrderFinalReport(
                    order.getOrderId(),
                    order.getTotalQuantity(),
                    order.getDeliveredQuantity(),
                    finalStatus,
                    order.getDestinationCode(),
                    order.getCreationUtc(),
                    order.getDueUtc(),
                    order.getFirstPickupTime(),
                    order.getDeliveryTime(),
                    order.getTotalTransitMinutes(),
                    slackMinutes,
                    List.copyOf(order.getExecutedRoute()),
                    List.copyOf(order.getHistory())
            ));
        }

        for (LiveFlight flight : completedFlights) {
            if (flight.getCapacityTotal() > 0) {
                utilAccum += (double) flight.getCapacityUsed() / flight.getCapacityTotal();
                utilCount++;
            }
            List<OrderLoadTick> loads = flight.getOrderLoads().entrySet().stream()
                    .map(e -> new OrderLoadTick(e.getKey(), e.getValue()))
                    .toList();
            double util = flight.getCapacityTotal() > 0 ? (double) flight.getCapacityUsed() / flight.getCapacityTotal() : 0.0;
            flightReports.add(new FlightUsageReport(
                    flight.getFlightId(),
                    flight.getOrigin(),
                    flight.getDestination(),
                    flight.getDepartureTime(),
                    flight.getArrivalTime(),
                    flight.getCapacityTotal(),
                    flight.getCapacityUsed(),
                    util,
                    loads
            ));
        }

        airports.forEach((code, airport) -> {
            int finalLoad = airportLoads.getOrDefault(code, 0);
            int maxLoad = maxObservedLoad.getOrDefault(code, finalLoad);
            airportReports.add(new AirportUsageReport(
                    code,
                    airport.getMaxThroughputPerHour(),
                    finalLoad,
                    maxLoad
            ));
        });

        double avgMinutes = deliveredCount > 0 ? totalMinutes / deliveredCount : 0;
        double avgUtil = utilCount > 0 ? utilAccum / utilCount : 0;

        return new SimulationFinalReport(
                simulationId,
                startTime,
                currentSimTime,
                reports,
                avgMinutes,
                avgUtil,
                totalOrders,
                deliveredCount,
                totalQuantity,
                deliveredQuantity,
                flightReports,
                airportReports
        );
    }

    /**
     * Construye planes de pedido simplificados para consumo del frontend en ticks.
     * Usa los vuelos programados/activos/completados para armar segmentos.
     */
    public List<SimulationOrderPlan> buildOrderPlansForTick() {
        Map<String, List<SimulationSegment>> segmentsPorOrden = new HashMap<>();

        // helper para agregar segmentos por vuelo
        Consumer<LiveFlight> addFlightSegments = (LiveFlight flight) -> {
            flight.getOrderLoads().forEach((orderId, qty) -> {
                LocalDate date = flight.getDepartureTime().atZone(ZoneOffset.UTC).toLocalDate();
                SimulationSegment seg = new SimulationSegment(
                        flight.getFlightId(),
                        flight.getOrigin(),
                        flight.getDestination(),
                        date,
                        qty,
                        flight.getDepartureTime(),
                        flight.getArrivalTime()
                );
                segmentsPorOrden.computeIfAbsent(orderId, k -> new ArrayList<>()).add(seg);
            });
        };

        activeFlights.values().forEach(addFlightSegments);
        completedFlights.forEach(addFlightSegments);
        // copiar programados sin mutar la cola
        for (LiveFlight flight : new ArrayList<>(scheduledFlights)) {
            addFlightSegments.accept(flight);
        }

        List<SimulationOrderPlan> plans = new ArrayList<>();
        segmentsPorOrden.forEach((orderId, segs) -> {
            segs.sort(Comparator.comparing(SimulationSegment::departureUtc));
            int qtyTotal = segs.stream().mapToInt(SimulationSegment::quantity).sum();
            SimulationRoute route = new SimulationRoute(qtyTotal, 0L, List.copyOf(segs));
            plans.add(new SimulationOrderPlan(orderId, 0L, List.of(route)));
        });

        // Incluir pedidos sin tramos aún (planificados) para que el frontend tenga cantidad/meta
        orders.forEach((orderId, liveOrder) -> {
            boolean already = segmentsPorOrden.containsKey(orderId);
            if (!already) {
                int qtyTotal = liveOrder.getTotalQuantity();
                SimulationRoute route = new SimulationRoute(qtyTotal, 0L, List.of());
                plans.add(new SimulationOrderPlan(orderId, 0L, List.of(route)));
            }
        });

        return plans;
    }
}
