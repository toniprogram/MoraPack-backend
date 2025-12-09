package com.morapack.skyroute.simulation.live;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

public class LiveOrder {
    public enum Status { PLANNED, WAITING_PICKUP, IN_TRANSIT, DELIVERED }

    private final String orderId;
    private final int totalQuantity;
    private final String destinationCode;
    private final Instant creationUtc;
    private final Instant dueUtc;
    private int deliveredQuantity;
    private Status status = Status.PLANNED;
    private Instant firstPickupTime;
    private Instant deliveryTime;
    private final List<OrderEvent> history = new ArrayList<>();
    private final List<OrderFlightLeg> executedRoute = new ArrayList<>();
    private int pendingQuantity;
    private int remainingToDestination;

    public LiveOrder(String orderId, int totalQuantity, String destinationCode, Instant creationUtc, Instant dueUtc) {
        if (totalQuantity <= 0) {
            throw new IllegalArgumentException("totalQuantity must be positive");
        }
        this.orderId = Objects.requireNonNull(orderId, "orderId");
        this.totalQuantity = totalQuantity;
        this.pendingQuantity = totalQuantity;
        this.remainingToDestination = totalQuantity;
        this.destinationCode = destinationCode;
        this.creationUtc = creationUtc;
        this.dueUtc = dueUtc;
    }

    public void markWaiting(Instant time) {
        status = Status.WAITING_PICKUP;
        history.add(new OrderEvent(time, "WAIT", null, null, 0));
    }

    public void markInTransit(Instant time, String airportCode, String flightId, int quantity) {
        status = Status.IN_TRANSIT;
        if (firstPickupTime == null) {
            firstPickupTime = time;
        }
        history.add(new OrderEvent(time, "BOARD", airportCode, flightId, quantity));
    }

    public void addLeg(OrderFlightLeg leg) {
        executedRoute.add(leg);
    }

    public void deliver(int quantity, Instant time, String airportCode, String flightId) {
        if (quantity <= 0) {
            return;
        }
        deliveredQuantity += quantity;
        history.add(new OrderEvent(time, "ARRIVAL", airportCode, flightId, quantity));
        history.add(new OrderEvent(time, "DELIVERY", airportCode, flightId, quantity));
        if (deliveredQuantity >= totalQuantity) {
            deliveredQuantity = totalQuantity;
            status = Status.DELIVERED;
            deliveryTime = time;
        } else {
            status = Status.IN_TRANSIT;
        }
    }

    public void decrementPending(int quantity) {
        pendingQuantity = Math.max(0, pendingQuantity - Math.max(0, quantity));
    }

    public int getPendingQuantity() {
        return pendingQuantity;
    }

    public void decrementRemainingToDestination(int quantity) {
        remainingToDestination = Math.max(0, remainingToDestination - Math.max(0, quantity));
    }

    public int getRemainingToDestination() {
        return remainingToDestination;
    }

    public String getDestinationCode() {
        return destinationCode;
    }

    public long getTotalTransitMinutes() {
        if (firstPickupTime == null || deliveryTime == null) {
            return 0;
        }
        return Duration.between(firstPickupTime, deliveryTime).toMinutes();
    }

    public String getOrderId() {
        return orderId;
    }

    public int getTotalQuantity() {
        return totalQuantity;
    }

    public int getDeliveredQuantity() {
        return deliveredQuantity;
    }

    public Instant getCreationUtc() {
        return creationUtc;
    }

    public Instant getDueUtc() {
        return dueUtc;
    }

    public Status getStatus() {
        return status;
    }

    public Instant getFirstPickupTime() {
        return firstPickupTime;
    }

    public Instant getDeliveryTime() {
        return deliveryTime;
    }

    public List<OrderEvent> getHistory() {
        return history;
    }

    public List<OrderFlightLeg> getExecutedRoute() {
        return executedRoute;
    }
}
