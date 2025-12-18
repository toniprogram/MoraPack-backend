package com.morapack.skyroute.algorithm;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.Set;

import org.slf4j.LoggerFactory;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Objects;

import com.morapack.skyroute.config.*;
import com.morapack.skyroute.io.Airports;
import com.morapack.skyroute.models.*;

public class Individual {
    private final List<OrderPlan> plans;
    private final FlightSchedule flightSchedule;
    private final AirportSchedule airportSchedule;
    private double fitness;
    private int slaViolations;

    // Ajustes por hilo para permitir más intentos y elegir el modo de selección de rutas (p.ej. operación diaria).
    private static final ThreadLocal<Double> ATTEMPT_FACTOR = ThreadLocal.withInitial(() -> 1d);
    private static final ThreadLocal<RouteBuilder.SelectionMode> ROUTE_MODE =
            ThreadLocal.withInitial(() -> RouteBuilder.SelectionMode.RANDOM_APPROACH);

    private Individual(List<OrderPlan> plans, FlightSchedule flightSchedule, AirportSchedule airportSchedule) {
        this.plans = plans;
        this.flightSchedule = flightSchedule;
        this.airportSchedule = airportSchedule;
    }

    static Individual randomIndividual(World world, List<Order> orders, Random rnd) {
        FlightSchedule flightSchedule = world.getFlights().getSchedule().copy();
        AirportSchedule airportSchedule = world.getAirportSchedule().copy();
        RouteBuilder builder = new RouteBuilder(world, flightSchedule, airportSchedule, rnd, ROUTE_MODE.get());

        List<OrderPlan> plans = new ArrayList<>();
        for (Order order : orders) {
            OrderPlan plan = buildPlanForOrder(order, builder, world, rnd);
            plans.add(plan);
        }

        Individual individual = new Individual(plans, flightSchedule, airportSchedule);
        return individual;
    }

    static Individual crossover(World world, List<Order> orders, Individual parentA, Individual parentB, Random rnd) {
        // Construimos desde un schedule limpio para mezclar 50/50 sin arrastrar reservas incompatibles.
        FlightSchedule flightSchedule = world.getFlights().getSchedule().copy();
        AirportSchedule airportSchedule = world.getAirportSchedule().copy();
        RouteBuilder builder = new RouteBuilder(world, flightSchedule, airportSchedule, rnd, ROUTE_MODE.get());

        List<OrderPlan> plans = new ArrayList<>(orders.size());
        // Mezcla simple: primera mitad intenta tomar de A, segunda mitad de B (desordenado para variedad).
        List<Order> shuffled = new ArrayList<>(orders);
        Collections.shuffle(shuffled, rnd);
        int split = shuffled.size() / 2;

        for (int i = 0; i < shuffled.size(); i++) {
            Order order = shuffled.get(i);
            boolean preferA = i < split;
            OrderPlan preferred = preferA ? findPlan(parentA, order.getId()) : findPlan(parentB, order.getId());
            OrderPlan fallback = preferA ? findPlan(parentB, order.getId()) : findPlan(parentA, order.getId());

            // Intentar adoptar el plan preferido; si falla probamos el alternativo y luego reconstruimos.
            OrderPlan adopted = tryAdoptPlan(world, order, preferred, flightSchedule, airportSchedule);
            if (adopted == null) {
                adopted = tryAdoptPlan(world, order, fallback, flightSchedule, airportSchedule);
            }
            if (adopted != null) {
                plans.add(adopted);
            } else {
                OrderPlan rebuilt = buildPlanWithPreferences(order, preferred != null ? preferred : fallback, builder, world, rnd);
                plans.add(rebuilt);
            }
        }

        return new Individual(plans, flightSchedule, airportSchedule);
    }

    static Individual mutate(World world, List<Order> orders, Individual parent, Random rnd) {
        // Partimos del schedule del padre para evitar reconstruir todo desde cero
        FlightSchedule flightSchedule = parent.flightSchedule.copy();
        AirportSchedule airportSchedule = parent.airportSchedule.copy();
        RouteBuilder builder = new RouteBuilder(world, flightSchedule, airportSchedule, rnd, ROUTE_MODE.get());

        int mutateCount = Math.max(1, orders.size() / 5);
        Set<String> mutateIds = selectOrderIds(orders, mutateCount, rnd);

        // Liberar reservas de los planes a mutar
        for (OrderPlan plan : parent.plans) {
            if (mutateIds.contains(plan.getOrderId())) {
                releasePlan(world, plan, flightSchedule, airportSchedule);
            }
        }

        List<OrderPlan> plans = new ArrayList<>();
        for (Order order : orders) {
            if (mutateIds.contains(order.getId())) {
                OrderPlan preferred = findPlan(parent, order.getId());
                OrderPlan rebuilt = buildPlanWithPreferences(order, preferred, builder, world, rnd);
                plans.add(rebuilt);
            } else {
                OrderPlan existing = findPlan(parent, order.getId());
                OrderPlan copy = copyPlan(existing);
                if (copy != null) {
                    plans.add(copy);
                } else {
                    plans.add(buildPlanWithPreferences(order, existing, builder, world, rnd));
                }
            }
        }

        Individual mutant = new Individual(plans, flightSchedule, airportSchedule);
        return mutant;
    }

