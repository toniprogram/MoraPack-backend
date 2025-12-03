package com.morapack.skyroute.simulation.live;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;

public class LiveFlight implements Comparable<LiveFlight> {
    private final String flightId;
    private final String origin;
    private final String destination;
    private final Instant departureTime;
    private final Instant arrivalTime;
    private final int capacityTotal;
    private int capacityUsed;
    private final Map<String, Integer> orderLoads = new HashMap<>();
    private boolean departed;
    private boolean completed;

    public LiveFlight(String flightId,
                      String origin,
                      String destination,
                      Instant departureTime,
                      Instant arrivalTime,
                      int capacityTotal) {
        this.flightId = flightId;
        this.origin = origin;
        this.destination = destination;
        this.departureTime = departureTime;
        this.arrivalTime = arrivalTime;
        this.capacityTotal = Math.max(0, capacityTotal);
        this.capacityUsed = 0;
    }

    public void addLoad(String orderId, int quantity) {
        int qty = Math.max(0, quantity);
        capacityUsed += qty;
        orderLoads.merge(orderId, qty, Integer::sum);
    }

    public void tryDepart() {
        departed = true;
    }

    public boolean hasArrived(Instant simTime) {
        return simTime != null && !simTime.isBefore(arrivalTime);
    }

    public String getFlightId() {
        return flightId;
    }

    public String getOrigin() {
        return origin;
    }

    public String getDestination() {
        return destination;
    }

    public Instant getDepartureTime() {
        return departureTime;
    }

    public Instant getArrivalTime() {
        return arrivalTime;
    }

    public int getCapacityTotal() {
        return capacityTotal;
    }

    public int getCapacityUsed() {
        return capacityUsed;
    }

    public boolean isDeparted() {
        return departed;
    }

    public boolean isCompleted() {
        return completed;
    }

    public void markCompleted() {
        this.completed = true;
    }

    public Map<String, Integer> getOrderLoads() {
        return orderLoads;
    }

    @Override
    public int compareTo(LiveFlight other) {
        return this.departureTime.compareTo(other.departureTime);
    }
}
