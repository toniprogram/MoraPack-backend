package com.morapack.skyroute.algorithm;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
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

public class RouteBuilder {
    private static final List<String> PRODUCTION_HUBS = List.of("SPIM", "EBCI", "UBBB");
    private static final int MAX_HOPS = 8;
    private static final int MAX_DAY_LOOKAHEAD = 3;
    private static final double AVG_CRUISE_SPEED_KMH = 800.0;
    private static final int CAPACITY_GREEDY_LOOKAHEAD_DAYS = 7; // tope superior, se ajusta por SLA

    private final Flights flights;
    private final Airports airports;
    private final FlightSchedule flightSchedule;
    private final AirportSchedule airportSchedule;
    private final Map<String, List<String>> reverseGraph;
    private final Random rnd;
    private final SelectionMode mode;
    private static final int BEAM_WIDTH = 2;
    private static final int BEAM_DEPTH = 4;
    private static final long BEAM_BUDGET_MS = 30_000L;

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
        if (mode == SelectionMode.CAPACITY_GREEDY) {
            return buildRouteCapacityGreedy(order, originHub, quantity);
        }
        if (mode == SelectionMode.FLOW_CAPACITY) {
            return buildRouteFlowCapacity(order, originHub, quantity);
        }
        // Fallback builder (sin reservas, sólo traza) para evitar planes vacíos
        if (mode == SelectionMode.FLOW_FALLBACK) {
            return buildRouteFallback(order, originHub, quantity);
        }
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
                .plus(Config.TRANSFER_BUFFER); // primera pierna: solo buffer mínimo
        Map<String, Integer> distances = computeHopDistances(destination);

        if (mode == SelectionMode.EXHAUSTIVE_APPROACH) {
            Route exhaustive = buildRouteExhaustive(order, originHub, quantity);
            return exhaustive;
        }
        if (mode == SelectionMode.BEAM_APPROACH) {
            return buildRouteBeam(order, originHub, quantity);
        }

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
            List<Flight> candidates = rankCandidates(options, currentDist, destination, distances, visited, readyTime, dueInstant);
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
                        if (sendQty < currentRouteQty) {
                            trimRouteToQty(route, sendQty);
                            currentRouteQty = sendQty;
                        }
                        current = candidate.getDestinationCode();
                        currentAirport = airports.get(current);
                        LocalDateTime arrivalLocal = toLocal(candidate.getArrivalInstant(date), currentAirport.getZoneOffset());
                        readyTime = arrivalLocal.plus(finalLeg ? Config.WAREHOUSE_DWELL : Config.TRANSFER_BUFFER);
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

    private Route buildRouteExhaustive(Order order, String originHub, int quantity) {
        String destination = order.getDestinationCode();
        Route route = new Route(quantity);
        if (originHub.equals(destination)) {
            return route;
        }
        Airport originAirport = airports.get(originHub);
        if (originAirport == null) {
            return null;
        }
        Duration overallSla = slaFor(originHub, destination);
        Instant dueInstant = order.getCreationUtc().plus(overallSla);
        LocalDateTime readyTime = LocalDateTime.ofInstant(order.getCreationUtc(), originAirport.getZoneOffset())
                .plus(Config.TRANSFER_BUFFER);

        Set<String> visited = new HashSet<>();
        visited.add(originHub);
        boolean success = explore(order, route, originHub, destination, quantity, readyTime, dueInstant, visited, 0);
        if (!success || route.getSegments().isEmpty()) {
            releaseAllocated(route);
            return null;
        }
        route.setQuantity(route.getSegments().isEmpty() ? 0 : route.getSegments().get(0).getRouteQuantity());
        return route;
    }

