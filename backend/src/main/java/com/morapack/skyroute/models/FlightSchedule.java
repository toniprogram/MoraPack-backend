package com.morapack.skyroute.models;

import java.time.LocalDate;
import java.util.HashMap;
import java.util.Map;
import java.util.Objects;

public class FlightSchedule {
    private Map<Key, Integer> remainingCapacity = new HashMap<>();
    private boolean shared = false;

    public FlightSchedule() {}

    private FlightSchedule(Map<Key, Integer> snapshot, boolean shared) {
        this.remainingCapacity = snapshot;
        this.shared = shared;
    }

    private void ensureMutable() {
        if (shared) {
            remainingCapacity = new HashMap<>(remainingCapacity);
            shared = false;
        }
    }

    public boolean tryReserve(Flight flight, LocalDate date, int quantity) {
        Objects.requireNonNull(flight, "flight");
        Objects.requireNonNull(date, "date");
        if (quantity <= 0) {
            return true;
        }
        if (flight.isCancelled(date)) {
            return false;
        }
        ensureMutable();
        Key key = new Key(flight.getId(), date);
        int available = remainingCapacity.getOrDefault(key, flight.getDailyCapacity());
        if (available < quantity) {
            return false;
        }
        int updated = available - quantity;
        if (updated == flight.getDailyCapacity()) {
            remainingCapacity.remove(key);
        } else {
            remainingCapacity.put(key, updated);
        }
        return true;
    }

    public void release(Flight flight, LocalDate date, int quantity) {
        if (quantity <= 0) {
            return;
        }
        ensureMutable();
        Key key = new Key(flight.getId(), date);
        int available = remainingCapacity.getOrDefault(key, flight.getDailyCapacity());
        int updated = available + quantity;
        if (updated > flight.getDailyCapacity()) {
            throw new IllegalArgumentException("Releasing more capacity than available for flight " + flight.getId());
        }
        if (updated == flight.getDailyCapacity()) {
            remainingCapacity.remove(key);
        } else {
            remainingCapacity.put(key, updated);
        }
    }

    public int getRemainingCapacity(Flight flight, LocalDate date) {
        Key key = new Key(flight.getId(), date);
        return remainingCapacity.getOrDefault(key, flight.getDailyCapacity());
    }

    public void purgeBefore(LocalDate limitDate) {
        remainingCapacity.keySet().removeIf(key -> key.date.isBefore(limitDate));
    }

    public void purgeBefore(Flight flight, LocalDate limitDate) {
        Objects.requireNonNull(flight, "flight");
        Objects.requireNonNull(limitDate, "limitDate");
        remainingCapacity.keySet().removeIf(key ->
                key.flightId.equals(flight.getId()) && key.date.isBefore(limitDate));
    }

    public void applyFrom(FlightSchedule other) {
        remainingCapacity.clear();
        remainingCapacity.putAll(other.remainingCapacity);
        shared = false;
    }

    public FlightSchedule copy() {
        return new FlightSchedule(this.remainingCapacity, true);
    }

    private record Key(String flightId, LocalDate date) {}
}
