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
import java.util.PriorityQueue;
import java.util.Random;
import java.util.Set;

import com.morapack.skyroute.config.*;
import com.morapack.skyroute.io.*;
import com.morapack.skyroute.models.*;

class RouteBuilder {
    private static final List<String> PRODUCTION_HUBS = List.of("SPIM", "EBCI", "UBBB");
    private static final int MAX_HOPS = 3;
    private static final int MAX_DAY_LOOKAHEAD = 3;
    private static final int TOP_K_CANDIDATES = 5;

    private final Flights flights;
    private final Airports airports;
    private final FlightSchedule flightSchedule;
    private final AirportSchedule airportSchedule;
    private final Map<String, List<String>> reverseGraph;
    // Cache de distancias geográficas por destino -> origen para evitar recalcular haversine
    private final Map<String, Map<String, Double>> distanceCache = new HashMap<>();
    // Cache de candidatos ordenados por (origen, destinoFinal); no depende de estado mutable
    private final Map<String, Map<String, List<Flight>>> sortedCandidatesCache = new HashMap<>();
    private final Random rnd;
    private final SelectionMode mode;
    // Instante mínimo para planificar (evita modificar tramos previos)
    private final Instant notBefore;

    RouteBuilder(World world,
                 FlightSchedule flightSchedule,
                 AirportSchedule airportSchedule,
                 Random rnd,
                 SelectionMode mode,
                 Instant notBefore) {
        this.flights = Objects.requireNonNull(world, "world").getFlights();
        this.airports = world.getAirports();
        this.flightSchedule = Objects.requireNonNull(flightSchedule, "flightSchedule");
        this.airportSchedule = Objects.requireNonNull(airportSchedule, "airportSchedule");
        this.reverseGraph = buildReverseGraph();
        this.rnd = Objects.requireNonNull(rnd, "rnd");
        this.mode = Objects.requireNonNull(mode, "mode");
        this.notBefore = notBefore;
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
        LocalDateTime readyTime = clampReadyTime(order, currentAirport);
        String current = originHub;
        Set<String> visited = new HashSet<>();
        visited.add(current);
        int hops = 0;

        int currentRouteQty = quantity;

        while (!current.equals(destination) && hops < MAX_HOPS) {
            // Ajusta SLA si el tramo actual cruza continente; eleva a intercontinental cuando aplica
            Duration hopSla = slaFor(current, destination);
            if (dueInstant == null || hopSla.compareTo(overallSla) > 0) {
                overallSla = hopSla;
                dueInstant = order.getCreationUtc().plus(overallSla);
            }

            List<Flight> options = new ArrayList<>(flights.getByOriginCode(current));
            if (options.isEmpty()) {
                releaseAllocated(route);
                return null;
            }

            List<Flight> candidates = rankCandidates(options, current, destination, visited, readyTime);
            boolean reserved = false;

            // Intento horizontal: probar todos los vuelos disponibles por día antes de pasar al siguiente día
            LocalDate baseDate = readyTime.toLocalDate();
            for (int dayOffset = 0; dayOffset < MAX_DAY_LOOKAHEAD && !reserved; dayOffset++) {
                LocalDate date = baseDate.plusDays(dayOffset);
                for (Flight candidate : candidates) {
                    Instant departureInstant = candidate.getDepartureInstant(date);
                    if (notBefore != null && departureInstant.isBefore(notBefore)) {
                        continue; // no replanear segmentos en el pasado
                    }
                    LocalDateTime departureLocal = toLocal(departureInstant, currentAirport.getZoneOffset());
                    if (dayOffset == 0 && departureLocal.isBefore(readyTime)) {
                        continue; // ese vuelo ya pasó para el día base
                    }

                    int availableFlight = flightSchedule.getRemainingCapacity(candidate, date);
                    if (availableFlight <= 0) {
                        continue;
                    }

                    int sendQty = Math.min(currentRouteQty, availableFlight);
                    if (sendQty <= 0) {
                        continue;
                    }

                    boolean finalLeg = candidate.getDestinationCode().equals(destination);
                    if (reserveSegment(route, candidate, date, sendQty, finalLeg, dueInstant)) {
                        current = candidate.getDestinationCode();
                        currentAirport = airports.get(current);
                        LocalDateTime arrivalLocal = toLocal(candidate.getArrivalInstant(date), currentAirport.getZoneOffset());
                        readyTime = arrivalLocal.plus(finalLeg ? Config.WAREHOUSE_DWELL : Config.TRANSFER_BUFFER);
                        visited.add(current);
                        currentRouteQty = sendQty;
                        reserved = true;
                        break;
                    }
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

    private Map<String, List<String>> buildReverseGraph() {
        Map<String, List<String>> reverse = new HashMap<>();
        for (Flight flight : flights.getAll()) {
            reverse.computeIfAbsent(flight.getDestinationCode(), key -> new ArrayList<>())
                    .add(flight.getOriginCode());
        }
        return reverse;
    }

    private List<Flight> rankCandidates(List<Flight> options,
                                        String currentOrigin,
                                        String destination,
                                        Set<String> visited,
                                        LocalDateTime readyTime) {
        if (mode == SelectionMode.RANDOM_APPROACH) {
            List<Flight> prioritized = new ArrayList<>();
            for (Flight option : options) {
                double currentGeo = distanceToDestination(option.getOriginCode(), destination);
                double nextGeo = distanceToDestination(option.getDestinationCode(), destination);
                if (nextGeo < currentGeo || option.getDestinationCode().equals(destination)) {
                    prioritized.add(option);
                }
            }

            if (prioritized.isEmpty()) {
                for (Flight option : options) {
                    if (!visited.contains(option.getDestinationCode())) {
                        prioritized.add(option);
                    }
                }
            }

            if (prioritized.isEmpty()) {
                prioritized.addAll(options);
            }

            Collections.shuffle(prioritized, rnd);
            return prioritized;
        }

        List<Flight> prioritized = getTopCandidates(currentOrigin, destination, options, readyTime, visited);
        if (prioritized.isEmpty()) {
            prioritized = new ArrayList<>(options);
        }
        return prioritized;
    }

    private List<Flight> getTopCandidates(String origin,
                                          String destination,
                                          List<Flight> options,
                                          LocalDateTime readyTime,
                                          Set<String> visited) {
        PriorityQueue<FlightScore> pq = new PriorityQueue<>((a, b) -> {
            int cmp = Double.compare(b.score, a.score); // max-heap on score
            if (cmp != 0) return cmp;
            return b.flight.getId().compareTo(a.flight.getId());
        });

        for (Flight flight : options) {
            if (visited.contains(flight.getDestinationCode())) continue;
            double score = slackScore(flight, destination, readyTime);
            pq.offer(new FlightScore(flight, score));
            if (pq.size() > TOP_K_CANDIDATES) {
                pq.poll(); // descarta el peor
            }
        }

        List<FlightScore> best = new ArrayList<>(pq);
        best.sort((a, b) -> {
            int cmp = Double.compare(a.score, b.score);
            if (cmp != 0) return cmp;
            return a.flight.getId().compareTo(b.flight.getId());
        });
        List<Flight> result = new ArrayList<>(best.size());
        for (FlightScore fs : best) {
            result.add(fs.flight);
        }
        return result;
    }

    private double slackScore(Flight flight,
                              String destination,
                              LocalDateTime readyTime) {
        double geoDistance = distanceToDestination(flight.getDestinationCode(), destination);
        LocalDate dateEstimate = readyTime != null ? readyTime.toLocalDate() : LocalDate.now();
        double flightUtil = flightSchedule.utilizationRatio(flight, dateEstimate);
        double airportUtil = airportSchedule.utilizationRatio(flight.getDestinationCode(), readyTime != null ? readyTime : LocalDateTime.now());
        double congestion = flightUtil + airportUtil;
        double hubPenalty = PRODUCTION_HUBS.contains(flight.getDestinationCode()) ? 0.3 : 0.0;
        return geoDistance * (1.0 + congestion + hubPenalty);
    }

    private record FlightScore(Flight flight, double score) {}

    private double continentPenalty(String airportCode, String destinationCode) {
        return 0; // sin sesgo por continente; lo decidirá el fitness
    }

    private boolean reserveSegment(Route route, Flight flight, LocalDate date, int quantity, boolean finalLeg, Instant dueInstant) {
        if (!flightSchedule.tryReserve(flight, date, quantity)) {
            return false;
        }

        Airport destinationAirport = airports.get(flight.getDestinationCode());
        LocalDateTime arrivalLocal = toLocal(flight.getArrivalInstant(date), destinationAirport.getZoneOffset());
        LocalDateTime departureLocal = arrivalLocal.plus(finalLeg ? Config.WAREHOUSE_DWELL : Config.TRANSFER_BUFFER);

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

    private LocalDateTime clampReadyTime(Order order, Airport originAirport) {
        Instant start = order.getCreationUtc();
        if (notBefore != null && notBefore.isAfter(start)) {
            start = notBefore;
        }
        return LocalDateTime.ofInstant(start, originAirport.getZoneOffset());
    }

    private LocalDateTime toLocal(Instant instant, ZoneOffset offset) {
        return LocalDateTime.ofInstant(instant, offset);
    }

    public double distanceToDestination(String airportCode, String destinationCode) {
        if (airportCode == null || destinationCode == null) {
            return Double.MAX_VALUE / 2;
        }
        Map<String, Double> cacheForDest = distanceCache.computeIfAbsent(destinationCode, k -> new HashMap<>());
        Double cached = cacheForDest.get(airportCode);
        if (cached != null) {
            return cached;
        }
        Airport origin = airports.get(airportCode);
        Airport destination = airports.get(destinationCode);
        double value;
        if (origin == null || destination == null) {
            value = Double.MAX_VALUE / 2;
        } else {
            value = haversineKm(origin.getLatitude(), origin.getLongitude(), destination.getLatitude(), destination.getLongitude());
        }
        cacheForDest.put(airportCode, value);
        return value;
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
}