    private Route buildRouteCapacityGreedy(Order order, String originHub, int quantity) {
        String destination = order.getDestinationCode();
        Route route = new Route(quantity);
        if (originHub.equals(destination)) {
            return route;
        }
        Airport originAirport = airports.get(originHub);
        if (originAirport == null) {
            return null;
        }
        Instant dueInstant = order.getCreationUtc().plus(slaFor(originHub, destination));
        LocalDateTime readyTime = LocalDateTime.ofInstant(order.getCreationUtc(), originAirport.getZoneOffset())
                .plus(Config.TRANSFER_BUFFER);

        List<Flight> directOptions = flights.getByOriginCode(originHub).stream()
                .filter(f -> destination.equals(f.getDestinationCode()))
                .toList();
        if (directOptions.isEmpty()) {
            return null;
        }

        // Respetamos estrictamente el SLA: continental=2 días, intercontinental=3 días (incluye buffers).
        int slaDays = Math.max(1, (int) Math.ceil(slaFor(originHub, destination).toHours() / 24.0));
        int dayLimit = slaDays;
        LocalDate date = readyTime.toLocalDate();
        for (int d = 0; d < dayLimit; d++) {
            for (Flight flight : directOptions) {
                LocalDateTime depLocal = toLocal(flight.getDepartureInstant(date), originAirport.getZoneOffset());
                if (depLocal.isBefore(readyTime)) {
                    continue;
                }
                int available = flightSchedule.getRemainingCapacity(flight, date);
                if (available <= 0) {
                    continue;
                }
                int sendQty = Math.min(quantity, available);
                if (reserveSegment(route, flight, date, sendQty, true, dueInstant)) {
                    route.setQuantity(sendQty);
                    return route;
                }
            }
            date = date.plusDays(1);
        }
        releaseAllocated(route);
        return null;
    }

    /**
     * Construye una ruta ignorando capacidad/SLA para evitar pedidos sin rutas.
     * No reserva en schedules; sólo arma los tramos más tempranos posibles.
     */
    Route buildRouteFallback(Order order, String originHub, int quantity) {
        String destination = order.getDestinationCode();
        if (originHub.equals(destination)) {
            return new Route(quantity);
        }
        Airport originAirport = airports.get(originHub);
        if (originAirport == null) {
            return null;
        }
        LocalDateTime readyTime = LocalDateTime.ofInstant(order.getCreationUtc(), originAirport.getZoneOffset())
                .plus(Config.TRANSFER_BUFFER);

        List<List<Flight>> paths = candidatePaths(originHub, destination, 2, 10);
        if (paths.isEmpty()) {
            return null;
        }

        Route bestRoute = null;
        long bestArrival = Long.MAX_VALUE;
        for (List<Flight> path : paths) {
            LocalDateTime rt = readyTime;
            Route candidate = new Route(quantity);
            boolean ok = true;
            for (int i = 0; i < path.size(); i++) {
                Flight f = path.get(i);
                boolean finalLeg = i == path.size() - 1 && f.getDestinationCode().equals(destination);
                LocalDate date = rt.toLocalDate();
                // empujar al siguiente día si la salida es antes de estar listo
                if (toLocal(f.getDepartureInstant(date), originAirport.getZoneOffset()).isBefore(rt)) {
                    date = date.plusDays(1);
                }
                LocalDateTime depLocal = toLocal(f.getDepartureInstant(date), airports.get(f.getOriginCode()).getZoneOffset());
                LocalDateTime arrLocal = toLocal(f.getArrivalInstant(date), airports.get(f.getDestinationCode()).getZoneOffset());
                RouteSegment segment = new RouteSegment(f, date, quantity, finalLeg);
                candidate.add(segment);
                rt = arrLocal.plus(finalLeg ? Config.WAREHOUSE_DWELL : Config.TRANSFER_BUFFER);
            }
            if (ok) {
                candidate.setQuantity(quantity);
                Instant arrivalInstant = candidate.getSegments().isEmpty()
                        ? order.getCreationUtc()
                        : candidate.getSegments().get(candidate.getSegments().size() - 1)
                        .getFlight().getArrivalInstant(candidate.getSegments().get(candidate.getSegments().size() - 1).getDate());
                if (arrivalInstant != null && arrivalInstant.toEpochMilli() < bestArrival) {
                    bestArrival = arrivalInstant.toEpochMilli();
                    bestRoute = candidate;
                }
            }
        }
        return bestRoute;
    }