    public Individual copy() {
        List<OrderPlan> planCopies = deepCopyPlans(this.plans);
        Individual clone = new Individual(planCopies, flightSchedule.copy(), airportSchedule.copy());
        clone.fitness = this.fitness;
        clone.slaViolations = this.slaViolations;
        return clone;
    }

    public Individual tryInsertOrder(World world, Order newOrder, Random rnd) {
        FlightSchedule scheduleCopy = flightSchedule.copy();
        AirportSchedule airportCopy = airportSchedule.copy();
        RouteBuilder builder = new RouteBuilder(world, scheduleCopy, airportCopy, rnd, ROUTE_MODE.get());

        try {
            OrderPlan newPlan = buildPlanForOrder(newOrder, builder, world, rnd);
            List<OrderPlan> planCopies = deepCopyPlans(this.plans);
            planCopies.add(newPlan);
            Individual patched = new Individual(planCopies, scheduleCopy, airportCopy);
            return patched;
        } catch (IllegalStateException ex) {
            return null;
        }
    }

    public Individual tryInsertOrders(World world, List<Order> newOrders, Random rnd) {
        if (newOrders == null || newOrders.isEmpty()) {
            return copy();
        }
        FlightSchedule scheduleCopy = flightSchedule.copy();
        AirportSchedule airportCopy = airportSchedule.copy();
        RouteBuilder builder = new RouteBuilder(world, scheduleCopy, airportCopy, rnd, ROUTE_MODE.get());
        List<OrderPlan> planCopies = deepCopyPlans(this.plans);
        try {
            for (Order order : newOrders) {
                OrderPlan newPlan = buildPlanForOrder(order, builder, world, rnd);
                planCopies.add(newPlan);
            }
            Individual patched = new Individual(planCopies, scheduleCopy, airportCopy);
            return patched;
        } catch (IllegalStateException ex) {
            return null;
        }
    }

    /**
     * Reconstruye el individuo asegurando exactamente un plan por cada orden indicada.
     * Intenta adoptar planes existentes y, si falla, genera un plan heurístico simple.
     */
    public Individual rebuildWithOrders(World world, List<Order> orders, Random rnd) {
        if (orders == null || orders.isEmpty()) {
            return null;
        }
        // Defensive log to help diagnose stalls during rebuild.
        LoggerFactory.getLogger(Individual.class).debug("[GA] rebuildWithOrders start orders={}", orders.size());
        FlightSchedule scheduleCopy = world.getFlights().getSchedule().copy();
        AirportSchedule airportCopy = world.getAirportSchedule().copy();
        RouteBuilder builder = new RouteBuilder(world, scheduleCopy, airportCopy, rnd, ROUTE_MODE.get());

        List<OrderPlan> rebuiltPlans = new ArrayList<>();
        Set<String> seenOrders = new HashSet<>();
        for (Order order : orders) {
            if (order == null || order.getId() == null || !seenOrders.add(order.getId())) {
                continue;
            }
            OrderPlan preferred = findPlan(this, order.getId());
            OrderPlan adopted = tryAdoptPlan(world, order, preferred, scheduleCopy, airportCopy);
            if (adopted != null) {
                rebuiltPlans.add(adopted);
                continue;
            }
            OrderPlan rebuilt = buildPlanWithPreferences(order, preferred, builder, world, rnd);
            rebuiltPlans.add(rebuilt);
        }
        return new Individual(rebuiltPlans, scheduleCopy, airportCopy);
    }

    /**
     * Crea un individuo copiando el actual y agregando un plan placeholder sin reservas.
     */
    public Individual withPlaceholderPlan(OrderPlan placeholder) {
        if (placeholder == null || placeholder.getOrderId() == null) {
            return null;
        }
        List<OrderPlan> copies = deepCopyPlans(this.plans);
        copies.add(placeholder);
        return new Individual(copies, flightSchedule.copy(), airportSchedule.copy());
    }

