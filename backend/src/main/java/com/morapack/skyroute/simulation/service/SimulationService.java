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
import com.morapack.skyroute.simulation.dto.*;
import com.morapack.skyroute.simulation.live.*;
import com.morapack.skyroute.simulation.dto.SimulationRoute;
import com.morapack.skyroute.simulation.dto.OrderStatusTick;
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
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;

@Slf4j
@Service
public class SimulationService {

    private static final String TOPIC_PREFIX = "/topic/simulations/";
    private static final double DEFAULT_SIM_SPEED = 500.0;
    private final Random random = new Random();
    private final WorldBuilder worldBuilder;
    private final OrderRepository orderRepository;
    private final SimpMessagingTemplate messagingTemplate;
    private final ObjectMapper objectMapper;
    private final Path snapshotsDir = Paths.get("snapshots");
    private final ExecutorService executorService = Executors.newCachedThreadPool();
    private final ScheduledExecutorService tickerExecutor = Executors.newSingleThreadScheduledExecutor();
    private final Map<UUID, SimulationSession> sessions = new ConcurrentHashMap<>();
    private final Map<String, CompletableFuture<World>> prewarmedWorlds = new ConcurrentHashMap<>();

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
        session.simStartInstant = range.start();
        session.realStartMillis = System.currentTimeMillis();
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
            liveAirports.put(code, new LiveAirport(code, airport.getStorageCapacity()));
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

        int windowMinutes = request != null && request.windowMinutes() != null
                ? request.windowMinutes()
                : Config.SIMULATION_WINDOW_MINUTES;
        if (windowMinutes < 0) {
            windowMinutes = 0;
        }
        log.info("[SIM] windowMinutes resolved to {} (request={}, default={})",
                windowMinutes,
                request != null ? request.windowMinutes() : null,
                Config.SIMULATION_WINDOW_MINUTES);
        boolean useHeuristicSeed = request != null && Boolean.TRUE.equals(request.useHeuristicSeed());
        if (request != null && request.endDate() != null) {
            session.endInstant = toUtc(request.endDate());
        }

