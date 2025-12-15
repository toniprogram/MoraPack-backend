package com.morapack.skyroute.operation.dto;

import java.time.Instant;

public class OperationSegmentDto {
    private String flightId;
    private String origin;
    private String destination;
    private Instant departureUtc;
    private Instant arrivalUtc;
    private int quantity;

    public String getFlightId() {
        return flightId;
    }

    public void setFlightId(String flightId) {
        this.flightId = flightId;
    }

    public String getOrigin() {
        return origin;
    }

    public void setOrigin(String origin) {
        this.origin = origin;
    }

    public String getDestination() {
        return destination;
    }

    public void setDestination(String destination) {
        this.destination = destination;
    }

    public Instant getDepartureUtc() {
        return departureUtc;
    }

    public void setDepartureUtc(Instant departureUtc) {
        this.departureUtc = departureUtc;
    }

    public Instant getArrivalUtc() {
        return arrivalUtc;
    }

    public void setArrivalUtc(Instant arrivalUtc) {
        this.arrivalUtc = arrivalUtc;
    }

    public int getQuantity() {
        return quantity;
    }

    public void setQuantity(int quantity) {
        this.quantity = quantity;
    }
}