    /**
     * Devuelve una copia del individuo manteniendo solo los planes cuyos IDs estén en keepOrderIds.
     * Libera las reservas de los planes descartados sobre los schedules copiados.
     */
    public Individual pruneToOrders(World world, Set<String> keepOrderIds, List<Order> orders) {
        if (keepOrderIds == null || keepOrderIds.isEmpty()) {
            return null;
        }
        FlightSchedule scheduleCopy = flightSchedule.copy();
        AirportSchedule airportCopy = airportSchedule.copy();
        List<OrderPlan> keptPlans = new ArrayList<>();
        for (OrderPlan plan : plans) {
            if (!keepOrderIds.contains(plan.getOrderId())) {
                releasePlan(world, plan, scheduleCopy, airportCopy);
                continue;
            }
            OrderPlan copy = copyPlan(plan);
            if (copy != null) {
                keptPlans.add(copy);
            }
        }
        if (keptPlans.isEmpty()) {
            return null;
        }
        Individual pruned = new Individual(keptPlans, scheduleCopy, airportCopy);
        List<Order> orderList = orders == null ? List.of() : orders.stream()
                .filter(Objects::nonNull)
                .filter(o -> keepOrderIds.contains(o.getId()))
                .toList();
        return pruned;
    }

    public void applyToWorld(World world) {
        world.getFlights().getSchedule().applyFrom(flightSchedule);
        world.getAirportSchedule().applyFrom(airportSchedule);
    }

    private static Duration determinePlanSlack(World world, Order order, OrderPlan plan) {
        if (plan.getRoutes().isEmpty()) {
            // Sin rutas: devolvemos el atraso real respecto al due (no enmascarar con -10000).
            if (order.getDueUtc() != null && order.getCreationUtc() != null) {
                return Duration.between(order.getDueUtc(), order.getCreationUtc());
            }
            // fallback: penalización fija si no hay due definido
            return Duration.ofHours(-Config.INTERCONTINENTAL_SLA_HOURS);
        }

        Duration maxSla = Duration.ZERO;
        for (Route route : plan.getRoutes()) {
            String origin = extractOrigin(route);
            Duration routeSla = slaFor(world, origin, order.getDestinationCode());
            if (routeSla.compareTo(maxSla) > 0) {
                maxSla = routeSla;
            }
        }

        Duration best = null;
        for (Route route : plan.getRoutes()) {
            RouteSegment lastSegment = getLastSegment(route);
            if (lastSegment == null) {
                continue;
            }
            Duration routeSlack = computeSlack(world, order, lastSegment, maxSla);
            route.setSlack(routeSlack);
            lastSegment.setSlack(routeSlack);
            if (best == null || routeSlack.compareTo(best) < 0) {
                best = routeSlack;
            }
        }
        return best == null ? Duration.ZERO : best;
    }