    /**
        * Enfoque orientado a congestión: limita a rutas cortas (≤2 conexiones) y asigna bloques
        * por costo marginal (tiempo + penalización por ocupación). Divide la carga en varias rutas.
        */
    private Route buildRouteFlowCapacity(Order order, String originHub, int quantity) {
        String destination = order.getDestinationCode();
        if (originHub.equals(destination)) {
            return new Route(quantity);
        }
        Airport originAirport = airports.get(originHub);
        if (originAirport == null) {
            return null;
        }
        Instant dueInstant = order.getCreationUtc().plus(slaFor(originHub, destination));
        LocalDateTime readyTime = LocalDateTime.ofInstant(order.getCreationUtc(), originAirport.getZoneOffset())
                .plus(Config.TRANSFER_BUFFER);

        List<List<Flight>> candidates = candidatePaths(originHub, destination, 2, 10);
        if (candidates.isEmpty()) {
            return null;
        }

        int remainingQty = quantity;
        Route finalRoute = new Route(quantity);
        // Seguimos asignando bloques mientras haya demanda y exista un camino factible
        while (remainingQty > 0) {
            PathChoice best = null;
            for (List<Flight> path : candidates) {
                PathChoice choice = evaluatePath(path, readyTime, dueInstant, remainingQty, destination);
                if (choice == null) continue;
                if (best == null || choice.cost() < best.cost()) {
                    best = choice;
                }
            }
            if (best == null) {
                break; // no hay camino factible
            }
            Route blockRoute = reserveSlots(best.slots(), destination, dueInstant);
            if (blockRoute == null) {
                candidates.remove(best.path());
                if (candidates.isEmpty()) break;
                continue;
            }
            // Sincronizar cantidad a bloque enviado
            int sent = blockRoute.getQuantity();
            remainingQty -= sent;
            readyTime = best.slots().get(best.slots().size() - 1).nextReady(); // siguiente bloque parte después del último arribo + dwell
            // agregar segmentos al finalRoute
            finalRoute.getSegments().addAll(blockRoute.getSegments());
            finalRoute.setSlack(blockRoute.getSlack());
        }

        if (finalRoute.getSegments().isEmpty()) {
            releaseAllocated(finalRoute);
            return null;
        }
        finalRoute.setQuantity(quantity - remainingQty);
        return finalRoute;
    }

    private List<List<Flight>> candidatePaths(String origin,
                                              String destination,
                                              int maxConnections,
                                              int maxPaths) {
        List<List<Flight>> result = new ArrayList<>();

        // directos
        for (Flight f : flights.getByOriginCode(origin)) {
            if (f.getDestinationCode().equals(destination)) {
                result.add(List.of(f));
                if (result.size() >= maxPaths) return result;
            }
        }

        // 1 conexión
        if (maxConnections >= 1) {
            for (Flight first : flights.getByOriginCode(origin)) {
                String mid = first.getDestinationCode();
                if (mid.equals(destination) || mid.equals(origin)) continue;
                for (Flight second : flights.getByOriginCode(mid)) {
                    if (second.getDestinationCode().equals(origin)) continue;
                    if (second.getDestinationCode().equals(destination)) {
                        result.add(List.of(first, second));
                        if (result.size() >= maxPaths) return result;
                    }
                }
            }
        }

        // 2 conexiones
        if (maxConnections >= 2) {
            for (Flight f1 : flights.getByOriginCode(origin)) {
                String mid1 = f1.getDestinationCode();
                if (mid1.equals(origin)) continue;
                for (Flight f2 : flights.getByOriginCode(mid1)) {
                    String mid2 = f2.getDestinationCode();
                    if (mid2.equals(origin) || mid2.equals(mid1)) continue;
                    for (Flight f3 : flights.getByOriginCode(mid2)) {
                        if (f3.getDestinationCode().equals(destination)) {
                            result.add(List.of(f1, f2, f3));
                            if (result.size() >= maxPaths) return result;
                        }
                    }
                }
            }
        }
        return result;
    }

