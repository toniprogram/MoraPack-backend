package com.morapack.skyroute.simulation.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.morapack.skyroute.algorithm.GeneticAlgorithm;
import com.morapack.skyroute.algorithm.Individual;
import com.morapack.skyroute.config.Config;
import com.morapack.skyroute.config.World;
import com.morapack.skyroute.models.Order;
import com.morapack.skyroute.models.OrderScope;
import com.morapack.skyroute.models.Route;
import com.morapack.skyroute.models.RouteSegment;
import com.morapack.skyroute.plan.service.WorldBuilder;
import com.morapack.skyroute.orders.repository.OrderRepository;
import com.morapack.skyroute.simulation.dto.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.UUID;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;

@Slf4j
@Service
public class SimulationService {

    private static final String TOPIC_PREFIX = "/topic/simulations/";
    private final Random random = new Random();
    private final WorldBuilder worldBuilder;
    private final OrderRepository orderRepository;
    private final SimpMessagingTemplate messagingTemplate;
    private final ObjectMapper objectMapper;
    private final Path snapshotsDir = Paths.get("snapshots");
    private final ExecutorService executorService = Executors.newCachedThreadPool();
    private final Map<UUID, SimulationSession> sessions = new ConcurrentHashMap<>();

    public SimulationService(WorldBuilder worldBuilder,
                             OrderRepository orderRepository,
                             SimpMessagingTemplate messagingTemplate,
                             ObjectMapper objectMapper) {
        this.worldBuilder = worldBuilder;
        this.orderRepository = orderRepository;
        this.messagingTemplate = messagingTemplate;
        this.objectMapper = objectMapper;
    }

    public SimulationStartResponse startSimulation(SimulationStartRequest request) {
        TimeRange range = resolveRange(request);
        long fetchStart = System.nanoTime();
        List<Order> projectedOrders = orderRepository
                .findAllByScopeAndCreationUtcBetweenOrderByCreationUtcAsc(
                        OrderScope.PROJECTED,
                        range.start(),
                        range.end()
                );
        log.info("[SIM] Loaded {} projected orders in {} ms (range {} - {})",
                projectedOrders.size(),
                nanosToMillis(System.nanoTime() - fetchStart),
                range.start(),
                range.end());
        if (projectedOrders.isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "No projected orders found for the selected range"
            );
        }

        UUID simulationId = UUID.randomUUID();
        SimulationSession session = new SimulationSession(simulationId, projectedOrders.size());
        sessions.put(simulationId, session);

        long worldBuildStart = System.nanoTime();
        World simulationWorld = worldBuilder.buildBaseWorld();
        log.info("[SIM] Base world built in {} ms", nanosToMillis(System.nanoTime() - worldBuildStart));
        try {
            Files.createDirectories(snapshotsDir);
            Path sessionFile = snapshotsDir.resolve(simulationId + ".jsonl");
            Files.deleteIfExists(sessionFile);
            session.snapshotFile = sessionFile;
        } catch (IOException ex) {
            log.warn("[SIM:{}] Unable to prepare snapshot file: {}", simulationId, ex.getMessage());
        }

        executorService.submit(() -> runSimulation(session, projectedOrders, simulationWorld));

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

    private void runSimulation(SimulationSession session, List<Order> orders, World world) {
        List<Order> demand = new ArrayList<>();
        Individual previousBest = null;
        try {
            log.info("[SIM:{}] Starting simulation with {} orders", session.id, orders.size());
            for (int index = 0; index < orders.size(); index++) {
                if (session.cancelled.get()) {
                    log.warn("[SIM:{}] Simulation cancelled by user after processing {} orders", session.id, demand.size());
                    break;
                }

                long iterationStart = System.nanoTime();
                Order order = orders.get(index);
                log.debug("[SIM:{}] Processing order {} of {}: {}", session.id, index + 1, orders.size(), order.getId());
                demand.add(order);

                world.advanceTo(order.getCreationUtc());
                Individual best = null;
                if (previousBest != null) {
                    best = previousBest.tryInsertOrder(world, order, random);
                    if (best != null) {
                        best.applyToWorld(world);
                        log.debug("[SIM:{}] Order {} patched via heuristic", session.id, order.getId());
                    }
                }

                long gaDuration = 0;
                if (best == null) {
                    GeneticAlgorithm ga = new GeneticAlgorithm(world, List.copyOf(demand));
                    long start = System.nanoTime();
                    best = ga.run(Config.POP_SIZE, Config.MAX_GEN, previousBest);
                    gaDuration = System.nanoTime() - start;
                }

                if (gaDuration > 0) {
                    log.info("[SIM:{}] GA done for {} (took {} ms)", session.id, order.getId(), gaDuration / 1_000_000);
                }

                log.info("[SIM:{}] Metrics: gaRun={} ms, iterationTotal={} ms",
                        session.id,
                        nanosToMillis(gaDuration),
                        nanosToMillis(System.nanoTime() - iterationStart));

                previousBest = best;

                log.debug("[SIM:{}] Plan ready for order {} (fitness={}, gaTime={} ms)",
                        session.id,
                        order.getId(),
                        best.getFitness(),
                        gaDuration / 1_000_000);

                SimulationSnapshot snapshot = toSnapshot(session.id, demand.size(), orders.size(), best);
                session.update(snapshot);
                persistSnapshot(session, snapshot);
                log.trace("[SIM:{}] Snapshot created: processed={}/{}", session.id, demand.size(), orders.size());
                messagingTemplate.convertAndSend(topic(session.id), SimulationMessage.progress(session.id.toString(), snapshot));
            }

            session.complete();
            SimulationSnapshot finalSnapshot = session.lastSnapshot;
            log.info("[SIM:{}] Simulation completed. Processed {}/{} orders", session.id, session.processed.get(), session.totalOrders);
            persistSnapshot(session, finalSnapshot);
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

    private TimeRange resolveRange(SimulationStartRequest request) {
        Order firstProjected = orderRepository.findFirstByScopeOrderByCreationUtcAsc(OrderScope.PROJECTED)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "No projected orders available. Load projections before running the simulation."
                ));
        Order lastProjected = orderRepository.findFirstByScopeOrderByCreationUtcDesc(OrderScope.PROJECTED)
                .orElse(firstProjected);

        Instant start = request != null && request.startDate() != null
                ? toUtc(request.startDate())
                : firstProjected.getCreationUtc();
        Instant end = request != null && request.endDate() != null
                ? toUtc(request.endDate())
                : lastProjected.getCreationUtc();

        if (end.isBefore(start)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "endDate must be greater than startDate");
        }

        return new TimeRange(start, end);
    }

    private Instant toUtc(LocalDateTime value) {
        return value.atOffset(ZoneOffset.UTC).toInstant();
    }

    private record TimeRange(Instant start, Instant end) {}

    private static long nanosToMillis(long nanos) {
        return nanos / 1_000_000;
    }

    private void persistSnapshot(SimulationSession session, SimulationSnapshot snapshot) {
        if (snapshot == null || session.snapshotFile == null) {
            return;
        }
        try {
            String line = objectMapper.writeValueAsString(snapshot) + System.lineSeparator();
            Files.write(session.snapshotFile,
                    line.getBytes(StandardCharsets.UTF_8),
                    StandardOpenOption.CREATE,
                    StandardOpenOption.APPEND);
        } catch (IOException ex) {
            log.warn("[SIM:{}] Unable to persist snapshot: {}", session.id, ex.getMessage());
        }
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
        private volatile Path snapshotFile;

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