    /**
     * Evalúa el individuo con penalización SLA creciente por generación.
     * Método puro: no modifica schedules compartidos ni el world.
     */
    public void evaluate(World world, List<Order> orders, int generation) {
        Map<String, Order> orderById = new HashMap<>();
        if (orders != null) {
            for (Order o : orders) {
                if (o != null) {
                    orderById.put(o.getId(), o);
                }
            }
        }
        int orderCount = Math.max(1, orderById.size());

        long totalLateness = 0L;
        int violations = 0;
        double totalCompletionMinutes = 0d;
        int completionCount = 0;
        int internationalLegCount = 0;
        int intercontinentalLegCount = 0;
        int intercontinentalFirstLegCount = 0;
        double totalFlightMinutes = 0d;
        List<Event> events = new ArrayList<>();

        for (OrderPlan plan : plans) {
            Order order = orderById.get(plan.getOrderId());
            if (order == null) {
                continue;
            }
            SlackStats slackStats = effectiveSlack(plan);
            long slackMinutes = slackStats.slackMinutes();
            long lateness = Math.max(0, -slackMinutes);
            if (lateness > 0) {
                totalLateness += lateness;
                violations++;
            }
            internationalLegCount += slackStats.internationalLegs();
            intercontinentalLegCount += slackStats.intercontinentalLegs();
            // Acumular duración total recorrida como proxy de distancia
            boolean countedFirstLeg = false;
            for (Route route : plan.getRoutes()) {
                for (RouteSegment segment : route.getSegments()) {
                    Flight flight = segment.getFlight();
                    if (flight != null && flight.getFlightDuration() != null) {
                        totalFlightMinutes += flight.getFlightDuration().toMinutes();
                    }
                    if (!countedFirstLeg && flight != null) {
                        Airport origin = flight.getOrigin();
                        Airport dest = flight.getDestination();
                        if (origin != null && dest != null) {
                            String originCont = origin.getContinent();
                            String destCont = dest.getContinent();
                            if (originCont != null && destCont != null && !originCont.equalsIgnoreCase(destCont)) {
                                intercontinentalFirstLegCount++;
                            }
                        }
                        countedFirstLeg = true;
                    }
                }
            }

            Instant completion = computeOrderCompletion(order, plan);
            if (completion != null) {
                long completionMinutes = Duration.between(order.getCreationUtc(), completion).toMinutes();
                totalCompletionMinutes += completionMinutes;
                completionCount++;
                events.add(new Event(order.getCreationUtc(), 1));
                events.add(new Event(completion, -1));
            }
        }

        this.slaViolations = violations;
        double maxSlaMinutes = Config.INTERCONTINENTAL_SLA_HOURS * 60d;
        double avgLateness = totalLateness / (double) orderCount;
        double latenessNorm = clamp(avgLateness / maxSlaMinutes);

        double avgCompletion = completionCount == 0 ? 0d : totalCompletionMinutes / completionCount;
        double completionNorm = clamp(avgCompletion / maxSlaMinutes);

        double avgFlightMinutes = totalFlightMinutes / orderCount;
        double distanceNorm = clamp(avgFlightMinutes / 180d); // referencia: 3h de vuelo medio

        int maxConcurrent = computeMaxConcurrent(events);
        double backlogNorm = clamp(maxConcurrent / (double) Config.BACKLOG_OK);

        double intlNorm = clamp((internationalLegCount / (double) orderCount) / 3d);
        double intercontNorm = clamp((intercontinentalLegCount / (double) orderCount) / 3d);
        double firstLegNorm = clamp(intercontinentalFirstLegCount / (double) orderCount);

        double onTimeRatio = orderCount == 0 ? 0d : (orderCount - violations) / (double) orderCount;

        double worstSlackMin = plans.stream()
                .map(OrderPlan::getSlack)
                .mapToDouble(d -> d == null ? 0d : d.toMinutes())
                .min()
                .orElse(0d);

        double T = 90.0;
        double slaDanger = 1.0 / (1.0 + Math.exp(worstSlackMin / T));
        double secondaryFactor = 1.0 - slaDanger;
        double intercontFactor = secondaryFactor * secondaryFactor;

        double score = 0d;
        score -= Config.W_SLA * latenessNorm;
        score -= Config.W_TIME * completionNorm * secondaryFactor;
        score -= Config.W_DISTANCE * distanceNorm * secondaryFactor;
        score -= Config.W_BACKLOG * backlogNorm * secondaryFactor;
        score -= Config.W_INTL * intlNorm * secondaryFactor;
        score -= Config.W_INTERCONT * intercontNorm * intercontFactor;
        score -= Config.W_INTERCONT_FIRST_LEG * firstLegNorm * intercontFactor;
        score += Config.W_ON_TIME * onTimeRatio;

        this.fitness = score;
    }

    private SlackStats effectiveSlack(OrderPlan plan) {
        long slackMinutes = plan.getSlack() == null ? 0L : plan.getSlack().toMinutes();
        int internationalLegs = 0;
        int intercontinentalLegs = 0;
        boolean hasIntercontinental = false;

        for (Route route : plan.getRoutes()) {
            for (RouteSegment segment : route.getSegments()) {
                Flight flight = segment.getFlight();
                if (flight == null) {
                    continue;
                }
                Airport origin = flight.getOrigin();
                Airport dest = flight.getDestination();
                if (origin == null || dest == null) {
                    continue;
                }
                String originCont = origin.getContinent();
                String destCont = dest.getContinent();
                if (originCont != null && destCont != null && !originCont.equalsIgnoreCase(destCont)) {
                    intercontinentalLegs++;
                    hasIntercontinental = true;
                } else if (originCont != null && destCont != null && !origin.code.equalsIgnoreCase(dest.code)) {
                    // Mismo continente, distinto país (no tenemos país explícito; usamos códigos distintos)
                    internationalLegs++;
                }
            }
        }
        if (hasIntercontinental) {
            slackMinutes += Duration.ofHours(24).toMinutes();
        }
        return new SlackStats(slackMinutes, internationalLegs, intercontinentalLegs);
    }

    private int computeMaxConcurrent(List<Event> events) {
        if (events.isEmpty()) {
            return 0;
        }
        events.sort((a, b) -> {
            int cmp = a.instant().compareTo(b.instant());
            if (cmp != 0) return cmp;
            return Integer.compare(b.delta(), a.delta());
        });
        int running = 0;
        int max = 0;
        for (Event e : events) {
            running += e.delta();
            if (running > max) {
                max = running;
            }
        }
        return max;
    }

    Individual deepCopy() {
        List<OrderPlan> copyPlans = new ArrayList<>(plans);
        // schedules are already individual-specific; we don't reuse them when cloning for operators
        return new Individual(copyPlans, flightSchedule, airportSchedule);
    }

    public double getFitness() {
        return fitness;
    }

    public List<OrderPlan> getPlans() {
        return plans;
    }

    public FlightSchedule getFlightSchedule() {
        return flightSchedule;
    }

    public int getSlaViolations() {
        return slaViolations;
    }

