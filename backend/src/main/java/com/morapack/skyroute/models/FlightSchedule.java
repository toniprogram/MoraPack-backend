package com.morapack.skyroute.models;

import java.time.LocalDate;
import java.util.HashMap;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

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
        ensureMutable();
        remainingCapacity.keySet().removeIf(key -> key.date.isBefore(limitDate));
    }

    public void purgeBefore(Flight flight, LocalDate limitDate) {
        Objects.requireNonNull(flight, "flight");
        Objects.requireNonNull(limitDate, "limitDate");
        ensureMutable();
        remainingCapacity.keySet().removeIf(key ->
                key.flightId.equals(flight.getId()) && key.date.isBefore(limitDate));
    }

    public void applyFrom(FlightSchedule other) {
        ensureMutable();
        remainingCapacity.clear();
        remainingCapacity.putAll(other.remainingCapacity);
        shared = false;
    }

    /**
     * Fracción de capacidad ya usada para un vuelo en una fecha.
     * 0.0 libre, 1.0 lleno.
     */
    public double utilizationRatio(Flight flight, LocalDate date) {
        int capacity = flight.getDailyCapacity();
        if (capacity <= 0) return 1.0;
        int remaining = getRemainingCapacity(flight, date);
        int used = capacity - remaining;
        return Math.min(1.0, Math.max(0.0, used / (double) capacity));
    }

    public FlightSchedule copy() {
        return new FlightSchedule(new HashMap<>(this.remainingCapacity), false);
    }

    public String debugSnapshot() {
        String contents = remainingCapacity.isEmpty()
                ? "{}"
                : remainingCapacity.entrySet().stream()
                .sorted((a, b) -> {
                    int cmp = a.getKey().flightId.compareTo(b.getKey().flightId);
                    if (cmp != 0) return cmp;
                    return a.getKey().date.compareTo(b.getKey().date);
                })
                .map(e -> e.getKey().flightId + "@" + e.getKey().date + "=" + e.getValue())
                .collect(Collectors.joining(", ", "{", "}"));
        return contents + " shared=" + shared;
    }

    private record Key(String flightId, LocalDate date) {}
}
