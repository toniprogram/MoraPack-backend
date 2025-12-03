package com.morapack.skyroute.simulation.live;

import com.morapack.skyroute.models.Order;
import com.morapack.skyroute.simulation.dto.ActiveSegment;
import com.morapack.skyroute.simulation.dto.OrderLoadTick;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;

public class LiveSimulationWorld {
    private final String simulationId;
    private final Instant startTime;
    private Instant currentSimTime;

    private final Map<String, LiveFlight> activeFlights = new HashMap<>();
    private final PriorityQueue<LiveFlight> scheduledFlights = new PriorityQueue<>();
    private final List<LiveFlight> completedFlights = new ArrayList<>();

    private final Map<String, LiveOrder> orders = new HashMap<>();
    private final Map<String, LiveAirport> airports = new HashMap<>();
    private Instant lastHourMark;

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
                orders.put(order.getId(), new LiveOrder(order.getId(), order.getQuantity()));
            }
        }
    }

    public void scheduleFutureFlight(LiveFlight flight) {
        scheduledFlights.add(flight);
        LiveOrder order = orders.get(flight.getOrderId());
        if (order != null) {
            order.markWaiting(flight.getDepartureTime());
            order.addLeg(new OrderFlightLeg(
                    flight.getFlightId(),
                    flight.getOrigin(),
                    flight.getDestination(),
                    flight.getDepartureTime(),
                    flight.getArrivalTime(),
                    flight.getCapacityUsed()
            ));
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
            LiveAirport origin = airports.get(flight.getOrigin());
            if (origin == null || !origin.canProcess(flight.getCapacityUsed())) {
                continue;
            }
            origin.process(flight.getCapacityUsed());
            flight.tryDepart();
            activeFlights.put(flight.getFlightId() + "|" + flight.getDepartureTime(), flight);
            LiveOrder order = orders.get(flight.getOrderId());
            if (order != null) {
                order.markInTransit(flight.getDepartureTime(), flight.getOrigin(), flight.getFlightId(), flight.getCapacityUsed());
            }
        }

        // arrive flights
        List<String> toRemove = new ArrayList<>();
        for (Map.Entry<String, LiveFlight> entry : activeFlights.entrySet()) {
            LiveFlight flight = entry.getValue();
            if (flight.hasArrived(currentSimTime)) {
                flight.markCompleted();
                completedFlights.add(flight);
                LiveOrder order = orders.get(flight.getOrderId());
                if (order != null) {
                    order.deliver(flight.getCapacityUsed(), flight.getArrivalTime(), flight.getDestination(), flight.getFlightId());
                }
                toRemove.add(entry.getKey());
            }
        }
        toRemove.forEach(activeFlights::remove);
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

    public List<ActiveSegment> toActiveSegments() {
        List<ActiveSegment> list = new ArrayList<>();
        for (LiveFlight flight : activeFlights.values()) {
            list.add(new ActiveSegment(
                    flight.getFlightId() + "|" + flight.getDepartureTime(),
                    flight.getFlightId(),
                    flight.getOrigin(),
                    flight.getDestination(),
                    flight.getDepartureTime().toString(),
                    flight.getArrivalTime().toString(),
                    List.of(flight.getOrderId()),
                    flight.getCapacityUsed(),
                    flight.getCapacityTotal(),
                    List.of(new OrderLoadTick(flight.getOrderId(), flight.getCapacityUsed()))
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

    public SimulationFinalReport buildFinalReport() {
        List<OrderFinalReport> reports = new ArrayList<>();
        double totalMinutes = 0;
        int deliveredCount = 0;
        double utilAccum = 0;
        int utilCount = 0;

        for (LiveOrder order : orders.values()) {
            String finalStatus = order.getDeliveredQuantity() >= order.getTotalQuantity() ? "DELIVERED" : "PARTIAL";
            if (order.getDeliveryTime() != null && order.getDeliveredQuantity() >= order.getTotalQuantity()) {
                totalMinutes += order.getTotalTransitMinutes();
                deliveredCount++;
            }
            reports.add(new OrderFinalReport(
                    order.getOrderId(),
                    order.getTotalQuantity(),
                    order.getDeliveredQuantity(),
                    finalStatus,
                    order.getFirstPickupTime(),
                    order.getDeliveryTime(),
                    order.getTotalTransitMinutes(),
                    List.copyOf(order.getExecutedRoute()),
                    List.copyOf(order.getHistory())
            ));
        }

        for (LiveFlight flight : completedFlights) {
            if (flight.getCapacityTotal() > 0) {
                utilAccum += (double) flight.getCapacityUsed() / flight.getCapacityTotal();
                utilCount++;
            }
        }

        double avgMinutes = deliveredCount > 0 ? totalMinutes / deliveredCount : 0;
        double avgUtil = utilCount > 0 ? utilAccum / utilCount : 0;

        return new SimulationFinalReport(
                simulationId,
                startTime,
                currentSimTime,
                reports,
                avgMinutes,
                avgUtil
        );
    }
}
