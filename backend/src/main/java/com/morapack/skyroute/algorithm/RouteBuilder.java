package com.morapack.skyroute.algorithm;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Random;
import java.util.Set;

import com.morapack.skyroute.config.*;
import com.morapack.skyroute.io.*;
import com.morapack.skyroute.models.*;

class RouteBuilder {
    private static final List<String> PRODUCTION_HUBS = List.of("SPIM", "EBCI", "UBBB");
    private static final int MAX_HOPS = 8;
    private static final int MAX_DAY_LOOKAHEAD = 3;
    private static final double AVG_CRUISE_SPEED_KMH = 800.0;

    private final Flights flights;
    private final Airports airports;
    private final FlightSchedule flightSchedule;
    private final AirportSchedule airportSchedule;
    private final Map<String, List<String>> reverseGraph;
    private final Random rnd;
    private final SelectionMode mode;

    RouteBuilder(World world,
                 FlightSchedule flightSchedule,
                 AirportSchedule airportSchedule,
                 Random rnd,
                 SelectionMode mode) {
        this.flights = Objects.requireNonNull(world, "world").getFlights();
        this.airports = world.getAirports();
        this.flightSchedule = Objects.requireNonNull(flightSchedule, "flightSchedule");
        this.airportSchedule = Objects.requireNonNull(airportSchedule, "airportSchedule");
        this.reverseGraph = buildReverseGraph();
        this.rnd = Objects.requireNonNull(rnd, "rnd");
        this.mode = Objects.requireNonNull(mode, "mode");
    }

    Route buildRoute(Order order, String originHub, int quantity) {
        String destination = order.getDestinationCode();
        Route route = new Route(quantity);
        if (originHub.equals(destination)) {
            return route;
        }

        Airport currentAirport = airports.get(originHub);
        if (currentAirport == null) {
            return null;
        }

        Duration overallSla = Duration.ZERO;
        Instant dueInstant = null;
        LocalDateTime readyTime = LocalDateTime.ofInstant(order.getCreationUtc(), currentAirport.getZoneOffset())
                .plus(Config.WAREHOUSE_DWELL);
        Map<String, Integer> distances = computeHopDistances(destination);

        String current = originHub;
        Set<String> visited = new HashSet<>();
        visited.add(current);
        int hops = 0;

        int currentRouteQty = quantity;

        while (!current.equals(destination) && hops < MAX_HOPS) {
            if (dueInstant == null) {
                Duration hopSla = slaFor(originHub, destination);
                overallSla = overallSla.compareTo(hopSla) > 0 ? overallSla : hopSla;
                dueInstant = order.getCreationUtc().plus(overallSla);
            }

            List<Flight> options = new ArrayList<>(flights.getByOriginCode(current));
            if (options.isEmpty()) {
                releaseAllocated(route);
                return null;
            }

            int currentDist = distances.getOrDefault(current, Integer.MAX_VALUE);
            List<Flight> candidates = rankCandidates(options, currentDist, destination, distances, visited);
            boolean reserved = false;

            for (Flight candidate : candidates) {
                LocalDate date = readyTime.toLocalDate();
                int attempts = 0;
                while (attempts < MAX_DAY_LOOKAHEAD) {
                    LocalDateTime departureLocal = toLocal(candidate.getDepartureInstant(date), currentAirport.getZoneOffset());
                    if (departureLocal.isBefore(readyTime)) {
                        date = date.plusDays(1);
                        attempts++;
                        continue;
                    }

                    int availableFlight = flightSchedule.getRemainingCapacity(candidate, date);
                    if (availableFlight <= 0) {
                        date = date.plusDays(1);
                        attempts++;
                        continue;
                    }

                    int sendQty = Math.min(currentRouteQty, availableFlight);
                    if (sendQty <= 0) {
                        date = date.plusDays(1);
                        attempts++;
                        continue;
                    }

                    boolean finalLeg = candidate.getDestinationCode().equals(destination);
                    if (reserveSegment(route, candidate, date, sendQty, finalLeg, dueInstant)) {
                        current = candidate.getDestinationCode();
                        currentAirport = airports.get(current);
                        LocalDateTime arrivalLocal = toLocal(candidate.getArrivalInstant(date), currentAirport.getZoneOffset());
                        readyTime = arrivalLocal.plus(finalLeg ? Config.WAREHOUSE_DWELL : Config.TRANSFER_BUFFER);
                        if (dueInstant != null) {
                            Instant readyInstant = readyTime.toInstant(currentAirport.getZoneOffset());
                            if (!readyInstant.isBefore(dueInstant)) {
                                releaseAllocated(route);
                                return null;
                            }
                        }
                        visited.add(current);
                        currentRouteQty = sendQty;
                        reserved = true;
                        break;
                    }

                    date = date.plusDays(1);
                    attempts++;
                }
                if (reserved) {
                    break;
                }
            }

            if (!reserved) {
                releaseAllocated(route);
                return null;
            }

            hops++;
        }

        if (!current.equals(destination)) {
            releaseAllocated(route);
            return null;
        }

        route.setQuantity(currentRouteQty);

        return route;
    }