    public boolean isSlaCompliant() {
        return slaViolations == 0;
    }

    public AirportSchedule getAirportSchedule() {
        return airportSchedule;
    }

    public Map<String, Instant> computeCompletionTimes(World world, List<Order> orders) {
        if (orders == null) {
            return Map.of();
        }
        Map<String, Order> orderMap = new HashMap<>();
        for (Order order : orders) {
            orderMap.put(order.getId(), order);
        }

        Map<String, Instant> completion = new HashMap<>();
        for (OrderPlan plan : plans) {
            Order order = orderMap.get(plan.getOrderId());
            if (order == null) {
                continue;
            }
            Instant done = computeOrderCompletion(order, plan);
            completion.put(order.getId(), done);
        }
        return completion;
    }

    public void prettyPrint() {
        for (OrderPlan plan : plans) {
            System.out.println("  Order " + plan.getOrderId() + " qty=" + plan.plannedQuantity()
                    + " slack=" + plan.getSlack());
            int idx = 1;
            for (Route route : plan.getRoutes()) {
                System.out.println("    Route " + (idx++) + " qty=" + route.getQuantity());
                for (RouteSegment segment : route.getSegments()) {
                    System.out.println(String.format(
                            "      %s -> %s dep %s arr %s qty %d",
                            segment.getFlight().getOriginCode(),
                            segment.getFlight().getDestinationCode(),
                            segment.getExactDepDateTime(),
                            segment.getExactArrDateTime(),
                            segment.getRouteQuantity()));
                }
            }
        }
    }

    private static List<Route> gatherParentRoutes(Individual parentA, Individual parentB, String orderId, Random rnd) {
        List<Route> combined = new ArrayList<>();
        OrderPlan planA = findPlan(parentA, orderId);
        OrderPlan planB = findPlan(parentB, orderId);
        if (planA != null) combined.addAll(planA.getRoutes());
        if (planB != null) combined.addAll(planB.getRoutes());
        Collections.shuffle(combined, rnd);
        return combined;
    }

    private static OrderPlan findPlan(Individual individual, String orderId) {
        for (OrderPlan plan : individual.getPlans()) {
            if (plan.getOrderId().equals(orderId)) {
                return plan;
            }
        }
        return null;
    }

    private static String extractOrigin(Route route) {
        if (route.getSegments().isEmpty()) {
            return null;
        }
        return route.getSegments().get(0).getFlight().getOriginCode();
    }

    private static RouteSegment getLastSegment(Route route) {
        List<RouteSegment> segments = route.getSegments();
        if (segments.isEmpty()) {
            return null;
        }
        return segments.get(segments.size() - 1);
    }

    private static Duration computeSlack(World world, Order order, RouteSegment lastSegment, Duration sla) {
        Instant arrivalInstant = lastSegment.getFlight().getArrivalInstant(lastSegment.getDate());
        Instant completionInstant = arrivalInstant.plus(Config.WAREHOUSE_DWELL);
        Instant dueInstant = order.getCreationUtc().plus(sla);
        return Duration.between(completionInstant, dueInstant);
    }

    private static Instant computeOrderCompletion(Order order, OrderPlan plan) {
        Instant completion = null;
        for (Route route : plan.getRoutes()) {
            RouteSegment lastSegment = getLastSegment(route);
            if (lastSegment == null) continue;
            Instant arrival = lastSegment.getFlight().getArrivalInstant(lastSegment.getDate());
            Instant finalInstant = arrival.plus(Config.WAREHOUSE_DWELL);
            if (completion == null || finalInstant.isAfter(completion)) {
                completion = finalInstant;
            }
        }
        return completion == null ? order.getCreationUtc() : completion;
    }

    private static Duration slaFor(World world, String originCode, String destinationCode) {
        if (destinationCode == null) {
            return Duration.ZERO;
        }
        com.morapack.skyroute.io.Airports airports = world.getAirports();
        com.morapack.skyroute.models.Airport destination = airports.get(destinationCode);
        com.morapack.skyroute.models.Airport origin = originCode == null || originCode.isBlank() ? null : airports.get(originCode);

        if (destination == null) {
            return Duration.ofHours(Config.INTERCONTINENTAL_SLA_HOURS);
        }

        if (origin == null) {
            return Duration.ofHours(Config.INTERCONTINENTAL_SLA_HOURS);
        }

        String originContinent = origin.getContinent();
        String destinationContinent = destination.getContinent();
        if (originContinent != null && originContinent.equalsIgnoreCase(destinationContinent)) {
            return Duration.ofHours(Config.CONTINENTAL_SLA_HOURS);
        }
        return Duration.ofHours(Config.INTERCONTINENTAL_SLA_HOURS);
    }