    private PathChoice evaluatePath(List<Flight> path,
                                    LocalDateTime readyTime,
                                    Instant dueInstant,
                                    int remainingQty,
                                    String destination) {
        List<Slot> slots = new ArrayList<>();
        LocalDateTime currentReady = readyTime;
        int bottleneck = remainingQty;
        for (int i = 0; i < path.size(); i++) {
            Flight flight = path.get(i);
            boolean finalLeg = i == path.size() - 1 && flight.getDestinationCode().equals(destination);
            Slot slot = findEarliestSlot(flight, currentReady, dueInstant, finalLeg);
            if (slot == null) {
                return null;
            }
            bottleneck = Math.min(bottleneck, slot.available());
            slots.add(slot);
            currentReady = slot.nextReady();
        }
        if (bottleneck <= 0) {
            return null;
        }
        int block = Math.min(bottleneck, Math.max(50, remainingQty / 4));
        // Si el vuelo más lleno está >70%, reducimos el bloque para repartir
        double maxOccupancy = slots.stream()
                .mapToDouble(s -> congestion(s.flight(), s.date()))
                .max().orElse(0d);
        if (maxOccupancy > 0.7) {
            block = Math.min(block, Math.max(30, bottleneck / 2));
        }
        // costo marginal: tiempo + penalización por congestión
        double travelMinutes = 0d;
        double congestionCost = 0d;
        for (Slot s : slots) {
            travelMinutes += estimateFlightDurationMinutes(s.flight());
            double occ = congestion(s.flight(), s.date());
            congestionCost += occ * occ * 1000d;
        }
        double cost = travelMinutes + congestionCost;
        // ajustar cantidades en slots al bloque propuesto
        List<Slot> sized = new ArrayList<>(slots.size());
        for (Slot s : slots) {
            sized.add(new Slot(s.flight(), s.date(), s.nextReady(), block, s.finalLeg()));
        }
        return new PathChoice(path, sized, cost);
    }

    private Slot findEarliestSlot(Flight flight,
                                  LocalDateTime readyTime,
                                  Instant dueInstant,
                                  boolean finalLeg) {
        Airport originAirport = airports.get(flight.getOriginCode());
        int slaDays = dueInstant != null
                ? Math.max(1, (int) Math.ceil(Duration.between(readyTime.toInstant(originAirport.getZoneOffset()), dueInstant).toHours() / 24.0))
                : MAX_DAY_LOOKAHEAD;
        LocalDate date = readyTime.toLocalDate();
        for (int d = 0; d < slaDays; d++) {
            LocalDateTime depLocal = toLocal(flight.getDepartureInstant(date), originAirport.getZoneOffset());
            if (depLocal.isBefore(readyTime)) {
                date = date.plusDays(1);
                continue;
            }
            int remaining = flightSchedule.getRemainingCapacity(flight, date);
            if (remaining <= 0) {
                date = date.plusDays(1);
                continue;
            }
            Airport destAirport = airports.get(flight.getDestinationCode());
            LocalDateTime arrLocal = toLocal(flight.getArrivalInstant(date), destAirport.getZoneOffset());
            LocalDateTime nextReady = arrLocal.plus(finalLeg ? Config.WAREHOUSE_DWELL : Config.TRANSFER_BUFFER);
            return new Slot(flight, date, nextReady, remaining, finalLeg);
        }
        return null;
    }

    private double congestion(Flight flight, LocalDate date) {
        int remaining = flightSchedule.getRemainingCapacity(flight, date);
        int cap = Math.max(1, flight.getDailyCapacity());
        int used = Math.max(0, cap - remaining);
        return Math.min(1.0, used / (double) cap);
    }


    private Route buildRouteBeam(Order order, String originHub, int quantity) {
        String destination = order.getDestinationCode();
        Route best = null;
        long deadline = System.nanoTime() + BEAM_BUDGET_MS * 1_000_000L;

        for (int attempt = 0; attempt < BEAM_WIDTH; attempt++) {
            Route candidate = beamSearch(order, originHub, destination, quantity, deadline);
            if (candidate != null && !candidate.getSegments().isEmpty()) {
                best = candidate;
                break;
            }
            if (System.nanoTime() > deadline) {
                break;
            }
        }
        return best;
    }

