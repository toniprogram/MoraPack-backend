package com.morapack.skyroute.operation.service;

import com.morapack.skyroute.models.CurrentPlan;
import com.morapack.skyroute.plan.service.PlanningService;
import com.morapack.skyroute.simulation.dto.SimulationMessage;
import com.morapack.skyroute.simulation.dto.ActiveSegment;
import com.morapack.skyroute.simulation.dto.ActiveAirportTick;
import com.morapack.skyroute.simulation.dto.OrderPlansDiff;
import com.morapack.skyroute.simulation.dto.SimulationOrderPlan;
import com.morapack.skyroute.simulation.dto.OrderStatusTick;
import com.morapack.skyroute.simulation.dto.SimulationPlanSummary;
import com.morapack.skyroute.simulation.dto.OrderLoadTick;
import com.morapack.skyroute.operation.live.LiveOperationWorld;
import com.morapack.skyroute.operation.dto.OperationTick;
import com.morapack.skyroute.operation.dto.GhostFlightTick;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.*;

@Slf4j
@Service
public class OperationSimulationService {

    private static final String TOPIC = "/topic/ops/current";
    private static final long TICK_PERIOD_MS = 60_000L;

    private final OperationService operationService;
    private final PlanningService planningService;
    private final SimpMessagingTemplate messagingTemplate;
    private final ScheduledExecutorService executor = Executors.newSingleThreadScheduledExecutor();
    private volatile LiveOperationWorld liveWorld;

    private volatile Instant lastStartInstant;
    private final AtomicBoolean running = new AtomicBoolean(false);
    private volatile java.util.concurrent.ScheduledFuture<?> ticker;
    private final Map<String, String> lastStatuses = new HashMap<>();

    public OperationSimulationService(OperationService operationService,
                                      PlanningService planningService,
                                      SimpMessagingTemplate messagingTemplate) {
        this.operationService = operationService;
        this.planningService = planningService;
        this.messagingTemplate = messagingTemplate;
    }

    /**
     * Inicializa o rehidrata el mundo de operación a la hora solicitada.
     */
    public synchronized void initialize(Instant simTime) {
        CurrentPlan plan = planningService.getCurrentPlan().orElse(null);
        if (plan == null) {
            log.warn("[OPS] No current plan found; ticker will not start");
            this.liveWorld = null;
            stop();
            return;
        }
        this.liveWorld = operationService.buildWorldFromCurrentPlan(plan, simTime);
        this.lastStartInstant = simTime != null ? simTime : Instant.now();
        log.info("[OPS] World initialized at {}", this.lastStartInstant);
        sendTickNow();
        start();
    }

    /**
     * Ajusta la hora simulada creando un nuevo mundo posicionado en simTime.
     */
    public void setSimTime(Instant simTime) {
        initialize(simTime);
    }

    private void start() {
        if (running.getAndSet(true)) {
            return;
        }
        // Cancela ticker previo si existiera
        if (ticker != null) {
            ticker.cancel(true);
        }
        ticker = executor.scheduleAtFixedRate(() -> {
            try {
                if (liveWorld == null) return;
                liveWorld.tick(60); // 60 segundos de simulación por tick

                // Construimos el OperationTick (DTO exclusivo de operación)
                OperationTick tick = buildTick(liveWorld);

                // Enviamos usando el método factory específico para operación
                messagingTemplate.convertAndSend(TOPIC,
                        SimulationMessage.operationProgress(liveWorld.getOperationId(), tick));
            } catch (Exception ex) {
                log.warn("[OPS] Error on tick: {}", ex.getMessage());
            }
        }, 0, TICK_PERIOD_MS, TimeUnit.MILLISECONDS);
    }

    public void stop() {
        running.set(false);
        if (ticker != null) {
            ticker.cancel(true);
            ticker = null;
        }
    }

    private void sendTickNow() {
        if (liveWorld == null) return;
        try {
            OperationTick tick = buildTick(liveWorld);
            messagingTemplate.convertAndSend(TOPIC,
                    SimulationMessage.operationProgress(liveWorld.getOperationId(), tick));
        } catch (Exception ex) {
            log.warn("[OPS] No se pudo enviar tick inmediato: {}", ex.getMessage());
        }
    }

    private OperationTick buildTick(LiveOperationWorld world) {
        // 1. Obtener segmentos CON carga (Lógica estándar)
        List<ActiveSegment> actives = world.toActiveSegments();

        // 2. Obtener segmentos VACÍOS (Nueva lógica para operación)
        List<GhostFlightTick> ghosts = world.toGhostFlights();

        Map<String, Integer> loads = world.getAirportLoads();
        Map<String, Map<String, Integer>> inventory = world.getAirportInventory();
        List<OrderStatusTick> orderStatuses = world.buildOrderStatuses();
        List<OrderStatusTick> deliveredStatuses = world.buildDeliveredStatuses();
        List<OrderStatusTick> plannedStatuses = world.buildPlannedStatuses();

        Map<String, String> statusMap = new HashMap<>();
        orderStatuses.forEach(os -> statusMap.put(os.orderId(), os.status()));
        List<String> nowInTransit = new ArrayList<>();
        statusMap.forEach((id, st) -> {
            String prev = lastStatuses.get(id);
            if (prev == null || !"IN_TRANSIT".equalsIgnoreCase(prev)) {
                if ("IN_TRANSIT".equalsIgnoreCase(st)) {
                    nowInTransit.add(id);
                }
            }
        });
        lastStatuses.clear();
        lastStatuses.putAll(statusMap);

        List<SimulationOrderPlan> currentPlans = world.buildOrderPlansForTick();
        List<SimulationPlanSummary> planSummaries = currentPlans.stream()
                .map(p -> new SimulationPlanSummary(
                        p.orderId(),
                        p.slackMinutes(),
                        p.routes() != null && !p.routes().isEmpty()
                                ? p.routes().get(0).segments()
                                : List.of()
                ))
                .toList();

        List<ActiveAirportTick> airportTicks = world.getAirports().values().stream()
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

        int deliveredOrders = world.countDeliveredOrders();
        int inTransitOrders = world.countInTransitOrders();

        // 3. Retornar el DTO de Operación con los segmentos vacíos inyectados
        return new OperationTick(
                world.getOperationId(),
                world.getCurrentSimTime(),
                TICK_PERIOD_MS,
                1.0,
                "running",
                List.of(), // orderPlans completo (opcional, enviamos vacío para ahorrar ancho de banda si no se usa)
                new OrderPlansDiff(world.getCurrentSimTime(), List.of(), List.of(), List.of()),
                actives,    // Segmentos cargados
                ghosts,     // Segmentos vacíos
                airportTicks,
                deliveredOrders,
                inTransitOrders,
                List.of(), // orderStatuses completo (opcional)
                List.of(), // deliveredStatuses
                List.of(), // plannedStatuses
                List.of(), // nowInTransitIds
                List.of(), // planSummaries
                List.of()  // changedOrderIds
        );
    }
}