    private static OrderPlan buildPlanForOrder(Order order,
                                               RouteBuilder builder,
                                               World world,
                                               Random rnd) {
        OrderPlan plan = new OrderPlan(order.getId());
        int remaining = order.getQuantity();
        List<String> hubs = hubsByProximity(world, builder.productionHubs(), order.getDestinationCode());
        int attempts = 0;
        int baseAttempts = Math.max(10, hubs.size() * 3);
        int maxAttempts = (int) Math.ceil(baseAttempts * ATTEMPT_FACTOR.get());
        while (remaining > 0 && attempts < maxAttempts) {
            boolean built = false;
            for (String origin : hubs) {
                Route route = builder.buildRoute(order, origin, remaining);
                if (route != null && route.getQuantity() > 0 && isUniqueRoute(route, plan)) {
                    plan.addRoute(route);
                    remaining -= route.getQuantity();
                    built = true;
                    break;
                } else if (route != null) {
                    builder.releaseRoute(route); // solo rutas reservadas
                }
            }
            // Si no se pudo reservar en schedule, salimos y el slack penalizará
            attempts++;
        }
        if (remaining > 0) {
            // Si no se pudo cubrir todo, mantenemos las rutas parciales; slack reflejará atraso
            remaining = 0;
        }
        plan.setSlack(determinePlanSlack(world, order, plan));
        return plan;
    }

    private static boolean isUniqueRoute(Route route, OrderPlan plan) {
        if (route == null) return false;
        Set<String> used = new HashSet<>();
        if (plan != null && plan.getRoutes() != null) {
            for (Route r : plan.getRoutes()) {
                if (r.getSegments() == null) continue;
                for (RouteSegment seg : r.getSegments()) {
                    used.add(key(seg.getFlight(), seg.getDate()));
                }
            }
        }
        if (route.getSegments() != null) {
            Set<String> seen = new HashSet<>();
            for (RouteSegment seg : route.getSegments()) {
                String k = key(seg.getFlight(), seg.getDate());
                if (!seen.add(k) || used.contains(k)) {
                    return false;
                }
            }
        }
        return true;
    }

    private static String key(Flight flight, LocalDate date) {
        return (flight == null ? "?" : flight.getId()) + "|" + (date == null ? "?" : date.toString());
    }

    private static OrderPlan buildPlanWithPreferences(Order order,
                                                      OrderPlan preferred,
                                                      RouteBuilder builder,
                                                      World world,
                                                      Random rnd) {
        List<String> preferredHubs = new ArrayList<>();
        if (preferred != null) {
            for (Route route : preferred.getRoutes()) {
                String origin = extractOrigin(route);
                if (origin != null && !origin.isBlank()) {
                    preferredHubs.add(origin);
                }
            }
        }
        if (preferredHubs.isEmpty()) {
            preferredHubs.addAll(builder.productionHubs());
        }
        preferredHubs = hubsByProximity(world, preferredHubs, order.getDestinationCode());

        OrderPlan plan = new OrderPlan(order.getId());
        int remaining = order.getQuantity();
        int attempts = 0;
        int baseAttempts = Math.max(10, preferredHubs.size() * 3);
        int maxAttempts = (int) Math.ceil(baseAttempts * ATTEMPT_FACTOR.get());
        while (remaining > 0 && attempts < maxAttempts) {
            boolean built = false;
            for (String origin : preferredHubs) {
                Route route = builder.buildRoute(order, origin, remaining);
                if (route != null && route.getQuantity() > 0 && isUniqueRoute(route, plan)) {
                    plan.addRoute(route);
                    remaining -= route.getQuantity();
                    built = true;
                    break;
                } else if (route != null) {
                    builder.releaseRoute(route);
                }
            }
            // Si no se pudo reservar en schedule, dejamos remanente para que slack penalice
            attempts++;
        }
        if (remaining > 0) {
            remaining = 0;
        }
        plan.setSlack(determinePlanSlack(world, order, plan));
        return plan;
    }

    private static List<String> hubsByProximity(World world, List<String> hubs, String destination) {
        Airports airports = world.getAirports();
        Airport dest = airports.get(destination);
        if (dest == null || hubs == null || hubs.isEmpty()) {
            return hubs == null ? List.of() : new ArrayList<>(hubs);
        }
        return hubs.stream()
                .distinct()
                .sorted((a, b) -> {
                    Airport aa = airports.get(a);
                    Airport bb = airports.get(b);
                    if (aa == null && bb == null) return 0;
                    if (aa == null) return 1;
                    if (bb == null) return -1;
                    double da = haversineKm(aa.getLatitude(), aa.getLongitude(), dest.getLatitude(), dest.getLongitude());
                    double db = haversineKm(bb.getLatitude(), bb.getLongitude(), dest.getLatitude(), dest.getLongitude());
                    return Double.compare(da, db);
                })
                .toList();
    }