    private Route beamSearch(Order order,
                             String originHub,
                             String destination,
                             int quantity,
                             long deadlineNanos) {
        Instant dueInstant = order.getCreationUtc().plus(slaFor(originHub, destination));
        Airport originAirport = airports.get(originHub);
        if (originAirport == null) return null;

        LocalDateTime readyTime = LocalDateTime.ofInstant(order.getCreationUtc(), originAirport.getZoneOffset())
                .plus(Config.WAREHOUSE_DWELL);

        List<BeamNode> frontier = new ArrayList<>();
        frontier.add(new BeamNode(originHub, readyTime, new ArrayList<>(), quantity));

        for (int depth = 0; depth < BEAM_DEPTH; depth++) {
            if (System.nanoTime() > deadlineNanos) break;
            List<BeamNode> next = new ArrayList<>();
            for (BeamNode node : frontier) {
                if (node.airport().equals(destination)) {
                    Route route = reservePath(node.path(), destination, dueInstant);
                    if (route != null) {
                        return route;
                    }
                    continue;
                }
                List<FlightCandidate> flights = nextFlights(node, destination, dueInstant);
                flights.sort(Comparator.comparingDouble(FlightCandidate::score));
                int width = Math.min(BEAM_WIDTH, flights.size());
                for (int i = 0; i < width; i++) {
                    FlightCandidate fc = flights.get(i);
                    List<SegmentChoice> newPath = new ArrayList<>(node.path());
                    newPath.add(new SegmentChoice(fc.flight(), fc.date(), fc.finalLeg(), fc.qty()));
                    next.add(new BeamNode(fc.flight().getDestinationCode(), fc.readyTime(), newPath, node.quantity()));
                }
            }
            if (next.isEmpty()) {
                break;
            }
            frontier = next;
        }

        // Intentar reservar si alguna frontera llega al destino
        for (BeamNode node : frontier) {
            if (node.airport().equals(destination)) {
                Route route = reservePath(node.path(), destination, dueInstant);
                if (route != null) {
                    return route;
                }
            }
        }
        return null;
    }

    private Route reservePath(List<SegmentChoice> path, String destination, Instant dueInstant) {
        Route route = new Route(path.isEmpty() ? 0 : path.get(0).qty());
        List<Runnable> rollbacks = new ArrayList<>();
        try {
            for (int i = 0; i < path.size(); i++) {
                SegmentChoice sc = path.get(i);
                boolean finalLeg = (i == path.size() - 1) && sc.flight().getDestinationCode().equals(destination);
                if (!reserveSegment(route, sc.flight(), sc.date(), sc.qty(), finalLeg, dueInstant)) {
                    throw new IllegalStateException("reserve failed");
                }
                trimRouteToQty(route, sc.qty());
                rollbacks.add(() -> {
                    try {
                        releaseLast(route);
                    } catch (Exception ignored) {}
                });
            }
            return route;
        } catch (Exception ex) {
            Collections.reverse(rollbacks);
            rollbacks.forEach(Runnable::run);
            return null;
        }
    }

    private Route reserveSlots(List<Slot> slots, String destination, Instant dueInstant) {
        List<SegmentChoice> path = new ArrayList<>(slots.size());
        for (Slot slot : slots) {
            path.add(new SegmentChoice(slot.flight(), slot.date(), slot.finalLeg(), slot.available()));
        }
        return reservePath(path, destination, dueInstant);
    }

    private List<FlightCandidate> nextFlights(BeamNode node, String destination, Instant dueInstant) {
        List<FlightCandidate> result = new ArrayList<>();
        List<Flight> options = new ArrayList<>(flights.getByOriginCode(node.airport()));
        for (Flight flight : options) {
            LocalDate date = node.readyTime().toLocalDate();
            for (int d = 0; d < MAX_DAY_LOOKAHEAD; d++) {
                LocalDateTime depLocal = toLocal(flight.getDepartureInstant(date), airports.get(node.airport()).getZoneOffset());
                if (depLocal.isBefore(node.readyTime())) {
                    date = date.plusDays(1);
                    continue;
                }
                int available = flightSchedule.getRemainingCapacity(flight, date);
                if (available <= 0) {
                    date = date.plusDays(1);
                    continue;
                }
                int qty = Math.min(node.quantity(), available);
                boolean finalLeg = flight.getDestinationCode().equals(destination);
                LocalDateTime arrivalLocal = toLocal(flight.getArrivalInstant(date), airports.get(flight.getDestinationCode()).getZoneOffset());
                double travelMinutes = Duration.between(depLocal, arrivalLocal).toMinutes();
                double dist = distanceToDestination(flight.getDestinationCode(), destination);
                double score = travelMinutes + dist / 1000.0;
                result.add(new FlightCandidate(flight, date, finalLeg, arrivalLocal.plus(finalLeg ? Config.WAREHOUSE_DWELL : Config.TRANSFER_BUFFER), score, qty));
                break; // tomar la primera fecha válida para este vuelo
            }
        }
        return result;
    }

