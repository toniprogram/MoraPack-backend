package com.morapack.skyroute.simulation.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.morapack.skyroute.algorithm.GeneticAlgorithm;
import com.morapack.skyroute.algorithm.Individual;
import com.morapack.skyroute.config.Config;
import com.morapack.skyroute.config.World;
import com.morapack.skyroute.models.Order;
import com.morapack.skyroute.models.OrderScope;
import com.morapack.skyroute.models.OrderPlan;
import com.morapack.skyroute.models.Route;
import com.morapack.skyroute.models.RouteSegment;
import com.morapack.skyroute.plan.service.WorldBuilder;
import com.morapack.skyroute.orders.repository.OrderRepository;
import com.morapack.skyroute.simulation.dto.ActiveAirportTick;
import com.morapack.skyroute.simulation.dto.ActiveSegment;
import com.morapack.skyroute.simulation.dto.DeliveredOrderDto;
import com.morapack.skyroute.simulation.dto.DeliveredPage;
import com.morapack.skyroute.simulation.dto.OrderLoadTick;
import com.morapack.skyroute.simulation.dto.OrderPlansDiff;
import com.morapack.skyroute.simulation.dto.OrderStatusTick;
import com.morapack.skyroute.simulation.dto.PrewarmResponse;
import com.morapack.skyroute.simulation.dto.SimulationMessage;
import com.morapack.skyroute.simulation.dto.SimulationOrderPlan;
import com.morapack.skyroute.simulation.dto.SimulationOrderPlanItem;
import com.morapack.skyroute.simulation.dto.SimulationOrderPlanPage;
import com.morapack.skyroute.simulation.dto.SimulationPlanSummary;
import com.morapack.skyroute.simulation.dto.SimulationSegment;
import com.morapack.skyroute.simulation.dto.SimulationSnapshot;
import com.morapack.skyroute.simulation.dto.SimulationStatus;
import com.morapack.skyroute.simulation.dto.SimulationStartRequest;
import com.morapack.skyroute.simulation.dto.SimulationStartResponse;
import com.morapack.skyroute.simulation.dto.SimulationTick;
import com.morapack.skyroute.simulation.live.*;
import com.morapack.skyroute.simulation.repository.SimulationPlanRepository;
import com.morapack.skyroute.simulation.repository.SimulationOrderPlanRepository;
import com.morapack.skyroute.simulation.repository.SimulationDeliveryRepository;
import com.morapack.skyroute.simulation.model.SimulationDelivery;
import com.morapack.skyroute.simulation.model.SimulationPlan;
import com.morapack.skyroute.simulation.model.SimulationRoute;
import com.morapack.skyroute.simulation.service.SimulationPlanBulkWriter;
import com.morapack.skyroute.simulation.service.SimulationOrderPlanReadWriter;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
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
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.Set;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;

@Slf4j
@Service
public class SimulationService {

    private static final String TOPIC_PREFIX = "/topic/simulations/";
    private static final double DEFAULT_SIM_SPEED = 112.0;
    private static final Set<String> PRODUCTION_HUBS = Set.of("SPIM", "EBCI", "UBBB");
    private final Random random = new Random();
    private final WorldBuilder worldBuilder;
    private final OrderRepository orderRepository;
    private final SimpMessagingTemplate messagingTemplate;
    private final ObjectMapper objectMapper;
    private final SimulationDeliveryRepository deliveryRepository;
    private final SimulationPlanRepository simulationPlanRepository;
    private final SimulationOrderPlanRepository orderPlanRepository;
    private final SimulationPlanMapper simulationPlanMapper;
    private final SimulationPlanBulkWriter planBulkWriter;
    private final SimulationOrderPlanReadWriter readWriter;
    private final TransactionTemplate txTemplate;
    private final Path snapshotsDir = Paths.get("snapshots");
    private final ExecutorService executorService = Executors.newCachedThreadPool();
    private final ScheduledExecutorService tickerExecutor = Executors.newSingleThreadScheduledExecutor();
    private final Map<UUID, SimulationSession> sessions = new ConcurrentHashMap<>();
    private final Map<String, CompletableFuture<World>> prewarmedWorlds = new ConcurrentHashMap<>();

    public SimulationService(WorldBuilder worldBuilder,
                             OrderRepository orderRepository,
                             SimpMessagingTemplate messagingTemplate,
                             ObjectMapper objectMapper,
                             SimulationDeliveryRepository deliveryRepository,
                             SimulationPlanRepository simulationPlanRepository,
                             SimulationOrderPlanRepository orderPlanRepository,
                             SimulationPlanMapper simulationPlanMapper,
                             SimulationPlanBulkWriter planBulkWriter,
                             SimulationOrderPlanReadWriter readWriter,
                             TransactionTemplate txTemplate) {
        this.worldBuilder = worldBuilder;
        this.orderRepository = orderRepository;
        this.messagingTemplate = messagingTemplate;
        this.objectMapper = objectMapper;
        this.deliveryRepository = deliveryRepository;
        this.simulationPlanRepository = simulationPlanRepository;
        this.orderPlanRepository = orderPlanRepository;
        this.simulationPlanMapper = simulationPlanMapper;
        this.planBulkWriter = planBulkWriter;
        this.readWriter = readWriter;
        this.txTemplate = txTemplate;
    }