    private static double haversineKm(double lat1, double lon1, double lat2, double lon2) {
        double R = 6371.0;
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) *
                        Math.sin(dLon / 2) * Math.sin(dLon / 2);
        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    private static Set<String> selectOrderIds(List<Order> orders, int count, Random rnd) {
        List<String> ids = new ArrayList<>();
        for (Order order : orders) {
            ids.add(order.getId());
        }
        Collections.shuffle(ids, rnd);
        if (count >= ids.size()) {
            return new HashSet<>(ids);
        }
        return new HashSet<>(ids.subList(0, count));
    }

    private static Order findOrder(List<Order> orders, String id) {
        for (Order order : orders) {
            if (order.getId().equals(id)) return order;
        }
        return null;
    }

    private static OrderPlan tryAdoptPlan(World world,
                                          Order order,
                                          OrderPlan source,
                                          FlightSchedule flightSchedule,
                                          AirportSchedule airportSchedule) {
        if (source == null || source.getRoutes().isEmpty()) {
            return null;
        }
        Airports airports = world.getAirports();
        Instant now = world.getCurrentInstant();
        List<Route> adoptedRoutes = new ArrayList<>();
        List<Runnable> rollbacks = new ArrayList<>();
        try {
            for (Route route : source.getRoutes()) {
                Route clonedRoute = new Route(route.getQuantity());
                List<RouteSegment> segmentCopies = new ArrayList<>();
                for (RouteSegment segment : route.getSegments()) {
                    Flight flight = segment.getFlight();
                    LocalDate date = segment.getDate();
                    int qty = segment.getRouteQuantity();
                    if (flight == null || date == null || qty <= 0) {
                        throw new IllegalStateException("Invalid segment to adopt");
                    }
                    Instant departureInstant = flight.getDepartureInstant(date);
                    // Nunca modificamos rutas con salida ya ocurrida.
                    if (!departureInstant.isAfter(now)) {
                        throw new IllegalStateException("Segment already departed");
                    }
                    if (!flightSchedule.tryReserve(flight, date, qty)) {
                        throw new IllegalStateException("Unable to reserve flight " + flight.getId());
                    }
                    rollbacks.add(() -> {
                        try {
                            flightSchedule.release(flight, date, qty);
                        } catch (Exception ignored) {}
                    });

                    Airport destinationAirport = airports.get(flight.getDestinationCode());
                    if (destinationAirport == null) {
                        throw new IllegalStateException("Unknown airport " + flight.getDestinationCode());
                    }
                    LocalDateTime arrivalLocal = LocalDateTime.ofInstant(flight.getArrivalInstant(date), destinationAirport.getZoneOffset());
                    LocalDateTime departureLocal = arrivalLocal.plus(segment.isFinalLeg() ? Config.WAREHOUSE_DWELL : Config.TRANSFER_BUFFER);
                    if (!airportSchedule.tryReserveTransit(destinationAirport.code, arrivalLocal, departureLocal, qty)) {
                        throw new IllegalStateException("Unable to reserve airport transit for " + destinationAirport.code);
                    }
                    rollbacks.add(() -> {
                        try {
                            airportSchedule.releaseTransit(destinationAirport.code, arrivalLocal, departureLocal, qty);
                        } catch (Exception ignored) {}
                    });

                    RouteSegment segCopy = new RouteSegment();
                    segCopy.setFlight(flight);
                    segCopy.setDate(date);
                    segCopy.setRouteQuantity(qty);
                    segCopy.setFinalLeg(segment.isFinalLeg());
                    segCopy.setSlack(segment.getSlack());
                    segCopy.setDeparted(segment.isDeparted());
                    segCopy.setArrived(segment.isArrived());
                    segCopy.setReceivedByNext(segment.isReceivedByNext());
                    segmentCopies.add(segCopy);
                }
                clonedRoute.setSegments(segmentCopies);
                clonedRoute.setSlack(route.getSlack());
                adoptedRoutes.add(clonedRoute);
            }

            OrderPlan adopted = new OrderPlan(order.getId());
            adopted.setRoutes(adoptedRoutes);
            adopted.setSlack(determinePlanSlack(world, order, adopted));
            return adopted;
        } catch (Exception ex) {
            Collections.reverse(rollbacks);
            for (Runnable r : rollbacks) {
                r.run();
            }
            return null;
        }
    }

