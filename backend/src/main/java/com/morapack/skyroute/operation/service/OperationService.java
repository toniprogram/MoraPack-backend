package com.morapack.skyroute.operation.service;

import com.morapack.skyroute.config.World;
import com.morapack.skyroute.models.CurrentPlan;
import com.morapack.skyroute.models.Flight;
import com.morapack.skyroute.models.OrderPlan;
import com.morapack.skyroute.models.Route;
import com.morapack.skyroute.models.RouteSegment;
import com.morapack.skyroute.plan.service.WorldBuilder;
import com.morapack.skyroute.simulation.live.LiveAirport;
import com.morapack.skyroute.simulation.live.LiveFlight;
import com.morapack.skyroute.simulation.live.LiveSimulationWorld;
import com.morapack.skyroute.simulation.dto.OrderStatusTick;
import org.springframework.stereotype.Service;
import lombok.extern.slf4j.Slf4j;

import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
@Slf4j
public class OperationService {

    private final WorldBuilder worldBuilder;

    public OperationService(WorldBuilder worldBuilder) {
        this.worldBuilder = worldBuilder;
    }

    /**
     * Construye un LiveSimulationWorld a partir del plan persistido (CurrentPlan).
     * No inicia ticker ni sesión; sólo prepara el mundo en memoria para operar.
     * @param plan Plan vigente persistido.
     * @param requestedStart Instant solicitado para posicionar el mundo (puede ser null).
     */
    public LiveSimulationWorld buildWorldFromCurrentPlan(CurrentPlan plan, Instant requestedStart) {
        if (plan == null || plan.getOrderPlans() == null) {
            return null;
        }

        log.info("[OPS] Construyendo mundo desde plan con {} pedidos", plan.getOrderPlans().size());
        plan.getOrderPlans().forEach(op -> {
            int qtyTotal = op.getRoutes() == null ? 0 : op.getRoutes().stream().mapToInt(Route::getQuantity).sum();
            log.info("[OPS] Pedido {} qtyTotal={} rutas={}", op.getOrderId(), qtyTotal, op.getRoutes() != null ? op.getRoutes().size() : 0);
            if (op.getRoutes() != null) {
                op.getRoutes().forEach(r -> {
                    log.info("  Ruta qty={} segments={}", r.getQuantity(), r.getSegments() != null ? r.getSegments().size() : 0);
                    if (r.getSegments() != null) {
                        r.getSegments().forEach(seg -> {
                            Flight f = seg.getFlight();
                            log.info("    Seg flight={} date={} qty={}", f != null ? f.getId() : "N/A", seg.getDate(), seg.getRouteQuantity());
                        });
                    }
                });
            }
        });

        // Instante de arranque: el más temprano de las salidas encontradas; si no hay, ahora.
        Instant earliestDep = null;
        for (OrderPlan op : plan.getOrderPlans()) {
            if (op.getRoutes() == null) continue;
            for (Route route : op.getRoutes()) {
                if (route.getSegments() == null) continue;
                for (RouteSegment seg : route.getSegments()) {
                    Flight flight = seg.getFlight();
                    if (flight == null || seg.getDate() == null) continue;
                    Instant dep = flight.getDepartureInstant(seg.getDate());
                    if (dep != null && (earliestDep == null || dep.isBefore(earliestDep))) {
                        earliestDep = dep;
                    }
                }
            }
        }
        Instant startInstant = earliestDep != null ? earliestDep : Instant.now();

        // Aeropuertos base con capacidades
        World baseWorld = worldBuilder.buildBaseWorld(startInstant);
        Map<String, LiveAirport> liveAirports = new HashMap<>();
        baseWorld.getAirports().asMap().forEach((code, airport) -> {
            liveAirports.put(code, new LiveAirport(code, airport.getStorageCapacity(), airport.getLatitude(), airport.getLongitude()));
        });

        LiveSimulationWorld liveWorld = new LiveSimulationWorld("ops-current", startInstant, liveAirports, List.of());

        // Registrar pedidos y planificar sus vuelos según el plan guardado
        for (OrderPlan op : plan.getOrderPlans()) {
            int totalQty = op.getRoutes() == null ? 0 : op.getRoutes().stream().mapToInt(Route::getQuantity).sum();
            if (totalQty <= 0) continue;
            String destCode = null;
            if (op.getRoutes() != null) {
                for (Route route : op.getRoutes()) {
                    if (route.getSegments() == null) continue;
                    for (RouteSegment seg : route.getSegments()) {
                        Flight flight = seg.getFlight();
                        if (flight != null && flight.getDestination() != null) {
                            destCode = flight.getDestination().getCode();
                        }
                    }
                }
            }
            liveWorld.registerOrderBasic(op.getOrderId(), totalQty, destCode, startInstant, startInstant.plus(Duration.ofHours(6)));
            // Marca como planificado para que el frontend lo reciba en plannedStatuses
            liveWorld.registerPlanned(new OrderStatusTick(op.getOrderId(), "PLANNED", destCode != null ? destCode : "", totalQty));

            if (op.getRoutes() == null) continue;
            for (Route route : op.getRoutes()) {
                if (route.getSegments() == null) continue;
                for (RouteSegment seg : route.getSegments()) {
                    Flight flight = seg.getFlight();
                    if (flight == null || seg.getDate() == null) continue;
                    Instant dep = flight.getDepartureInstant(seg.getDate());
                    Instant arr = flight.getArrivalInstant(seg.getDate());
                    int cap = flight.getDailyCapacity();
                    LiveFlight lf = new LiveFlight(
                            flight.getId(),
                            flight.getOrigin().getCode(),
                            flight.getDestination().getCode(),
                            dep,
                            arr,
                            cap
                    );
                    liveWorld.scheduleFutureFlight(lf, op.getOrderId(), seg.getRouteQuantity());
                }
            }
        }

        // Si se solicitó una hora posterior, avanzamos el mundo para reflejar entregas/estados a ese instante.
        if (requestedStart != null && requestedStart.isAfter(startInstant)) {
            long seconds = java.time.Duration.between(startInstant, requestedStart).getSeconds();
            if (seconds > 0) {
                liveWorld.tick(seconds);
            }
        }

        return liveWorld;
    }
}