    public SimulationStartResponse startSimulation(SimulationStartRequest request) {
        TimeRange range = resolveRange(request);
        long windowSecondsResolved = 560L;
        long fetchStart = System.nanoTime();
        List<Order> allProjectedInRange = filterOperationalOrders(
                orderRepository.findAllByScopeAndCreationUtcBetweenOrderByCreationUtcAsc(
                        OrderScope.PROJECTED,
                        range.start(),
                        range.end()
                )
        );
        long totalCount = allProjectedInRange.size();
        if (totalCount == 0) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "No projected orders found for the selected range"
            );
        }
        Instant firstWindowEnd = windowSecondsResolved > 0
                ? range.start().plus(Duration.ofSeconds(windowSecondsResolved))
                : range.end();
        long firstLoadStartMs = System.currentTimeMillis();
        List<Order> projectedOrders = filterOperationalOrders(
                orderRepository.findAllByScopeAndCreationUtcBetweenOrderByCreationUtcAsc(
                        OrderScope.PROJECTED,
                        range.start(),
                        firstWindowEnd
                )
        );
        long firstLoadElapsedMs = System.currentTimeMillis() - firstLoadStartMs;
        log.info("[SIM] Loaded {} projected orders (first window) in {} ms (range {} - {})",
                projectedOrders.size(),
                nanosToMillis(System.nanoTime() - fetchStart),
                range.start(),
                firstWindowEnd);

        UUID simulationId = UUID.randomUUID();
        SimulationSession session = new SimulationSession(simulationId, (int) totalCount);
        session.simStartInstant = range.start();
        session.touch();
        session.simSpeed = DEFAULT_SIM_SPEED;
        sessions.put(simulationId, session);

        World simulationWorld = null;
        if (request != null && request.prewarmToken() != null) {
            CompletableFuture<World> future = prewarmedWorlds.remove(request.prewarmToken());
            if (future != null) {
                try {
                    simulationWorld = future.get();
                    log.info("[SIM] Reutilizando mundo precalentado con token {}", request.prewarmToken());
                } catch (Exception ex) {
                    log.warn("[SIM] Falló reutilización de mundo precalentado (token {}): {}", request.prewarmToken(), ex.getMessage());
                }
            }
        }
        if (simulationWorld == null) {
            long worldBuildStart = System.nanoTime();
            simulationWorld = worldBuilder.buildBaseWorld(range.start());
            log.info("[SIM] Base world built in {} ms", nanosToMillis(System.nanoTime() - worldBuildStart));
        }
        Map<String, LiveAirport> liveAirports = new HashMap<>();
        simulationWorld.getAirports().asMap().forEach((code, airport) -> {
            liveAirports.put(code, new LiveAirport(code, airport.getStorageCapacity(), airport.getLatitude(), airport.getLongitude()));
        });
        LiveSimulationWorld liveWorld = new LiveSimulationWorld(
                simulationId.toString(),
                session.simStartInstant,
                liveAirports,
                projectedOrders
        );
        session.liveWorld = liveWorld;
        final World simulationWorldFinal = simulationWorld;
        final Instant rangeStart = range.start();
        try {
            Files.createDirectories(snapshotsDir);
            Path sessionFile = snapshotsDir.resolve(simulationId + ".jsonl");
            Files.deleteIfExists(sessionFile);
            session.snapshotFile = sessionFile;
            Path diffFile = snapshotsDir.resolve(simulationId + "-events.jsonl");
            Files.deleteIfExists(diffFile);
            session.diffFile = diffFile;
        } catch (IOException ex) {
            log.warn("[SIM:{}] Unable to prepare snapshot file: {}", simulationId, ex.getMessage());
        }

        log.info("[SIM] windowSeconds resolved to {} (request={}, default={})",
                windowSecondsResolved,
                request != null ? request.windowMinutes() : null,
                Config.SIMULATION_WINDOW_MINUTES);
        boolean useHeuristicSeed = request != null && Boolean.TRUE.equals(request.useHeuristicSeed());
        if (request != null && request.endDate() != null) {
            session.endInstant = toUtc(request.endDate());
        }

        final long finalWindowSeconds = 3360L; // procesar batches cada 3360s de tiempo simulado
        final boolean heuristicSeedEnabled = useHeuristicSeed;
        if (finalWindowSeconds > 0) {
            executorService.submit(() -> runSimulationBatched(session, simulationWorldFinal, finalWindowSeconds, rangeStart, range.end(), heuristicSeedEnabled, projectedOrders));
        } else {
            executorService.submit(() -> runSimulationLegacy(session, projectedOrders, simulationWorldFinal, heuristicSeedEnabled));
        }

        return new SimulationStartResponse(simulationId.toString());
    }

    public SimulationStatus getStatus(UUID simulationId) {
        SimulationSession session = sessions.get(simulationId);
        if (session == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Simulation not found");
    }
        return session.toStatus();
    }

    public void pause(UUID simulationId) {
        SimulationSession session = sessions.get(simulationId);
        if (session == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Simulation not found");
        }
        session.pause();
        stopTicker(session);
        log.info("[SIM:{}] Pausada por solicitud del cliente", simulationId);
    }

    public void resume(UUID simulationId) {
        SimulationSession session = sessions.get(simulationId);
        if (session == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Simulation not found");
        }
        session.resume();
        startTicker(session);
        log.info("[SIM:{}] Reanudada por solicitud del cliente", simulationId);
    }

    public void touch(UUID simulationId) {
        SimulationSession session = sessions.get(simulationId);
        if (session == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Simulation not found");
        }
        session.touch();
    }

    public SimulationFinalReport getReport(UUID simulationId) {
        SimulationSession session = sessions.get(simulationId);
        if (session == null || session.liveWorld == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Simulation not found");
        }
        return session.liveWorld.buildFinalReport();
    }

    public PrewarmResponse prewarmWorld() {
        // Si ya hay un mundo precalentado en progreso o listo, reutilizamos el token
        if (!prewarmedWorlds.isEmpty()) {
            String existing = prewarmedWorlds.keySet().iterator().next();
            log.info("[SIM] Retornando token de prewarm existente {}", existing);
            return new PrewarmResponse(existing);
        }

        UUID token = UUID.randomUUID();
        final Instant prewarmStart = resolveRange(null).start();
        CompletableFuture<World> future = CompletableFuture.supplyAsync(() -> {
            try {
                long start = System.nanoTime();
                World world = worldBuilder.buildBaseWorld(prewarmStart);
                log.info("[SIM] Mundo precalentado listo (token={} en {} ms)", token, nanosToMillis(System.nanoTime() - start));
                return world;
            } catch (Exception ex) {
                log.warn("[SIM] Error al precalentar mundo: {}", ex.getMessage());
                throw new CompletionException(ex);
            }
        }, executorService);
        prewarmedWorlds.put(token.toString(), future);
        return new PrewarmResponse(token.toString());
    }

    public void cancel(UUID simulationId) {
        SimulationSession session = sessions.get(simulationId);
        if (session == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Simulation not found");
        }
        session.cancel();
        stopTicker(session);
        cleanupSimulationAsync(session);
    }

    private void runSimulationLegacy(SimulationSession session, List<Order> orders, World world, boolean useHeuristicSeed) {
        List<Order> demand = new ArrayList<>();
        session.demandRef = demand;
        Individual previousBest = null;
        try {
            log.info("[SIM:{}] Starting legacy simulation with {} orders", session.id, orders.size());
            for (Order order : orders) {
                waitIfPaused(session);
                if (session.cancelled.get()) {
                    log.warn("[SIM:{}] Simulation cancelled by user after processing {} orders", session.id, demand.size());
                    break;
                }
                previousBest = processOrder(session, world, previousBest, demand, order, orders.size(), true, order.getCreationUtc(), useHeuristicSeed);
            }

            finishWhenDelivered(session);
        } catch (CancellationException ex) {
            log.warn("[SIM:{}] Simulation cancelled: {}", session.id, ex.getMessage());
        } catch (Exception ex) {
            session.error(ex.getMessage());
            log.error("[SIM:{}] Simulation failed: {}", session.id, ex.getMessage(), ex);
            messagingTemplate.convertAndSend(topic(session.id), SimulationMessage.error(session.id.toString(), ex.getMessage()));
        }
    }

    private void runSimulationBatched(SimulationSession session,
                                      World world,
                                      long windowSeconds,
                                      Instant windowStart,
                                      Instant rangeEnd,
                                      boolean useHeuristicSeed,
                                      List<Order> initialOrders) {
        List<Order> demand = new ArrayList<>();
        session.demandRef = demand;
        Individual previousBest = null;
        Duration windowDuration = Duration.ofSeconds(windowSeconds);
        int batchesProcessed = 0;
        Instant cursorStart = windowStart;
        long scheduleStartMillis = 0L;
        Future<List<Order>> prefetchFuture = null;
        try {
            log.info("[SIM:{}] Starting batched simulation (window={} seconds)", session.id, windowSeconds);
            int batchIndex = 0;
            List<Order> batch = initialOrders;
            while (true) {
                long now = System.currentTimeMillis();
                if (scheduleStartMillis == 0L) {
                    scheduleStartMillis = now;
                }
                long targetStart = scheduleStartMillis + batchIndex * 30_000L; // cada 30s de reloj real
                long targetEnd = targetStart + 15_000L; // GA con presupuesto de 15s
                if (targetEnd <= now) {
                    log.warn("[SIM:{}] GA schedule drifted (now={} ms past target end); resetting slot to now", session.id, now - targetEnd);
                    targetStart = now;
                    targetEnd = now + 15_000L;
                    scheduleStartMillis = now; // resync cadence
                }
                long waitMs = targetStart - now;
                while (waitMs > 0 && !session.cancelled.get()) {
                    waitIfPaused(session);
                    long step = Math.min(200L, waitMs);
                    try {
                        Thread.sleep(step);
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                        break;
                    }
                    waitMs -= step;
                }
                waitIfPaused(session);
                if (session.cancelled.get()) {
                    log.warn("[SIM:{}] Simulation cancelled before batch {}", session.id, batchIndex + 1);
                    break;
                }
                Instant windowEnd = cursorStart.plus(windowDuration);
                if (rangeEnd != null && windowEnd.isAfter(rangeEnd)) {
                    windowEnd = rangeEnd;
                }
                if (batch == null) { // intentar usar prefetch si está listo
                    if (prefetchFuture != null && prefetchFuture.isDone()) {
                        try {
                            batch = prefetchFuture.get();
                        } catch (Exception ignored) {
                            batch = null;
                        }
                    }
                    if (batch == null) {
                        List<Order> fetched = orderRepository.findAllByScopeAndCreationUtcBetweenOrderByCreationUtcAsc(
                                OrderScope.PROJECTED,
                                cursorStart,
                                windowEnd
                        );
                        batch = filterOperationalOrders(fetched);
                    }
                }
                if (batch == null || batch.isEmpty()) {
                    log.info("[SIM:{}] No more orders to process at window start {}", session.id, cursorStart);
                    break;
                }
                batch.forEach(o -> session.liveWorld.registerOrder(o));
                log.debug("[SIM:{}] Processing batch {} ({} orders)", session.id, batchIndex + 1, batch.size());
                Instant snapshotInstant = windowEnd;
                log.info("[SIM:{}] Invoking processBatch for batch {} (orders so far={})", session.id, batchIndex + 1, demand.size());
                previousBest = processBatch(session, world, previousBest, demand, batch, session.totalOrders, snapshotInstant, useHeuristicSeed, targetEnd);
                batchesProcessed++;
                log.info("[SIM:{}] Finished batch {} (demand size={}, processed total={})",
                        session.id, batchIndex + 1, demand.size(), session.processed.get());
                if (session.collapsed.get()) {
                    log.warn("[SIM:{}] Stopping batch processing due to logistic collapse", session.id);
                    break;
                }
                if (session.endInstant != null && cursorStart.isAfter(session.endInstant)) {
                    log.warn("[SIM:{}] Reached end window {}; stopping GA batches", session.id, session.endInstant);
                    break;
                }
                cursorStart = windowEnd;
                // Prefetch siguiente batch en paralelo para ganar tiempo de IO
                Instant nextWindowStart = cursorStart;
                Instant nextWindowEnd = rangeEnd != null && nextWindowStart.plus(windowDuration).isAfter(rangeEnd)
                        ? rangeEnd
                        : nextWindowStart.plus(windowDuration);
                prefetchFuture = executorService.submit(() -> {
                    List<Order> fetched = orderRepository.findAllByScopeAndCreationUtcBetweenOrderByCreationUtcAsc(
                            OrderScope.PROJECTED,
                            nextWindowStart,
                            nextWindowEnd
                    );
                    return filterOperationalOrders(fetched);
                });
                if (rangeEnd != null && !cursorStart.isBefore(rangeEnd)) {
                    break;
                }
                batchIndex++;
                batch = null; // será provisto por prefetchFuture o fetch sincrónico
            }

            log.info("[SIM:{}] Batch loop completed: processed {} batches", session.id, batchesProcessed);
            finishWhenDelivered(session);
        } catch (Exception ex) {
            session.error(ex.getMessage());
            log.error("[SIM:{}] Simulation failed after {} batches: {}", session.id, batchesProcessed, ex.getMessage(), ex);
            messagingTemplate.convertAndSend(topic(session.id), SimulationMessage.error(session.id.toString(), ex.getMessage()));
        }
    }

    private Individual processBatch(SimulationSession session,
                                    World world,
                                    Individual previousBest,
                                    List<Order> demand,
                                    List<Order> batch,
                                    int totalOrders,
                                    Instant snapshotInstant,
                                    boolean useHeuristicSeed,
                                    long targetEndMillis) {
        long iterationStart = System.nanoTime();
        long stageStart = iterationStart;
        // Procesamos órdenes del batch en orden cronológico para que la semilla heurística respete el timeline
        List<Order> orderedBatch = batch.stream()
                .sorted(Comparator.comparing(Order::getCreationUtc))
                .toList();

        Individual heuristicSeed = previousBest;

        for (Order order : orderedBatch) {
            if (session.cancelled.get()) {
                log.warn("[SIM:{}] Cancellation requested while processing batch; aborting batch", session.id);
                throw new CancellationException("Simulation cancelled");
            }
            log.debug("[SIM:{}] Adding order {} to batch demand (current demand size={})", session.id, order.getId(), demand.size());
            demand.add(order);

            if (useHeuristicSeed && heuristicSeed != null) {
                Individual patched = heuristicSeed.tryInsertOrder(world, order, random);
                if (patched != null) {
                    patched.applyToWorld(world);
                    heuristicSeed = patched;
                    log.debug("[SIM:{}] Order {} patched via heuristic (seed updated)", session.id, order.getId());
                }
            }
        }
        log.debug("[SIM:{}] Batch demand ready in {} ms (size={})",
                session.id, nanosToMillis(System.nanoTime() - stageStart), demand.size());

        // Avanzar el reloj al final de la ventana solo después del primer GA;
        // el primer batch corre en el instante inicial configurado
        if (snapshotInstant != null && session.gaRuns.get() > 0) {
            world.advanceTo(snapshotInstant);
        }

        // Ejecutar GA una vez por batch
        Instant simInstant = world.getCurrentInstant();
        stageStart = System.nanoTime();
        Individual completionSource = heuristicSeed != null ? heuristicSeed : previousBest;
        if (!demand.isEmpty() && completionSource != null) {
            Map<String, Instant> completion = completionSource.computeCompletionTimes(world, demand);
            Set<String> activeIds = new HashSet<>();
            for (Order order : demand) {
                Instant done = completion.get(order.getId());
                if (done == null || done.isAfter(simInstant)) {
                    activeIds.add(order.getId());
                }
            }
            if (activeIds.size() < demand.size()) {
                int removed = demand.size() - activeIds.size();
                log.info("[SIM:{}] Pruning {} delivered/expired orders before GA (simTime={})", session.id, removed, simInstant);
                demand.removeIf(o -> !activeIds.contains(o.getId()));
                heuristicSeed = heuristicSeed != null ? heuristicSeed.pruneToOrders(world, activeIds, demand) : null;
                previousBest = previousBest != null ? previousBest.pruneToOrders(world, activeIds, demand) : null;
                if (session.lastPopulation != null && !session.lastPopulation.isEmpty()) {
                    session.lastPopulation = session.lastPopulation.stream()
                            .map(ind -> ind.pruneToOrders(world, activeIds, demand))
                            .filter(Objects::nonNull)
                            .toList();
                }
            }
        }
        log.debug("[SIM:{}] Prune stage finished in {} ms (demand={})",
                session.id, nanosToMillis(System.nanoTime() - stageStart), demand.size());
        // Normalizar demanda para eliminar duplicados y mantener referencia compartida
        List<Order> normalizedDemand = normalizeDemand(demand);
        if (normalizedDemand.size() != demand.size()) {
            log.debug("[SIM:{}] Demand contained duplicates (raw={} normalized={})", session.id, demand.size(), normalizedDemand.size());
        }
        demand.clear();
        demand.addAll(normalizedDemand);

        // Saltamos normalizeSeed pesado; usaremos rebuild para forzar placeholders y asegurar completitud
        int activeOrderCount = demand.size();
        // Reconstruir individuos para que cada orden activa tenga exactamente un plan
        stageStart = System.nanoTime();
        log.debug("[SIM:{}] rebuild stage starting (activeOrders={} heuristic?={} previous?={} popSize={})",
                session.id,
                activeOrderCount,
                heuristicSeed != null,
                previousBest != null,
                session.lastPopulation != null ? session.lastPopulation.size() : 0);
        heuristicSeed = rebuildIndividualForDemand(session, heuristicSeed, demand, world);
        previousBest = rebuildIndividualForDemand(session, previousBest, demand, world);
        if (session.lastPopulation != null && !session.lastPopulation.isEmpty()) {
            List<Individual> rebuilt = new ArrayList<>();
            for (Individual ind : session.lastPopulation) {
                Individual completed = rebuildIndividualForDemand(session, ind, demand, world);
                if (completed != null && completed.getPlans().size() == activeOrderCount) {
                    rebuilt.add(completed);
                }
            }
            session.lastPopulation = rebuilt;
        }
        log.debug("[SIM:{}] rebuild stage finished in {} ms (activeOrders={} heuristicPlans={} previousPlans={} popSize={})",
                session.id,
                nanosToMillis(System.nanoTime() - stageStart),
                activeOrderCount,
                heuristicSeed != null ? heuristicSeed.getPlans().size() : 0,
                previousBest != null ? previousBest.getPlans().size() : 0,
                session.lastPopulation != null ? session.lastPopulation.size() : 0);
        if (demand.isEmpty()) {
            log.warn("[SIM:{}] No active orders after pruning; skipping GA for this batch", session.id);
            return heuristicSeed != null ? heuristicSeed : previousBest;
        }
        if (heuristicSeed != null && heuristicSeed.getPlans().size() != activeOrderCount) {
            throw new IllegalStateException("Invalid heuristicSeed: missing plans for active orders");
        }
        if (previousBest != null && previousBest.getPlans().size() != activeOrderCount) {
            throw new IllegalStateException("Invalid previousBest: missing plans for active orders");
        }

        GeneticAlgorithm ga = new GeneticAlgorithm(world, List.copyOf(demand));
        log.info("[SIM:{}] Starting GA for batch (simTime={})", session.id, simInstant);
        long start = System.nanoTime();
        long gaBudgetMs = Math.max(15_000L, targetEndMillis - System.currentTimeMillis());
        Individual best = ga.runTimed(
                Config.POP_SIZE,
                Config.MAX_GEN,
                gaBudgetMs,
                heuristicSeed,
                session.lastPopulation,
                List.of()
        );
        long gaDuration = System.nanoTime() - start;
        session.lastPopulation = ga.snapshotPopulation();
        session.gaRuns.incrementAndGet();

        log.info("[SIM:{}] GA done for batch of {} orders (took {} ms)", session.id, orderedBatch.size(), gaDuration / 1_000_000);
        if (best.getPlans().size() != activeOrderCount) {
            log.warn("[SIM:{}] GA best incomplete (plans={} expected={}); attempting rebuild", session.id, best.getPlans().size(), activeOrderCount);
            Individual rebuiltBest = rebuildIndividualForDemand(session, best, demand, world);
            if (rebuiltBest != null && rebuiltBest.getPlans().size() == activeOrderCount) {
                best = rebuiltBest;
            } else {
                log.error("[SIM:{}] Rebuild failed to complete best individual (plans={})", session.id, rebuiltBest != null ? rebuiltBest.getPlans().size() : 0);
            }
        }
        var planIds = best.getPlans().stream().map(OrderPlan::getOrderId).toList();
        log.info("[SIM:{}] Best individual plans count={} ids={}", session.id, planIds.size(), planIds);
        log.info("[SIM:{}] Metrics for batch: gaRun={} ms, iterationTotal={} ms",
                session.id,
                nanosToMillis(gaDuration),
                nanosToMillis(System.nanoTime() - iterationStart));

        // Ya avanzamos antes de correr el GA; mantenemos el instante alineado por seguridad
        if (snapshotInstant != null) {
            Instant currentInstant = world.getCurrentInstant();
            if (currentInstant == null || snapshotInstant.isAfter(currentInstant)) {
                world.advanceTo(snapshotInstant);
            }
        }
        // Actualizamos las órdenes activas desde demand (fuente de verdad)
        session.activeOrderIds = demand.stream().map(Order::getId).collect(Collectors.toSet());

        // Filtrar planes a solo órdenes activas para DTO/read model
        List<OrderPlan> activePlans = best.getPlans().stream()
                .filter(p -> session.activeOrderIds.contains(p.getOrderId()))
                .toList();

        SimulationSnapshot snapshot = toSnapshot(session.id, demand.size(), totalOrders, best, world, demand, activePlans);
        session.update(snapshot);
        persistDiff(session, snapshot);
        persistSnapshot(session, snapshot);
        Map<String, Instant> creationMap = demand.stream()
                .collect(Collectors.toMap(Order::getId, Order::getCreationUtc, (a, b) -> a));
        List<SimulationOrderPlan> detailedUpdates = new ArrayList<>();
        Map<String, SimulationOrderPlan> detailsMap = new HashMap<>(session.lastDetails);
        activePlans.forEach(p -> {
            SimulationOrderPlan dto = toOrderPlanDto(p, creationMap.get(p.getOrderId()));
            SimulationOrderPlan prev = detailsMap.get(dto.orderId());
            if (prev == null || !prev.equals(dto)) {
                detailedUpdates.add(dto);
                detailsMap.put(dto.orderId(), dto);
            }
        });
        session.lastDetails = detailsMap;
        // Persistimos cambios incrementales al read model (solo los que difieren)
        if (!detailedUpdates.isEmpty()) {
            readWriter.upsertReadModel(session.id.toString(), detailedUpdates);
        }
        if (session.liveWorld != null && activePlans != null) {
            activePlans.forEach(p -> {
                var plannedTick = new OrderStatusTick(
                        p.getOrderId(),
                        "PLANNED",
                        "",
                        p.getRoutes() != null ? p.getRoutes().stream().mapToInt(r -> r.getQuantity()).sum() : 0
                );
                session.liveWorld.registerPlanned(plannedTick);
            });
            log.debug("[SIM:{}] Registrados {} pedidos planificados para emitir en tick", session.id, best.getPlans().size());
        }
        scheduleLiveFlightsFromIndividual(session, best, orderedBatch);
        log.debug("[SIM:{}] Persisted snapshot with {} plans", session.id, snapshot.orderPlans().size());
        log.trace("[SIM:{}] Snapshot created: processed={}/{}", session.id, demand.size(), totalOrders);
        // Enviamos snapshot de avance (sin tick) para liberar overlay en frontend sin duplicar ticks
        messagingTemplate.convertAndSend(
                topic(session.id),
                SimulationMessage.progress(session.id.toString(), snapshot, null, detailedUpdates.isEmpty() ? null : detailedUpdates)
        );
        // Arrancamos ticker y cronómetro real solo después del primer GA
        if (session.realStartMillis == 0) {
            session.realStartMillis = System.currentTimeMillis();
            startTicker(session);
        }

        // guardar última solución para persistencia final
        session.lastBest = best;

        // Detecta colapso si hay slack negativo o faltan planes para órdenes demandadas
        OrderPlan negativeSlackPlan = null;
        for (OrderPlan p : best.getPlans()) {
            if (p.getSlack() != null && p.getSlack().isNegative()) {
                negativeSlackPlan = p;
                break;
            }
        }
        if (negativeSlackPlan != null) {
            session.markCollapsed("Colapso logístico: slack negativo en pedido " + negativeSlackPlan.getOrderId());
            log.warn("[SIM:{}] Logistic collapse detected due to negative slack in order {}", session.id, negativeSlackPlan.getOrderId());
        } else {
            Set<String> plannedIds = best.getPlans().stream().map(OrderPlan::getOrderId).collect(Collectors.toSet());
            for (Order o : demand) {
                if (!plannedIds.contains(o.getId())) {
                    session.markCollapsed("Colapso logístico: no se pudo planificar el pedido " + o.getId());
                    log.warn("[SIM:{}] Logistic collapse detected at order {}", session.id, o.getId());
                    break;
                }
            }
        }

        return best;
    }

    // Sobrecarga para compatibilidad: usa una ventana fija de 60s desde ahora
    private Individual processBatch(SimulationSession session,
                                    World world,
                                    Individual previousBest,
                                    List<Order> demand,
                                    List<Order> batch,
                                    int totalOrders,
                                    Instant snapshotInstant,
                                    boolean useHeuristicSeed) {
        // Reservamos ~20s para persistencia/IO
        long targetEndMillis = System.currentTimeMillis() + 40_000L;
        return processBatch(session, world, previousBest, demand, batch, totalOrders, snapshotInstant, useHeuristicSeed, targetEndMillis);
    }

    private void finishWhenDelivered(SimulationSession session) {
        executorService.submit(() -> {
            try {
                while (!session.cancelled.get()
                        && session.liveWorld != null
                        && (session.liveWorld.hasPendingWork()
                        || session.liveWorld.countDeliveredOrders() < session.totalOrders)) {
                    Thread.sleep(500);
                }
                if (session.cancelled.get()) {
                    stopTicker(session);
                    return;
                }
                session.complete();
                SimulationSnapshot finalSnapshot = session.lastSnapshot;
                log.info("[SIM:{}] Simulation completed after deliveries. Processed {}/{} orders. GA runs={}", session.id, session.processed.get(), session.totalOrders, session.gaRuns.get());
                // Persistimos modelo final completo (desactivado temporalmente)
                // if (session.lastBest != null) {
                //     persistSimulationPlan(session.id, session.lastBest);
                // }
                persistSnapshot(session, finalSnapshot);
                messagingTemplate.convertAndSend(
                        topic(session.id),
                        SimulationMessage.completed(session.id.toString(), finalSnapshot)
                );
                stopTicker(session);
                cleanupSimulationAsync(session);
            } catch (InterruptedException ie) {
                Thread.currentThread().interrupt();
            } catch (Exception ex) {
                log.warn("[SIM:{}] Error while waiting for deliveries: {}", session.id, ex.getMessage());
            }
        });
    }

    private void persistStatusChangesAsync(UUID simulationId, Map<String, String> statusChanges) {
        if (statusChanges == null || statusChanges.isEmpty()) {
            return;
        }
        executorService.submit(() -> {
            try {
                String simId = simulationId.toString();
                // Ejecutar en una sola transacción para reducir presión sobre el pool
                txTemplate.executeWithoutResult(status -> {
                    Map<String, List<String>> byStatus = statusChanges.entrySet().stream()
                            .collect(Collectors.groupingBy(Map.Entry::getValue,
                                    Collectors.mapping(Map.Entry::getKey, Collectors.toList())));
                    byStatus.forEach((st, ids) -> {
                        try {
                            orderPlanRepository.updateStatusBulk(simId, st, ids);
                        } catch (Exception inner) {
                            log.warn("[SIM:{}] Could not bulk update status {} for {} orders: {}", simId, st, ids.size(), inner.getMessage());
                        }
                    });
                });
                // Actualizamos read model
                readWriter.updateStatuses(simId, statusChanges);
            } catch (Exception ex) {
                log.warn("[SIM:{}] Could not persist status changes: {}", simulationId, ex.getMessage());
            }
        });
    }

    private Individual processOrder(SimulationSession session,
                                    World world,
                                    Individual previousBest,
                                    List<Order> demand,
                                    Order order,
                                    int totalOrders,
                                    boolean emitSnapshot,
                                    Instant snapshotInstant,
                                    boolean useHeuristicSeed) {
        Instant instant = emitSnapshot ? snapshotInstant : null;
        long targetEnd = System.currentTimeMillis() + 5_000L;
        return processBatch(session, world, previousBest, demand, List.of(order), totalOrders, instant, useHeuristicSeed, targetEnd);
    }

    private SimulationSnapshot toSnapshot(UUID simulationId,
                                          int processed,
                                          int total,
                                          Individual best,
                                          World world,
                                          List<Order> demand,
                                          List<OrderPlan> activePlans) {

        Instant currentSimTime = world.getCurrentInstant();
        Map<String, Instant> creationMap = demand.stream()
                .collect(Collectors.toMap(Order::getId, Order::getCreationUtc, (a, b) -> a));

        List<com.morapack.skyroute.simulation.dto.SimulationOrderPlan> orderPlans = activePlans.stream()
                .map(p -> toOrderPlanDto(p, creationMap.get(p.getOrderId())))
                .collect(Collectors.toList());

        return new SimulationSnapshot(
                simulationId.toString(),
                processed,
                total,
                best.getFitness(),
                currentSimTime,
                orderPlans
        );
    }

    private void persistSimulationPlan(UUID simulationId, Individual best) {
        txTemplate.executeWithoutResult(status -> {
            try {
                String simId = simulationId.toString();
                com.morapack.skyroute.simulation.model.SimulationPlan plan = simulationPlanRepository.findBySimulationId(simId).orElse(null);
                if (plan == null) {
                    plan = new com.morapack.skyroute.simulation.model.SimulationPlan();
                    plan.setSimulationId(simId);
                    plan.setOrderPlans(new ArrayList<>());
                } else if (plan.getOrderPlans() == null) {
                    plan.setOrderPlans(new ArrayList<>());
                }
                plan.setGeneratedAt(LocalDateTime.now());
                plan.setFitness(best.getFitness());
                plan.setSlaCompliant(best.isSlaCompliant());
                plan.setSlaViolations(best.getSlaViolations());

                // Upsert incremental sin reemplazar la colección completa para no disparar orphanRemoval
                Map<String, com.morapack.skyroute.simulation.model.SimulationOrderPlan> existingByOrder = plan.getOrderPlans().stream()
                        .collect(Collectors.toMap(com.morapack.skyroute.simulation.model.SimulationOrderPlan::getOrderId, p -> p, (a, b) -> a, HashMap::new));
                Set<String> seenOrders = new HashSet<>();

                for (var original : best.getPlans()) {
                    com.morapack.skyroute.simulation.model.SimulationOrderPlan target = existingByOrder.get(original.getOrderId());
                    if (target == null) {
                        target = new com.morapack.skyroute.simulation.model.SimulationOrderPlan();
                        target.setOrderId(original.getOrderId());
                        target.setPlan(plan);
                        target.setRoutes(new ArrayList<>());
                        plan.getOrderPlans().add(target);
                    }
                    seenOrders.add(original.getOrderId());
                    target.setPlan(plan);
                    target.setSlack(original.getSlack());
                    if (target.getStatus() == null) {
                        target.setStatus("WAITING"); // solo nuevas inserciones arrancan en WAITING
                    }

                    // Reutilizar rutas/segmentos que no cambian para evitar borrados masivos
                    List<com.morapack.skyroute.simulation.model.SimulationRoute> currentRoutes = target.getRoutes() == null
                            ? new ArrayList<>()
                            : new ArrayList<>(target.getRoutes());
                    Map<String, com.morapack.skyroute.simulation.model.SimulationRoute> existingRoutesBySig = currentRoutes.stream()
                            .collect(Collectors.toMap(this::routeSignature, Function.identity(), (a, b) -> a, LinkedHashMap::new));
                    Set<com.morapack.skyroute.simulation.model.SimulationRoute> toRemove = new HashSet<>(currentRoutes);
                    List<com.morapack.skyroute.simulation.model.SimulationRoute> updatedRoutes = new ArrayList<>();

                    if (original.getRoutes() != null) {
                        for (Route originalRoute : original.getRoutes()) {
                            String signature = routeSignature(originalRoute);
                            com.morapack.skyroute.simulation.model.SimulationRoute reuse = existingRoutesBySig.get(signature);
                            if (reuse != null) {
                                reuse.setQuantity(originalRoute.getQuantity());
                                reuse.setSlack(originalRoute.getSlack());
                                toRemove.remove(reuse);
                                updatedRoutes.add(reuse);
                                continue;
                            }

                            com.morapack.skyroute.simulation.model.SimulationRoute mapped = simulationPlanMapper.mapRoute(originalRoute);
                            mapped.setOrderPlan(target);
                            updatedRoutes.add(mapped);
                        }
                    }

                    // Elimina solo las rutas que ya no aplican
                    final com.morapack.skyroute.simulation.model.SimulationOrderPlan targetRef = target;
                    toRemove.forEach(r -> {
                        r.setOrderPlan(null);
                        if (targetRef.getRoutes() != null) {
                            targetRef.getRoutes().remove(r);
                        }
                    });
                    target.setRoutes(updatedRoutes);
                    updatedRoutes.forEach(r -> r.setOrderPlan(targetRef));
                }

                // Remueve planes que ya no están presentes sin reasignar la colección
                plan.getOrderPlans().removeIf(p -> !seenOrders.contains(p.getOrderId()));

                simulationPlanRepository.save(plan);
                // Inserta hijos vía JDBC batch para mayor velocidad
                planBulkWriter.replaceChildren(plan.getId(), best.getPlans());

                List<String> planIds = best.getPlans().stream().map(OrderPlan::getOrderId).sorted().toList();
                log.warn("[SIM:{}] Persisted {} plans via bulk JDBC. OrderIds={}", simulationId, planIds.size(), planIds);
            } catch (Exception ex) {
                log.warn("[SIM:{}] Could not persist simulation plan: {}", simulationId, ex.getMessage());
                status.setRollbackOnly();
            }
        });
    }

    private void cleanupSimulationAsync(SimulationSession session) {
        executorService.submit(() -> {
            UUID simId = session.id;
            try {
                simulationPlanRepository.deleteBySimulationId(simId.toString());
            } catch (Exception ex) {
                log.warn("[SIM:{}] Could not delete simulation plan: {}", simId, ex.getMessage());
            }
            try {
                deliveryRepository.deleteBySimulationId(simId);
            } catch (Exception ex) {
                log.warn("[SIM:{}] Could not delete deliveries: {}", simId, ex.getMessage());
            }
            try {
                if (session.snapshotFile != null) {
                    Files.deleteIfExists(session.snapshotFile);
                }
                if (session.diffFile != null) {
                    Files.deleteIfExists(session.diffFile);
                }
            } catch (IOException io) {
                log.warn("[SIM:{}] Could not delete snapshot files: {}", simId, io.getMessage());
            }
            sessions.remove(simId);
            stopTicker(session);
            log.info("[SIM:{}] Cleanup completed", simId);
        });
    }

    private com.morapack.skyroute.simulation.dto.SimulationOrderPlan toOrderPlanDto(com.morapack.skyroute.models.OrderPlan plan) {
        return toOrderPlanDto(plan, null);
    }

    private com.morapack.skyroute.simulation.dto.SimulationOrderPlan toOrderPlanDto(com.morapack.skyroute.models.OrderPlan plan, Instant creationUtc) {
        long slackMinutes = optionalDurationMinutes(plan.getSlack());
        List<com.morapack.skyroute.simulation.dto.SimulationRoute> routes = plan.getRoutes() == null
                ? List.of()
                : plan.getRoutes().stream().map(this::toRouteDto).toList();
        return new com.morapack.skyroute.simulation.dto.SimulationOrderPlan(plan.getOrderId(), creationUtc, slackMinutes, routes);
    }

    private com.morapack.skyroute.simulation.dto.SimulationRoute toRouteDto(Route route) {
        long slackMinutes = optionalDurationMinutes(route.getSlack());
        List<SimulationSegment> segments = route.getSegments() == null
                ? List.of()
                : route.getSegments().stream().map(this::toSegmentDto).toList();
        return new com.morapack.skyroute.simulation.dto.SimulationRoute(route.getQuantity(), slackMinutes, segments);
    }

    private void scheduleLiveFlightsFromIndividual(SimulationSession session, Individual best, List<Order> batchOrders) {
        if (session.liveWorld == null || best == null || batchOrders == null) {
            return;
        }
        var ids = batchOrders.stream().map(Order::getId).collect(Collectors.toSet());
        Map<String, OrderPlan> planById = best.getPlans().stream()
                .collect(Collectors.toMap(OrderPlan::getOrderId, p -> p, (a, b) -> a));

        ids.forEach(orderId -> {
            OrderPlan plan = planById.get(orderId);
            if (plan == null || plan.getRoutes() == null) {
                return;
            }
            plan.getRoutes().forEach(route -> {
                if (route.getSegments() == null) return;
                route.getSegments().forEach(seg -> {
                    var flight = seg.getFlight();
                    if (flight == null || seg.getDate() == null) return;
                    Instant dep = flight.getDepartureInstant(seg.getDate());
                    Instant arr = flight.getArrivalInstant(seg.getDate());
                    int capacityTotal = Math.max(flight.getDailyCapacity(), seg.getRouteQuantity());
                    LiveFlight lf = new LiveFlight(
                            flight.getId(),
                            flight.getOriginCode(),
                            flight.getDestinationCode(),
                            dep,
                            arr,
                            capacityTotal
                    );
                    session.liveWorld.scheduleFutureFlight(lf, orderId, seg.getRouteQuantity());
                });
            });
        });
    }

    private SimulationTick toTick(SimulationSession session) {
        if (session.liveWorld == null) {
            return null;
        }
        Instant simTime = session.liveWorld.getCurrentSimTime();
        List<ActiveSegment> actives = session.liveWorld.toActiveSegments();
        Map<String, Integer> loads = session.liveWorld.getAirportLoads();
        Map<String, Map<String, Integer>> inventory = session.liveWorld.getAirportInventory();
        // Simplified payload: omit order-level details en el mensaje,
        // pero igual persistimos entregas en BD.
        List<OrderStatusTick> orderStatuses = List.of();
        List<OrderStatusTick> deliveredStatuses = List.of();
        List<OrderStatusTick> plannedStatuses = List.of();
        List<OrderStatusTick> deliveredForDb = session.liveWorld.drainDeliveredOnce();
        Map<String, String> statusChanges = session.liveWorld.captureStatusChanges();
        if (deliveredForDb != null) {
            deliveredForDb.forEach(os -> onOrderDelivered(session.id, os.orderId()));
        }
        // Persistimos estados aunque no viajen en el tick
        persistStatusChangesAsync(session.id, statusChanges);
        List<SimulationOrderPlan> currentPlans = List.of();
        List<SimulationPlanSummary> planSummaries = List.of();
        List<ActiveAirportTick> airportTicks = session.liveWorld.getAirports().values().stream()
                .map(a -> {
                    var inv = inventory.getOrDefault(a.getAirportCode(), Map.of());
                    var orderLoads = inv.entrySet().stream()
                            .map(e -> new OrderLoadTick(e.getKey(), e.getValue()))
                            .toList();
                    return new ActiveAirportTick(
                            a.getAirportCode(),
                            loads.getOrDefault(a.getAirportCode(), 0),
                            a.getMaxThroughputPerHour(),
                            orderLoads
                    );
                })
                .toList();
        int deliveredOrders = session.liveWorld.countDeliveredOrders();
        int inTransitOrders = session.liveWorld.countInTransitOrders();
        double speed = session.simSpeed;
        String status = session.completed.get() ? "completed" : (session.cancelled.get() ? "cancelled" : "running");
        if (session.paused.get()) {
            status = "paused";
        }
        if (session.collapsed.get()) {
            status = "collapsed";
        }
        long realElapsedMs = session.realStartMillis > 0 ? System.currentTimeMillis() - session.realStartMillis : 0L;
        // calcular diff de planes (vacío porque no enviamos órdenes en tick)
        OrderPlansDiff diff = new OrderPlansDiff(simTime, List.of(), List.of(), List.of());
        List<String> nowInTransit = List.of();

        // Persistimos entregas aunque no las incluyamos en el tick
        persistDeliveredAsync(session.id, simTime, deliveredForDb);
        // Tick liviano: sin planes ni estados en payload
        return new SimulationTick(
                session.id.toString(),
                simTime,
                realElapsedMs,
                speed,
                status,
                session.collapseMessage,
                List.of(), // orderPlans
                diff,
                actives,
                airportTicks,
                deliveredOrders,
                inTransitOrders,
                List.of(), // orderStatuses
                List.of(), // deliveredStatuses
                List.of(), // plannedStatuses
                nowInTransit,
                List.of(), // planSummaries
                List.of()  // changedOrderIds
        );
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

    private SimulationSegment toSegmentDto(com.morapack.skyroute.simulation.model.SimulationRouteSegment segment) {
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

    private com.morapack.skyroute.simulation.dto.SimulationRoute toRouteDto(com.morapack.skyroute.simulation.model.SimulationRoute route) {
        long slackMinutes = optionalDurationMinutes(route.getSlack());
        List<SimulationSegment> segments = route.getSegments() == null
                ? List.of()
                : route.getSegments().stream().map(this::toSegmentDto).toList();
        return new com.morapack.skyroute.simulation.dto.SimulationRoute(route.getQuantity(), slackMinutes, segments);
    }

    private SimulationOrderPlanItem toOrderPlanItem(com.morapack.skyroute.simulation.model.SimulationOrderPlan plan) {
        List<com.morapack.skyroute.simulation.dto.SimulationRoute> routes = plan.getRoutes() == null
                ? List.of()
                : plan.getRoutes().stream().map(this::toRouteDto).toList();
        long slackMinutes = plan.getSlack() != null ? plan.getSlack().toMinutes() : 0L;
        return new SimulationOrderPlanItem(plan.getOrderId(), plan.getStatus(), slackMinutes, routes, null);
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

    private List<Order> normalizeDemand(List<Order> demand) {
        if (demand == null || demand.isEmpty()) {
            return List.of();
        }
        return demand.stream()
                .filter(Objects::nonNull)
                .filter(o -> o.getId() != null)
                .collect(Collectors.collectingAndThen(
                        Collectors.toMap(Order::getId, Function.identity(), (a, b) -> a, LinkedHashMap::new),
                        m -> new ArrayList<>(m.values())
                ));
    }

    private Individual rebuildIndividualForDemand(SimulationSession session,
                                                 Individual individual,
                                                 List<Order> demand,
                                                 World world) {
        if (individual == null) {
            return null;
        }
        List<Order> normalizedDemand = normalizeDemand(demand);
        if (normalizedDemand.isEmpty()) {
            return null;
        }
        try {
            Individual rebuilt = individual.rebuildWithOrders(world, normalizedDemand, random);
            if (rebuilt == null) {
                return null;
            }
            if (rebuilt.getPlans().size() != normalizedDemand.size()) {
                log.warn("[SIM:{}] Rebuilt individual still incomplete (plans={} demand={})",
                        session.id, rebuilt.getPlans().size(), normalizedDemand.size());
                return null;
            }
            return rebuilt;
        } catch (Exception ex) {
            log.warn("[SIM:{}] Could not rebuild individual before GA: {}", session.id, ex.getMessage());
            return null;
        }
    }

    private void waitIfPaused(SimulationSession session) {
        while (session.paused.get() && !session.cancelled.get() && !session.completed.get()) {
            try {
                Thread.sleep(200);
            } catch (InterruptedException ie) {
                Thread.currentThread().interrupt();
                break;
            }
        }
    }

    private Instant alignToWindow(Instant instant, Duration window) {
        if (instant == null || window == null || window.isZero() || window.isNegative()) {
            return instant;
        }
        long windowMillis = window.toMillis();
        long alignedMillis = (instant.toEpochMilli() / windowMillis) * windowMillis;
        return Instant.ofEpochMilli(alignedMillis);
    }

    private List<OrderWindow> groupOrdersByWindow(List<Order> orders,
                                                  int windowMinutes,
                                                  Instant startInstant) {
        if (orders.isEmpty()) {
            return List.of();
        }
        Duration window = Duration.ofMinutes(windowMinutes);
        long windowMillis = window.toMillis();
        Instant alignedStart = alignToWindow(startInstant, window);
        long referenceMillis = alignedStart.toEpochMilli();
        Map<Long, List<Order>> buckets = new LinkedHashMap<>();
        for (Order order : orders) {
            long creationMillis = order.getCreationUtc().toEpochMilli();
            long delta = Math.max(0, creationMillis - referenceMillis);
            long bucketIndex = delta / windowMillis;
            long bucketKey = referenceMillis + bucketIndex * windowMillis;
            buckets.computeIfAbsent(bucketKey, k -> new ArrayList<>()).add(order);
        }
        List<OrderWindow> result = new ArrayList<>();
        for (Map.Entry<Long, List<Order>> entry : buckets.entrySet()) {
            result.add(new OrderWindow(Instant.ofEpochMilli(entry.getKey()), entry.getValue()));
        }
        return result;
    }

    private void persistSnapshot(SimulationSession session, SimulationSnapshot snapshot) {
        if (snapshot == null || session.snapshotFile == null) {
            return;
        }
        persistDiff(session, snapshot);
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

    private String routeSignature(Route route) {
        if (route == null) {
            return "null";
        }
        String segmentSig = route.getSegments() == null ? "" : route.getSegments().stream()
                .sorted(Comparator.comparing(RouteSegment::getDate).thenComparing(s -> s.getFlight().getId()))
                .map(this::segmentSignature)
                .collect(Collectors.joining(";"));
        return route.getQuantity() + "|" + route.getSlack() + "|" + segmentSig;
    }

    private String routeSignature(com.morapack.skyroute.simulation.model.SimulationRoute route) {
        if (route == null) {
            return "null";
        }
        String segmentSig = route.getSegments() == null ? "" : route.getSegments().stream()
                .sorted(Comparator.comparing(com.morapack.skyroute.simulation.model.SimulationRouteSegment::getDate)
                        .thenComparing(s -> s.getFlight().getId()))
                .map(this::segmentSignature)
                .collect(Collectors.joining(";"));
        return route.getQuantity() + "|" + route.getSlack() + "|" + segmentSig;
    }

    private String segmentSignature(RouteSegment segment) {
        return segment.getFlight().getId() + "|" + segment.getDate() + "|" + segment.getRouteQuantity() + "|" + segment.isFinalLeg() + "|" + segment.getSlack();
    }

    private String segmentSignature(com.morapack.skyroute.simulation.model.SimulationRouteSegment segment) {
        return segment.getFlight().getId() + "|" + segment.getDate() + "|" + segment.getRouteQuantity() + "|" + segment.isFinalLeg() + "|" + segment.getSlack();
    }

    private void startTicker(SimulationSession session) {
        if (session.ticker != null && !session.ticker.isCancelled()) {
            return;
        }
        session.ticker = tickerExecutor.scheduleAtFixedRate(() -> {
            try {
                if (session.liveWorld == null) {
                    return;
                }
                // auto-cancel if no client heartbeat in 5 minutes
                long now = System.currentTimeMillis();
                if (now - session.lastClientPingMillis > 300_000) {
                    log.warn("[SIM:{}] Cancelling due to inactivity (>5min sin solicitudes)", session.id);
                    cancel(session.id);
                    return;
                }
                long simSeconds = Math.max(1L, Math.round(session.simSpeed));
                session.liveWorld.tick(simSeconds);
                SimulationTick tick = toTick(session);
                if (tick != null) {
                    messagingTemplate.convertAndSend(topic(session.id), SimulationMessage.progress(session.id.toString(), null, tick));
                }
            } catch (Exception ex) {
                log.debug("[SIM:{}] Ticker error: {}", session.id, ex.getMessage());
            }
        }, 0, 1000, TimeUnit.MILLISECONDS); // 1 fps; front interpola con buffer
    }

    private void stopTicker(SimulationSession session) {
        if (session.ticker != null) {
            session.ticker.cancel(true);
            session.ticker = null;
        }
    }

    private void persistDiff(SimulationSession session, SimulationSnapshot snapshot) {
        if (snapshot == null || session.diffFile == null) {
            return;
        }
        SimulationSnapshot previous = session.lastSnapshot;
        if (previous == null) {
            return;
        }

        var prevIds = previous.orderPlans().stream().map(SimulationOrderPlan::orderId).collect(Collectors.toSet());
        var currIds = snapshot.orderPlans().stream().map(SimulationOrderPlan::orderId).collect(Collectors.toSet());

        List<String> added = currIds.stream().filter(id -> !prevIds.contains(id)).sorted().toList();
        List<String> removed = prevIds.stream().filter(id -> !currIds.contains(id)).sorted().toList();

        if (added.isEmpty() && removed.isEmpty()) {
            return;
        }

        DiffLogEntry entry = new DiffLogEntry(snapshot.simulationId(), snapshot.generatedAt(), added, removed);
        try {
            String json = objectMapper.writeValueAsString(entry);
            Files.writeString(session.diffFile, json + System.lineSeparator(), StandardCharsets.UTF_8,
                    StandardOpenOption.CREATE, StandardOpenOption.APPEND);
        } catch (IOException ex) {
            log.warn("[SIM:{}] Unable to persist diff log: {}", session.id, ex.getMessage());
        }
    }

    private void persistDeliveredAsync(UUID simulationId, Instant simTime, List<OrderStatusTick> delivered) {
        if (delivered == null || delivered.isEmpty()) {
            return;
        }
        executorService.submit(() -> {
            for (OrderStatusTick os : delivered) {
                try {
                    onOrderDelivered(simulationId, os.orderId());
                    SimulationDelivery existing = deliveryRepository
                            .findBySimulationIdAndOrderId(simulationId, os.orderId())
                            .orElse(null);
                    if (existing == null) {
                        SimulationDelivery entity = new SimulationDelivery(
                                simulationId,
                                os.orderId(),
                                os.quantity(),
                                os.location(),
                                simTime,
                                simTime
                        );
                        deliveryRepository.save(entity);
                    } else {
                        int updatedQty = existing.getDeliveredQtyTotal() + os.quantity();
                        existing.setDeliveredQtyTotal(updatedQty);
                        if (os.location() != null && !os.location().isBlank()) {
                            existing.setLastLocation(os.location());
                        }
                        existing.setLastDeliveredAt(simTime);
                        existing.setLastSimTime(simTime);
                        deliveryRepository.save(existing);
                    }
                } catch (Exception ex) {
                    log.warn("[SIM:{}] Unable to persist delivery for order {}: {}", simulationId, os.orderId(), ex.getMessage());
                }
            }
        });
    }

    public DeliveredPage getDelivered(UUID simulationId, int page, int size, String search) {
        int sanitizedPage = Math.max(0, page);
        int sanitizedSize = Math.min(Math.max(1, size), 200);
        PageRequest pr = PageRequest.of(sanitizedPage, sanitizedSize);
        Page<SimulationDelivery> deliveries;
        if (search != null && !search.isBlank()) {
            deliveries = deliveryRepository.findBySimulationIdAndOrderIdContainingIgnoreCase(simulationId, search, pr);
        } else {
            deliveries = deliveryRepository.findBySimulationId(simulationId, pr);
        }
        List<DeliveredOrderDto> items = deliveries.getContent().stream()
                .map(d -> new DeliveredOrderDto(
                        d.getOrderId(),
                        d.getDeliveredQtyTotal(),
                        d.getLastLocation(),
                        d.getLastDeliveredAt(),
                        d.getLastSimTime()
                ))
                .toList();
        return new DeliveredPage(deliveries.getTotalElements(), deliveries.getNumber(), deliveries.getSize(), items);
    }

    public SimulationOrderPlanPage getOrderPlans(UUID simulationId, int page, int size, String search, String statuses) {
        String simId = simulationId.toString();
        List<String> statusFilter = normalizeStatuses(statuses);
        return readWriter.getPage(simId, page, size, search, statusFilter);
    }

    private List<String> normalizeStatuses(String statuses) {
        if (statuses == null || statuses.isBlank()) {
            return null;
        }
        List<String> allowed = List.of("WAITING", "IN_TRANSIT", "DELIVERED");
        List<String> parsed = Stream.of(statuses.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .map(String::toUpperCase)
                .filter(allowed::contains)
                .distinct()
                .toList();
        return parsed.isEmpty() ? null : parsed;
    }

    private String topic(UUID simulationId) {
        return TOPIC_PREFIX + simulationId;
    }

    private void onOrderDelivered(UUID simulationId, String orderId) {
        SimulationSession session = sessions.get(simulationId);
        if (session == null || orderId == null) {
            return;
        }
        // eliminar de demand/activos/caches
        if (session.demandRef != null) {
            session.demandRef.removeIf(o -> orderId.equals(o.getId()));
        }
        session.activeOrderIds.remove(orderId);
        session.lastDetails.remove(orderId);
        session.lastPlans.remove(orderId);
        session.lastStatuses.remove(orderId);
        // marcar delivered en read model una sola vez
        if (session.deliveredOrders.add(orderId)) {
            try {
                readWriter.markDelivered(simulationId.toString(), orderId);
            } catch (Exception ex) {
                log.warn("[SIM:{}] Could not mark delivered in read model for {}: {}", simulationId, orderId, ex.getMessage());
            }
        }
    }

    private Individual normalizeSeed(World world, Individual seed, List<Order> demand) {
        if (seed == null) {
            log.debug("normalizeSeed enter: seed=null demand={}", demand != null ? demand.size() : 0);
            return null;
        }
        long start = System.nanoTime();
        log.debug("normalizeSeed enter: seedPlans={} demand={}", seed.getPlans().size(), demand != null ? demand.size() : 0);
        Map<String, Order> orderById = new LinkedHashMap<>();
        for (Order o : demand) {
            if (o != null && o.getId() != null) {
                orderById.putIfAbsent(o.getId(), o);
            }
        }
        Set<String> planned = seed.getPlans().stream().map(OrderPlan::getOrderId).collect(Collectors.toSet());
        if (planned.containsAll(orderById.keySet())) {
            log.debug("Seed already complete; skipping normalize (plans={} demand={})", planned.size(), orderById.size());
            return seed;
        }
        Set<String> missingIds = new LinkedHashSet<>();
        for (Order o : demand) {
            if (o != null && o.getId() != null && !planned.contains(o.getId())) {
                missingIds.add(o.getId());
            }
        }
        int missingBefore = missingIds.size();
        Individual current = seed;
        for (String id : missingIds) {
            Order order = orderById.get(id);
            if (order == null) {
                log.warn("Seed discarded: missing order {} not found in demand map (missingBefore={})", id, missingBefore);
                return null;
            }
            Individual patched = current.tryInsertOrder(world, order, random);
            if (patched == null) {
                log.warn("Seed discarded: could not insert order {} (missingBefore={})", order.getId(), missingBefore);
                return null;
            }
            current = patched;
        }
        Set<String> plannedAfter = current.getPlans().stream().map(OrderPlan::getOrderId).collect(Collectors.toSet());
        int missingAfter = (int) demand.stream().filter(o -> !plannedAfter.contains(o.getId())).count();
        log.debug("Seed normalized: missingBefore={} missingAfter={} tookMs={}", missingBefore, missingAfter, nanosToMillis(System.nanoTime() - start));
        return current;
    }

    /**
     * Genera un plan placeholder simple para asegurar la invariante de “un plan por orden”.
     * No reserva vuelos ni rutas reales; el GA lo reconstruirá luego.
     */
    private OrderPlan createPlaceholderPlan(Order order) {
        OrderPlan plan = new OrderPlan(order.getId());
        // Slack neutro/ligero para que el GA lo reconstruya sin premiarlo artificialmente
        plan.setSlack(Duration.ZERO);
        plan.setRoutes(new ArrayList<>()); // sin segmentos reales
        return plan;
    }

    private static class SimulationSession {
        private final UUID id;
        private final int totalOrders;
        private final AtomicInteger processed = new AtomicInteger();
        private final AtomicBoolean completed = new AtomicBoolean(false);
        private final AtomicBoolean cancelled = new AtomicBoolean(false);
        private final AtomicBoolean paused = new AtomicBoolean(false);
        private final AtomicBoolean collapsed = new AtomicBoolean(false);
        private volatile SimulationSnapshot lastSnapshot;
        private volatile String error;
        private volatile Path snapshotFile;
        private volatile Path diffFile;
        private final AtomicInteger gaRuns = new AtomicInteger();
        private volatile List<Individual> lastPopulation = List.of();
        private volatile ScheduledFuture<?> ticker;
        private volatile Instant simStartInstant;
        private volatile Instant endInstant;
        private volatile long realStartMillis;
        private volatile double simSpeed = 1.0;
        private volatile LiveSimulationWorld liveWorld;
        private volatile Map<String, SimulationOrderPlan> lastPlans = new HashMap<>();
        private volatile Map<String, String> lastStatuses = new HashMap<>();
        private volatile Map<String, SimulationOrderPlan> lastDetails = new HashMap<>();
        private volatile long lastClientPingMillis = System.currentTimeMillis();
        private volatile String collapseMessage;
        private volatile Individual lastBest;
        private volatile Set<String> activeOrderIds = new HashSet<>();
        private volatile Set<String> deliveredOrders = new HashSet<>();
        private volatile List<Order> demandRef;

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

        private void pause() {
            this.paused.set(true);
        }

        private void resume() {
            this.paused.set(false);
        }

        private void markCollapsed(String message) {
            this.collapsed.set(true);
            this.collapseMessage = message;
        }

        private void touch() {
            this.lastClientPingMillis = System.currentTimeMillis();
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

    private record OrderWindow(Instant windowStart, List<Order> orders) {}
    private List<Order> filterOperationalOrders(List<Order> orders) {
        if (orders == null || orders.isEmpty()) return List.of();
        return orders.stream()
                .filter(o -> {
                    String dest = o.getDestinationCode();
                    return dest != null && !PRODUCTION_HUBS.contains(dest.toUpperCase());
                })
                .collect(Collectors.toList());
    }

    /**
     * Entrada compacta para dejar trazabilidad incremental en disco.
     * No impacta el algoritmo, solo permite reconstruir cambios sin que el frontend conserve todo.
     */
    private record DiffLogEntry(
            String simulationId,
            Instant generatedAt,
            List<String> addedOrderIds,
            List<String> removedOrderIds
    ) {}
}
