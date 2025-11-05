package com.morapack.skyroute.simulation.service;

import com.morapack.skyroute.algorithm.GeneticAlgorithm;
import com.morapack.skyroute.algorithm.Individual;
import com.morapack.skyroute.base.repository.AirportRepository;
import com.morapack.skyroute.config.Config;
import com.morapack.skyroute.config.World;
import com.morapack.skyroute.models.Airport;
import com.morapack.skyroute.models.Order;
import com.morapack.skyroute.models.Route;
import com.morapack.skyroute.models.RouteSegment;
import com.morapack.skyroute.orders.dto.OrderRequest;
import com.morapack.skyroute.plan.service.WorldBuilder;
import com.morapack.skyroute.simulation.dto.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;

@Slf4j
@Service
public class SimulationService {

    private static final String TOPIC_PREFIX = "/topic/simulations/";
    private final WorldBuilder worldBuilder;
    private final AirportRepository airportRepository;
    private final SimpMessagingTemplate messagingTemplate;
    private final ExecutorService executorService = Executors.newCachedThreadPool();
    private final Map<UUID, SimulationSession> sessions = new ConcurrentHashMap<>();

    public SimulationService(WorldBuilder worldBuilder,
                             AirportRepository airportRepository,
                             SimpMessagingTemplate messagingTemplate) {
        this.worldBuilder = worldBuilder;
        this.airportRepository = airportRepository;
        this.messagingTemplate = messagingTemplate;
    }

    public SimulationStartResponse startSimulation(SimulationStartRequest request) {
        if (request == null || request.orders() == null || request.orders().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "orders list is required");
        }

        List<OrderRequest> sortedOrders = request.orders().stream()
                .sorted(Comparator.comparing(OrderRequest::creationLocal))
                .toList();

        UUID simulationId = UUID.randomUUID();
        SimulationSession session = new SimulationSession(simulationId, sortedOrders.size());
        sessions.put(simulationId, session);

        executorService.submit(() -> runSimulation(session, sortedOrders));