    private static void releasePlan(World world,
                                    OrderPlan plan,
                                    FlightSchedule flightSchedule,
                                    AirportSchedule airportSchedule) {
        if (plan == null) return;
        Airports airports = world.getAirports();
        for (Route route : plan.getRoutes()) {
            for (RouteSegment segment : route.getSegments()) {
                Flight flight = segment.getFlight();
                LocalDate date = segment.getDate();
                int qty = segment.getRouteQuantity();
                if (flight == null || date == null || qty <= 0) {
                    continue;
                }
                try {
                    flightSchedule.release(flight, date, qty);
                } catch (IllegalArgumentException ignored) {
                    // Si no se puede liberar, continuamos para evitar romper el flujo
                }
                Airport destinationAirport = airports.get(flight.getDestinationCode());
                if (destinationAirport != null) {
                    LocalDateTime arrivalLocal = LocalDateTime.ofInstant(flight.getArrivalInstant(date), destinationAirport.getZoneOffset());
                    LocalDateTime departureLocal = arrivalLocal.plus(segment.isFinalLeg() ? Config.WAREHOUSE_DWELL : Config.TRANSFER_BUFFER);
                    try {
                        airportSchedule.releaseTransit(destinationAirport.code, arrivalLocal, departureLocal, qty);
                    } catch (IllegalArgumentException ignored) {
                        // ya liberado o no reservado
                    }
                }
            }
        }
    }

    private static OrderPlan copyPlan(OrderPlan original) {
        if (original == null) return null;
        OrderPlan copy = new OrderPlan(original.getOrderId());
        copy.setSlack(original.getSlack());
        List<Route> routeCopies = new ArrayList<>();
        for (Route route : original.getRoutes()) {
            Route routeCopy = new Route(route.getQuantity());
            routeCopy.setSlack(route.getSlack());
            List<RouteSegment> segmentCopies = new ArrayList<>();
            for (RouteSegment segment : route.getSegments()) {
                RouteSegment segCopy = new RouteSegment();
                segCopy.setFlight(segment.getFlight());
                segCopy.setDate(segment.getDate());
                segCopy.setRouteQuantity(segment.getRouteQuantity());
                segCopy.setFinalLeg(segment.isFinalLeg());
                segCopy.setSlack(segment.getSlack());
                segCopy.setDeparted(segment.isDeparted());
                segCopy.setArrived(segment.isArrived());
                segCopy.setReceivedByNext(segment.isReceivedByNext());
                segmentCopies.add(segCopy);
            }
            routeCopy.setSegments(segmentCopies);
            routeCopies.add(routeCopy);
        }
        copy.setRoutes(routeCopies);
        return copy;
    }

    private static List<OrderPlan> deepCopyPlans(List<OrderPlan> originals) {
        List<OrderPlan> copies = new ArrayList<>(originals.size());
        for (OrderPlan plan : originals) {
            OrderPlan copy = new OrderPlan(plan.getOrderId());
            copy.setSlack(plan.getSlack());
            List<Route> routeCopies = new ArrayList<>();
            for (Route route : plan.getRoutes()) {
                Route routeCopy = new Route(route.getQuantity());
                routeCopy.setSlack(route.getSlack());
                List<RouteSegment> segmentCopies = new ArrayList<>();
                for (RouteSegment segment : route.getSegments()) {
                    RouteSegment segCopy = new RouteSegment();
                    segCopy.setFlight(segment.getFlight());
                    segCopy.setDate(segment.getDate());
                    segCopy.setRouteQuantity(segment.getRouteQuantity());
                    segCopy.setFinalLeg(segment.isFinalLeg());
                    segCopy.setSlack(segment.getSlack());
                    segCopy.setDeparted(segment.isDeparted());
                    segCopy.setArrived(segment.isArrived());
                    segCopy.setReceivedByNext(segment.isReceivedByNext());
                    segmentCopies.add(segCopy);
                }
                routeCopy.setSegments(segmentCopies);
                routeCopies.add(routeCopy);
            }
            copy.setRoutes(routeCopies);
            copies.add(copy);
        }
        return copies;
    }

    private double clamp(double value) {
        if (value < 0d) return 0d;
        if (value > 1d) return 1d;
        return value;
    }

    private record Event(Instant instant, int delta) {}
    private record SlackStats(long slackMinutes, int internationalLegs, int intercontinentalLegs) {}

    /** Ajusta el factor de intentos para construcción de planes (op diaria). */
    public static void setAttemptFactor(double factor) {
        ATTEMPT_FACTOR.set(factor <= 0 ? 1d : factor);
    }

    /** Restaura el factor de intentos al valor por defecto (1). */
    public static void resetAttemptFactor() {
        ATTEMPT_FACTOR.remove();
    }

    /** Ajusta el modo de selección de rutas para los builders. */
    public static void setRouteSelectionMode(RouteBuilder.SelectionMode mode) {
        ROUTE_MODE.set(mode == null ? RouteBuilder.SelectionMode.RANDOM_APPROACH : mode);
    }

    /** Restaura el modo de selección al valor por defecto (RANDOM). */
    public static void resetRouteSelectionMode() {
        ROUTE_MODE.remove();
    }
}