    List<String> productionHubs() {
        return Collections.unmodifiableList(PRODUCTION_HUBS);
    }

    private Map<String, Integer> computeHopDistances(String destination) {
        // Conservamos la función para compatibilidad, aunque la prioridad ahora es por distancia geográfica.
        Map<String, Integer> distances = new HashMap<>();
        Deque<String> queue = new ArrayDeque<>();
        distances.put(destination, 0);
        queue.add(destination);
        while (!queue.isEmpty()) {
            String current = queue.poll();
            int base = distances.get(current);
            for (String origin : reverseGraph.getOrDefault(current, List.of())) {
                if (!distances.containsKey(origin)) {
                    distances.put(origin, base + 1);
                    queue.add(origin);
                }
            }
        }
        return distances;
    }

    private Map<String, List<String>> buildReverseGraph() {
        Map<String, List<String>> reverse = new HashMap<>();
        for (Flight flight : flights.getAll()) {
            reverse.computeIfAbsent(flight.getDestinationCode(), key -> new ArrayList<>())
                    .add(flight.getOriginCode());
        }
        return reverse;
    }

    private List<Flight> rankCandidates(List<Flight> options,
                                        int currentDist,
                                        String destination,
                                        Map<String, Integer> distances,
                                        Set<String> visited) {
        if (mode == SelectionMode.RANDOM_APPROACH) {
            // Elige dentro de los destinos más cercanos priorizando el menor tiempo estimado a destino
            // y luego baraja para no monopolizar siempre el mismo hub.
            double currentGeo = distanceToDestination(options.get(0).getOriginCode(), destination);
            List<FlightDistance> all = new ArrayList<>(options.size());
            for (Flight option : options) {
                double nextGeo = distanceToDestination(option.getDestinationCode(), destination);
                double etaMinutes = estimateMinutes(option, destination);
                all.add(new FlightDistance(option, nextGeo, etaMinutes));
            }

            all.sort((a, b) -> Double.compare(a.etaMinutes, b.etaMinutes));

            // Preferimos los que reducen distancia; si no hay, tomamos los más cercanos absolutos.
            List<FlightDistance> closer = new ArrayList<>();
            for (FlightDistance fd : all) {
                if (fd.distanceKm <= currentGeo) {
                    closer.add(fd);
                }
            }

            List<FlightDistance> primary = closer.isEmpty() ? all : closer;
            int bucketSize = Math.min(5, primary.size());

            List<FlightDistance> nearest = new ArrayList<>(primary.subList(0, bucketSize));
            Collections.shuffle(nearest, rnd);

            Set<Flight> added = new HashSet<>();
            List<Flight> prioritized = new ArrayList<>();
            for (FlightDistance fd : nearest) {
                prioritized.add(fd.flight);
                added.add(fd.flight);
            }

            List<FlightDistance> remainder = new ArrayList<>(all);
            remainder.removeAll(nearest);
            Collections.shuffle(remainder, rnd);
            for (FlightDistance fd : remainder) {
                if (!added.contains(fd.flight)) {
                    prioritized.add(fd.flight);
                }
            }

            return prioritized;
        }

        List<Flight> prioritized = new ArrayList<>(options);
        prioritized.removeIf(f -> visited.contains(f.getDestinationCode()));
        if (prioritized.isEmpty()) prioritized.addAll(options);

        prioritized.sort((a, b) -> Double.compare(
                slackScore(a, destination, distances),
                slackScore(b, destination, distances)));
        return prioritized;
    }

    private double slackScore(Flight flight,
                              String destination,
                              Map<String, Integer> distances) {
        double geoDistance = distanceToDestination(flight.getDestinationCode(), destination);
        int directBonus = flight.getDestinationCode().equals(destination) ? -10 : 0;
        double continentPenalty = continentPenalty(flight.getDestinationCode(), destination);
        return geoDistance + continentPenalty + directBonus;
    }

    private double continentPenalty(String airportCode, String destinationCode) {
        Airport target = airports.get(destinationCode);
        Airport candidate = airports.get(airportCode);
        if (target == null || candidate == null) {
            return 0;
        }
        if (Objects.equals(target.getContinent(), candidate.getContinent())) {
            return 0;
        }
        // penalización suave para preferir mismo continente
        return 5_000;
    }

    private boolean reserveSegment(Route route, Flight flight, LocalDate date, int quantity, boolean finalLeg, Instant dueInstant) {
        if (!flightSchedule.tryReserve(flight, date, quantity)) {
            return false;
        }

        Airport destinationAirport = airports.get(flight.getDestinationCode());
        LocalDateTime arrivalLocal = toLocal(flight.getArrivalInstant(date), destinationAirport.getZoneOffset());
        LocalDateTime departureLocal = arrivalLocal.plus(finalLeg ? Config.WAREHOUSE_DWELL : Config.TRANSFER_BUFFER);

        if (finalLeg) {
            Instant releaseInstant = flight.getArrivalInstant(date).plus(Config.WAREHOUSE_DWELL);
            if (dueInstant != null && releaseInstant.isAfter(dueInstant)) {
                flightSchedule.release(flight, date, quantity);
                return false;
            }
        }

        if (!airportSchedule.tryReserveTransit(destinationAirport.code, arrivalLocal, departureLocal, quantity)) {
            flightSchedule.release(flight, date, quantity);
            return false;
        }

        RouteSegment segment = new RouteSegment(flight, date, quantity, finalLeg);
        if (finalLeg) {
            Instant arrivalInstant = flight.getArrivalInstant(date);
            // Consideramos el dwell de almacén para la entrega final (cada tramo libera tras WAREHOUSE_DWELL)
            Instant releaseInstant = arrivalInstant.plus(Config.WAREHOUSE_DWELL);
            Duration slack = Duration.between(releaseInstant, dueInstant);
            segment.setSlack(slack);
            route.setSlack(slack);
        }
        route.add(segment);
        return true;
    }