    private boolean explore(Order order,
                            Route route,
                            String current,
                            String destination,
                            int quantity,
                            LocalDateTime readyTime,
                            Instant dueInstant,
                            Set<String> visited,
                            int hops) {
        if (hops >= MAX_HOPS) {
            return false;
        }
        List<Flight> options = new ArrayList<>(flights.getByOriginCode(current));
        if (options.isEmpty()) {
            return false;
        }
        for (Flight candidate : options) {
            LocalDate date = readyTime.toLocalDate();
            for (int attempts = 0; attempts < MAX_DAY_LOOKAHEAD; attempts++) {
                LocalDateTime depLocal = toLocal(candidate.getDepartureInstant(date), airports.get(current).getZoneOffset());
                if (depLocal.isBefore(readyTime)) {
                    date = date.plusDays(1);
                    continue;
                }
                int available = flightSchedule.getRemainingCapacity(candidate, date);
                if (available <= 0) {
                    date = date.plusDays(1);
                    continue;
                }
                int sendQty = Math.min(quantity, available);
                boolean finalLeg = candidate.getDestinationCode().equals(destination);
                if (!reserveSegment(route, candidate, date, sendQty, finalLeg, dueInstant)) {
                    date = date.plusDays(1);
                    continue;
                }
                if (finalLeg) {
                    route.setQuantity(sendQty);
                    return true;
                }
                String next = candidate.getDestinationCode();
                if (visited.contains(next)) {
                    // backtrack
                    releaseLast(route);
                    date = date.plusDays(1);
                    continue;
                }
                visited.add(next);
                Airport nextAirport = airports.get(next);
                LocalDateTime arrivalLocal = toLocal(candidate.getArrivalInstant(date), nextAirport.getZoneOffset());
                LocalDateTime nextReady = arrivalLocal.plus(Config.TRANSFER_BUFFER);
                if (explore(order, route, next, destination, sendQty, nextReady, dueInstant, visited, hops + 1)) {
                    return true;
                }
                visited.remove(next);
                releaseLast(route);
                date = date.plusDays(1);
            }
        }
        return false;
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
                                        Set<String> visited,
                                        LocalDateTime readyTime,
                                        Instant dueInstant) {
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
                slackScore(a, destination, distances, readyTime, dueInstant, prioritized),
                slackScore(b, destination, distances, readyTime, dueInstant, prioritized)));
        return prioritized;
    }

    private double slackScore(Flight flight,
                              String destination,
                              Map<String, Integer> distances,
                              LocalDateTime readyTime,
                              Instant dueInstant,
                              List<Flight> peerOptions) {
        double geoDistance = distanceToDestination(flight.getDestinationCode(), destination);
        int directBonus = flight.getDestinationCode().equals(destination) ? -10 : 0;

        Instant arrivalEstimate = estimateArrivalInstant(flight, readyTime);
        long slackMinutes = dueInstant == null ? 0 : Duration.between(arrivalEstimate, dueInstant).toMinutes();

        boolean hasContinentalOnTime = hasContinentalOnTime(peerOptions, destination, readyTime, dueInstant);
        double continentPenalty = continentPenaltyConditional(flight.getDestinationCode(), destination, hasContinentalOnTime);

        // score: favorecer los que lleguen antes (slack alto => score bajo), luego distancia y penalizaciones.
        return -slackMinutes + geoDistance + continentPenalty + directBonus;
    }

    private Instant estimateArrivalInstant(Flight flight, LocalDateTime readyTime) {
        Airport originAirport = airports.get(flight.getOriginCode());
        ZoneOffset originOffset = originAirport != null ? originAirport.getZoneOffset() : ZoneOffset.UTC;
        LocalDate date = readyTime.toLocalDate();
        LocalDateTime depLocal = toLocal(flight.getDepartureInstant(date), originOffset);
        if (depLocal.isBefore(readyTime)) {
            date = date.plusDays(1);
        }
        return flight.getArrivalInstant(date);
    }

    private boolean hasContinentalOnTime(List<Flight> options,
                                         String destination,
                                         LocalDateTime readyTime,
                                         Instant dueInstant) {
        if (dueInstant == null) {
            return false;
        }
        for (Flight option : options) {
            if (isIntercontinental(option.getDestinationCode(), destination)) {
                continue;
            }
            Instant arrival = estimateArrivalInstant(option, readyTime);
            if (!arrival.isAfter(dueInstant)) {
                return true;
            }
        }
        return false;
    }

    private boolean isIntercontinental(String airportCode, String destinationCode) {
        Airport target = airports.get(destinationCode);
        Airport candidate = airports.get(airportCode);
        if (target == null || candidate == null) {
            return false;
        }
        return !Objects.equals(target.getContinent(), candidate.getContinent());
    }

    private double continentPenaltyConditional(String airportCode,
                                               String destinationCode,
                                               boolean hasContinentalOnTime) {
        if (!hasContinentalOnTime) {
            return 0;
        }
        return isIntercontinental(airportCode, destinationCode) ? 5_000 : 0;
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
            Duration slack = dueInstant != null ? Duration.between(releaseInstant, dueInstant) : null;
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

    void releaseRoute(Route route) {
        if (route == null) {
            return;
        }
        releaseAllocated(route);
    }

    private void releaseLast(Route route) {
        List<RouteSegment> segments = route.getSegments();
        if (segments.isEmpty()) {
            return;
        }
        RouteSegment last = segments.remove(segments.size() - 1);
        Flight flight = last.getFlight();
        LocalDate date = last.getDate();
        int qty = last.getRouteQuantity();
        try {
            flightSchedule.release(flight, date, qty);
        } catch (Exception ignored) {}
        Airport destinationAirport = airports.get(flight.getDestinationCode());
        if (destinationAirport != null) {
            LocalDateTime arrivalLocal = toLocal(flight.getArrivalInstant(date), destinationAirport.getZoneOffset());
            LocalDateTime departureLocal = arrivalLocal.plus(last.isFinalLeg() ? Config.WAREHOUSE_DWELL : Config.TRANSFER_BUFFER);
            try {
                airportSchedule.releaseTransit(destinationAirport.code, arrivalLocal, departureLocal, qty);
            } catch (Exception ignored) {}
        }
    }

    private void trimRouteToQty(Route route, int newQty) {
        if (newQty <= 0) return;
        List<RouteSegment> segments = route.getSegments();
        for (RouteSegment segment : segments) {
            int currentQty = segment.getRouteQuantity();
            if (currentQty <= newQty) {
                segment.setRouteQuantity(newQty);
                continue;
            }
            int diff = currentQty - newQty;
            Flight flight = segment.getFlight();
            LocalDate date = segment.getDate();
            try {
                flightSchedule.release(flight, date, diff);
            } catch (Exception ignored) {}
            Airport destinationAirport = airports.get(flight.getDestinationCode());
            if (destinationAirport != null) {
                LocalDateTime arrivalLocal = toLocal(flight.getArrivalInstant(date), destinationAirport.getZoneOffset());
                LocalDateTime departureLocal = arrivalLocal.plus(segment.isFinalLeg() ? Config.WAREHOUSE_DWELL : Config.TRANSFER_BUFFER);
                try {
                    airportSchedule.releaseTransit(destinationAirport.code, arrivalLocal, departureLocal, diff);
                } catch (Exception ignored) {}
            }
            segment.setRouteQuantity(newQty);
        }
        route.setQuantity(newQty);
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

    public enum SelectionMode {
        RANDOM_APPROACH,
        HEURISTIC_APPROACH,
        EXHAUSTIVE_APPROACH,
        BEAM_APPROACH,
        CAPACITY_GREEDY,
        FLOW_CAPACITY,
        FLOW_FALLBACK
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

    private record BeamNode(String airport, LocalDateTime readyTime, List<SegmentChoice> path, int quantity) {}
    private record SegmentChoice(Flight flight, LocalDate date, boolean finalLeg, int qty) {}
    private record FlightCandidate(Flight flight, LocalDate date, boolean finalLeg, LocalDateTime readyTime, double score, int qty) {}
    private record Slot(Flight flight, LocalDate date, LocalDateTime nextReady, int available, boolean finalLeg) {}
    private record PathChoice(List<Flight> path, List<Slot> slots, double cost) {}
}