        final int finalWindowMinutes = windowMinutes;
        final boolean heuristicSeedEnabled = useHeuristicSeed;
        if (finalWindowMinutes > 0) {
            executorService.submit(() -> runSimulationBatched(session, projectedOrders, simulationWorldFinal, finalWindowMinutes, rangeStart, heuristicSeedEnabled));
        } else {
            executorService.submit(() -> runSimulationLegacy(session, projectedOrders, simulationWorldFinal, heuristicSeedEnabled));
        }
        startTicker(session);

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
    }

    private void runSimulationLegacy(SimulationSession session, List<Order> orders, World world, boolean useHeuristicSeed) {
        List<Order> demand = new ArrayList<>();
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
                                      List<Order> orders,
                                      World world,
                                      int windowMinutes,
                                      Instant windowStart,
                                      boolean useHeuristicSeed) {
        List<OrderWindow> batches = groupOrdersByWindow(orders, windowMinutes, windowStart);
        List<Order> demand = new ArrayList<>();
        Individual previousBest = null;
        Duration windowDuration = Duration.ofMinutes(windowMinutes);
        int batchesProcessed = 0;
        try {
            log.info("[SIM:{}] Starting batched simulation: {} orders grouped in {} windows of {} minutes",
                    session.id, orders.size(), batches.size(), windowMinutes);
            for (int batchIndex = 0; batchIndex < batches.size(); batchIndex++) {
                waitIfPaused(session);
                if (session.cancelled.get()) {
                    log.warn("[SIM:{}] Simulation cancelled before batch {}", session.id, batchIndex + 1);
                    break;
                }
                OrderWindow window = batches.get(batchIndex);
                List<Order> batch = window.orders();
                log.debug("[SIM:{}] Processing batch {} of {} ({} orders)", session.id, batchIndex + 1, batches.size(), batch.size());
                Instant snapshotInstant = window.windowStart().plus(windowDuration);
                log.info("[SIM:{}] Invoking processBatch for batch {} (orders so far={})", session.id, batchIndex + 1, demand.size());
                previousBest = processBatch(session, world, previousBest, demand, batch, orders.size(), snapshotInstant, useHeuristicSeed);
            batchesProcessed++;
            log.info("[SIM:{}] Finished batch {} of {} (demand size={}, processed total={})",
                    session.id, batchIndex + 1, batches.size(), demand.size(), session.processed.get());
            if (session.collapsed.get()) {
                log.warn("[SIM:{}] Stopping batch processing due to logistic collapse", session.id);
                break;
            }
            if (session.endInstant != null && window.windowStart().isAfter(session.endInstant)) {
                log.warn("[SIM:{}] Reached end window {}; stopping GA batches", session.id, session.endInstant);
                break;
            }
        }

            log.info("[SIM:{}] Batch loop completed: processed {} of {} batches", session.id, batchesProcessed, batches.size());
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
                                    boolean useHeuristicSeed) {
        long iterationStart = System.nanoTime();
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
            world.advanceTo(order.getCreationUtc());

            if (useHeuristicSeed && heuristicSeed != null) {
                Individual patched = heuristicSeed.tryInsertOrder(world, order, random);
                if (patched != null) {
                    patched.applyToWorld(world);
                    heuristicSeed = patched;
                    log.debug("[SIM:{}] Order {} patched via heuristic (seed updated)", session.id, order.getId());
                }
            }
        }

        // Ejecutar GA una vez por batch
        GeneticAlgorithm ga = new GeneticAlgorithm(world, List.copyOf(demand));
        Instant simInstant = world.getCurrentInstant();
        log.info("[SIM:{}] Starting GA for batch (simTime={})", session.id, simInstant);
        long start = System.nanoTime();
        Individual best = ga.run(
                Config.POP_SIZE,
                Config.MAX_GEN,
                heuristicSeed,
                session.lastPopulation,
                batch
        );
        long gaDuration = System.nanoTime() - start;
        session.lastPopulation = ga.snapshotPopulation();
        session.gaRuns.incrementAndGet();

        log.info("[SIM:{}] GA done for batch of {} orders (took {} ms)", session.id, orderedBatch.size(), gaDuration / 1_000_000);
        var planIds = best.getPlans().stream().map(OrderPlan::getOrderId).toList();
        log.info("[SIM:{}] Best individual plans count={} ids={}", session.id, planIds.size(), planIds);
        log.info("[SIM:{}] Metrics for batch: gaRun={} ms, iterationTotal={} ms",
                session.id,
                nanosToMillis(gaDuration),
                nanosToMillis(System.nanoTime() - iterationStart));

        if (snapshotInstant != null) {
            Instant currentInstant = world.getCurrentInstant();
            if (currentInstant == null || snapshotInstant.isAfter(currentInstant)) {
                world.advanceTo(snapshotInstant);
            }
        }
        SimulationSnapshot snapshot = toSnapshot(session.id, demand.size(), totalOrders, best, world, demand);
        session.update(snapshot);
        persistDiff(session, snapshot);
        persistSnapshot(session, snapshot);
        if (session.liveWorld != null && best.getPlans() != null) {
            best.getPlans().forEach(p -> {
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
                SimulationMessage.progress(session.id.toString(), snapshot, null)
        );

        // Detecta colapso si faltan planes para órdenes demandadas
        Set<String> plannedIds = best.getPlans().stream().map(OrderPlan::getOrderId).collect(Collectors.toSet());
        for (Order o : demand) {
            if (!plannedIds.contains(o.getId())) {
                session.markCollapsed("Colapso logístico: no se pudo planificar el pedido " + o.getId());
                log.warn("[SIM:{}] Logistic collapse detected at order {}", session.id, o.getId());
                break;
            }
        }

        return best;
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
                persistSnapshot(session, finalSnapshot);
                messagingTemplate.convertAndSend(
                        topic(session.id),
                        SimulationMessage.completed(session.id.toString(), finalSnapshot)
                );
                stopTicker(session);
            } catch (InterruptedException ie) {
                Thread.currentThread().interrupt();
            } catch (Exception ex) {
                log.warn("[SIM:{}] Error while waiting for deliveries: {}", session.id, ex.getMessage());
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
        return processBatch(session, world, previousBest, demand, List.of(order), totalOrders, instant, useHeuristicSeed);
    }

    private SimulationSnapshot toSnapshot(UUID simulationId,
                                          int processed,
                                          int total,
                                          Individual best,
                                          World world,
                                          List<Order> demand) {

        Instant currentSimTime = world.getCurrentInstant();
        List<SimulationOrderPlan> orderPlans = best.getPlans().stream()
                .map(this::toOrderPlanDto)
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
        List<OrderStatusTick> orderStatuses = session.liveWorld.buildOrderStatuses();
        List<OrderStatusTick> deliveredStatuses = session.liveWorld.buildDeliveredStatuses();
        List<OrderStatusTick> plannedStatuses = session.liveWorld.buildPlannedStatuses();
        if (plannedStatuses != null && !plannedStatuses.isEmpty()) {
            log.debug("[SIM:{}] Enviando planificados en tick: {}", session.id, plannedStatuses.stream().map(OrderStatusTick::orderId).toList());
        }

        // filtrar planes: solo pedidos activos (no planificados)
        Set<String> activeOrderIds = new HashSet<>();
        orderStatuses.forEach(os -> {
            String st = os.status() == null ? "" : os.status();
            if (!st.equalsIgnoreCase("PLANNED")) {
                activeOrderIds.add(os.orderId());
            }
        });

        List<SimulationOrderPlan> currentPlans = session.liveWorld.buildOrderPlansForTick().stream()
                .filter(p -> activeOrderIds.contains(p.orderId()))
                .toList();
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
        // calcular diff de planes
        Map<String, SimulationOrderPlan> currentMap = new HashMap<>();
        currentPlans.forEach(p -> currentMap.put(p.orderId(), p));
        List<SimulationOrderPlan> added = new ArrayList<>();
        List<SimulationOrderPlan> updated = new ArrayList<>();
        List<String> removed = new ArrayList<>();

        session.lastPlans.forEach((id, plan) -> {
            if (!currentMap.containsKey(id)) {
                removed.add(id);
            }
        });
        currentMap.forEach((id, plan) -> {
            SimulationOrderPlan prev = session.lastPlans.get(id);
            if (prev == null) {
                added.add(plan);
                // marcar planificados una sola vez
                if (session.liveWorld != null) {
                    var planned = new OrderStatusTick(id, "PLANNED", "", plan.routes() != null && !plan.routes().isEmpty()
                            ? plan.routes().stream().mapToInt(SimulationRoute::quantity).sum()
                            : 0);
                    session.liveWorld.registerPlanned(planned);
                    log.debug("[SIM:{}] Pedido planificado emitido una vez: {}", session.id, id);
                }
            } else if (!prev.equals(plan)) {
                updated.add(plan);
                if (session.liveWorld != null) {
                    var planned = new OrderStatusTick(id, "PLANNED", "", plan.routes() != null && !plan.routes().isEmpty()
                            ? plan.routes().stream().mapToInt(SimulationRoute::quantity).sum()
                            : 0);
                    session.liveWorld.registerPlanned(planned);
                    log.debug("[SIM:{}] Pedido planificado reemitido por actualización: {}", session.id, id);
                }
            }
        });
        log.debug("[SIM:{}] Diff planes -> added:{} updated:{} removed:{}", session.id, added.size(), updated.size(), removed.size());
        session.lastPlans = currentMap;
        OrderPlansDiff diff = new OrderPlansDiff(simTime, added, updated, removed);

        // orderPlans se envía vacío para reducir payload; diffs llevan los cambios
        List<SimulationOrderPlan> orderPlans = List.of();
        return new SimulationTick(session.id.toString(), simTime, realElapsedMs, speed, status, session.collapseMessage, orderPlans, diff, actives, airportTicks, deliveredOrders, inTransitOrders, orderStatuses, deliveredStatuses, plannedStatuses);
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

    private String topic(UUID simulationId) {
        return TOPIC_PREFIX + simulationId;
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
        private volatile long lastClientPingMillis = System.currentTimeMillis();
        private volatile String collapseMessage;

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