    private void releaseAllocated(Route route) {
        for (RouteSegment segment : route.getSegments()) {
            Flight flight = segment.getFlight();
            LocalDate date = segment.getDate();
            int qty = segment.getRouteQuantity();
            flightSchedule.release(flight, date, qty);

            Airport destinationAirport = airports.get(flight.getDestinationCode());
            LocalDateTime arrivalLocal = toLocal(flight.getArrivalInstant(date), destinationAirport.getZoneOffset());
            LocalDateTime departureLocal = arrivalLocal.plus(segment.isFinalLeg() ? Config.WAREHOUSE_DWELL : Config.TRANSFER_BUFFER);
            airportSchedule.releaseTransit(destinationAirport.code, arrivalLocal, departureLocal, qty);
        }
    }

    private LocalDateTime toLocal(Instant instant, ZoneOffset offset) {
        return LocalDateTime.ofInstant(instant, offset);
    }

    private double distanceToDestination(String airportCode, String destinationCode) {
        Airport origin = airports.get(airportCode);
        Airport destination = airports.get(destinationCode);
        if (origin == null || destination == null) {
            return Double.MAX_VALUE / 2;
        }
        return haversineKm(origin.getLatitude(), origin.getLongitude(), destination.getLatitude(), destination.getLongitude());
    }

    private double estimateMinutes(Flight flight, String destinationCode) {
        double flightMinutes = estimateFlightDurationMinutes(flight);
        double remainingKm = distanceToDestination(flight.getDestinationCode(), destinationCode);
        double remainingMinutes = remainingKm >= Double.MAX_VALUE / 4
                ? Double.MAX_VALUE / 2
                : (remainingKm / AVG_CRUISE_SPEED_KMH) * 60d;
        if (flightMinutes >= Double.MAX_VALUE / 4 || remainingMinutes >= Double.MAX_VALUE / 4) {
            return Double.MAX_VALUE / 2;
        }
        return flightMinutes + remainingMinutes;
    }

    private double estimateFlightDurationMinutes(Flight flight) {
        if (flight == null) {
            return Double.MAX_VALUE / 2;
        }
        try {
            LocalDate sample = LocalDate.now(ZoneOffset.UTC);
            Instant dep = flight.getDepartureInstant(sample);
            Instant arr = flight.getArrivalInstant(sample);
            if (dep != null && arr != null && arr.isAfter(dep)) {
                return Duration.between(dep, arr).toMinutes();
            }
        } catch (Exception ignored) {
        }
        try {
            if (flight.getFlightDuration() != null) {
                return flight.getFlightDuration().toMinutes();
            }
        } catch (Exception ignored) {
        }
        return Double.MAX_VALUE / 2;
    }

    private double haversineKm(double lat1, double lon1, double lat2, double lon2) {
        double R = 6371.0;
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) *
                        Math.sin(dLon / 2) * Math.sin(dLon / 2);
        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    private Duration slaFor(String originCode, String destinationCode) {
        Airport origin = airports.get(originCode);
        Airport destination = airports.get(destinationCode);
        if (origin == null || destination == null) {
            return Duration.ofHours(Config.INTERCONTINENTAL_SLA_HOURS);
        }
        String originContinent = origin.getContinent();
        String destinationContinent = destination.getContinent();
        if (originContinent != null && originContinent.equalsIgnoreCase(destinationContinent)) {
            return Duration.ofHours(Config.CONTINENTAL_SLA_HOURS);
        }
        return Duration.ofHours(Config.INTERCONTINENTAL_SLA_HOURS);
    }

    enum SelectionMode {
        RANDOM_APPROACH,
        HEURISTIC_APPROACH
    }

    private static final class FlightDistance {
        private final Flight flight;
        private final double distanceKm;
        private final double etaMinutes;

        private FlightDistance(Flight flight, double distanceKm, double etaMinutes) {
            this.flight = flight;
            this.distanceKm = distanceKm;
            this.etaMinutes = etaMinutes;
        }

        @Override
        public boolean equals(Object o) {
            if (this == o) return true;
            if (o == null || getClass() != o.getClass()) return false;
            FlightDistance that = (FlightDistance) o;
            return Objects.equals(flight, that.flight);
        }

        @Override
        public int hashCode() {
            return Objects.hash(flight);
        }
    }
}