        return new SimulationStartResponse(simulationId.toString());
    }

    public SimulationStatus getStatus(UUID simulationId) {
        SimulationSession session = sessions.get(simulationId);
        if (session == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Simulation not found");
    }
        return session.toStatus();
    }

    public void cancel(UUID simulationId) {
        SimulationSession session = sessions.get(simulationId);
        if (session == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Simulation not found");
        }
        session.cancel();
    }

    private void runSimulation(SimulationSession session, List<OrderRequest> orders) {
        List<Order> demand = new ArrayList<>();
        try {
            log.info("[SIM:{}] Starting simulation with {} orders", session.id, orders.size());
            for (int index = 0; index < orders.size(); index++) {
                if (session.cancelled.get()) {
                    log.warn("[SIM:{}] Simulation cancelled by user after processing {} orders", session.id, demand.size());
                    break;
                }

                OrderRequest request = orders.get(index);
                log.debug("[SIM:{}] Processing order {} of {}: {}", session.id, index + 1, orders.size(), request.id());
                Order order = toDomainOrder(request);
                demand.add(order);

                World world = worldBuilder.buildBaseWorld();
                GeneticAlgorithm ga = new GeneticAlgorithm(world, List.copyOf(demand));
                
                log.info("[SIM:{}] === Order {} of {} ===", session.id, index + 1, orders.size());
                long start = System.nanoTime();
                Individual best = ga.run(Config.POP_SIZE, Config.MAX_GEN);
                long duration = System.nanoTime() - start;
                log.info("[SIM:{}] GA done for {} (took {} ms)", session.id, request.id(), duration / 1_000_000);

                log.debug("[SIM:{}] GA completed for order {} (fitness={}, time={} ms)",
                        session.id,
                        request.id(),
                        best.getFitness(),
                        duration / 1_000_000);

                SimulationSnapshot snapshot = toSnapshot(session.id, demand.size(), orders.size(), best);
                session.update(snapshot);
                log.trace("[SIM:{}] Snapshot created: processed={}/{}", session.id, demand.size(), orders.size());
                messagingTemplate.convertAndSend(topic(session.id), SimulationMessage.progress(session.id.toString(), snapshot));
            }

            session.complete();
            SimulationSnapshot finalSnapshot = session.lastSnapshot;
            log.info("[SIM:{}] Simulation completed. Processed {}/{} orders", session.id, session.processed.get(), session.totalOrders);
            messagingTemplate.convertAndSend(
                    topic(session.id),
                    SimulationMessage.completed(session.id.toString(), finalSnapshot)
            );
        } catch (Exception ex) {
            session.error(ex.getMessage());
            log.error("[SIM:{}] Simulation failed: {}", session.id, ex.getMessage(), ex);
            messagingTemplate.convertAndSend(topic(session.id), SimulationMessage.error(session.id.toString(), ex.getMessage()));
        }
    }

    private Order toDomainOrder(OrderRequest request) {
        Airport destination = airportRepository.findById(request.destinationAirportCode())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Destination airport not found: " + request.destinationAirportCode()));

        Instant creationUtc = toUtc(request.creationLocal(), destination);
        Instant dueUtc = creationUtc.plus(Config.INTERCONTINENTAL_SLA_HOURS, ChronoUnit.HOURS);

        return new Order(
                request.id(),
                request.customerReference(),
                destination,
                request.quantity(),
                creationUtc,
                dueUtc
        );
    }

    private Instant toUtc(LocalDateTime creationLocal, Airport destination) {
        ZoneOffset offset = destination.getZoneOffset();
        return creationLocal.atOffset(offset).toInstant();
    }

    private SimulationSnapshot toSnapshot(UUID simulationId,
                                          int processed,
                                          int total,
                                          Individual best) {

        List<SimulationOrderPlan> orderPlans = best.getPlans().stream()
                .map(this::toOrderPlanDto)
                .collect(Collectors.toList());

        return new SimulationSnapshot(
                simulationId.toString(),
                processed,
                total,
                best.getFitness(),
                Instant.now(),
                orderPlans
        );
    }

    private SimulationOrderPlan toOrderPlanDto(com.morapack.skyroute.models.OrderPlan plan) {
        long slackMinutes = optionalDurationMinutes(plan.getSlack());
        List<SimulationRoute> routes = plan.getRoutes() == null
                ? List.of()
                : plan.getRoutes().stream().map(this::toRouteDto).toList();
        return new SimulationOrderPlan(plan.getOrderId(), slackMinutes, routes);
    }

    private SimulationRoute toRouteDto(Route route) {
        long slackMinutes = optionalDurationMinutes(route.getSlack());
        List<SimulationSegment> segments = route.getSegments() == null
                ? List.of()
                : route.getSegments().stream().map(this::toSegmentDto).toList();
        return new SimulationRoute(route.getQuantity(), slackMinutes, segments);
    }

    private SimulationSegment toSegmentDto(RouteSegment segment) {
        var flight = segment.getFlight();
        LocalDate date = segment.getDate();
        Instant departureUtc = flight.getDepartureInstant(date);
        Instant arrivalUtc = flight.getArrivalInstant(date);

        return new SimulationSegment(
                flight.getId(),
                flight.getOriginCode(),
                flight.getDestinationCode(),
                date,
                segment.getRouteQuantity(),
                departureUtc,
                arrivalUtc
        );
    }

    private long optionalDurationMinutes(Duration duration) {
        return duration == null ? 0 : duration.toMinutes();
    }

    private String topic(UUID simulationId) {
        return TOPIC_PREFIX + simulationId;
    }

    private static class SimulationSession {
        private final UUID id;
        private final int totalOrders;
        private final AtomicInteger processed = new AtomicInteger();
        private final AtomicBoolean completed = new AtomicBoolean(false);
        private final AtomicBoolean cancelled = new AtomicBoolean(false);
        private volatile SimulationSnapshot lastSnapshot;
        private volatile String error;

        private SimulationSession(UUID id, int totalOrders) {
            this.id = id;
            this.totalOrders = totalOrders;
        }

        private void update(SimulationSnapshot snapshot) {
            this.lastSnapshot = snapshot;
            this.processed.set(snapshot.processedOrders());
        }

        private void complete() {
            this.completed.set(true);
        }

        private void cancel() {
            this.cancelled.set(true);
        }

        private void error(String message) {
            this.error = message;
        }

        private SimulationStatus toStatus() {
            return new SimulationStatus(
                    id.toString(),
                    processed.get(),
                    totalOrders,
                    completed.get(),
                    cancelled.get(),
                    error,
                    lastSnapshot
            );
        }
    }
}
