package com.morapack.skyroute.operation.service;

import com.morapack.skyroute.config.Config;
import com.morapack.skyroute.models.CurrentPlan;
import com.morapack.skyroute.models.Flight;
import com.morapack.skyroute.models.OrderPlan;
import com.morapack.skyroute.models.Route;
import com.morapack.skyroute.models.RouteSegment;
import com.morapack.skyroute.base.repository.AirportRepository;
import com.morapack.skyroute.base.repository.FlightRepository;
import com.morapack.skyroute.plan.service.WorldBuilder;
import com.morapack.skyroute.simulation.live.LiveAirport;
import com.morapack.skyroute.simulation.live.LiveFlight;
import com.morapack.skyroute.simulation.live.LiveOperationWorld;
import com.morapack.skyroute.simulation.dto.OrderStatusTick;
import org.springframework.stereotype.Service;
import lombok.extern.slf4j.Slf4j;

import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;

@Service
@Slf4j
public class OperationService {

    private final WorldBuilder worldBuilder;
    private final AirportRepository airportRepository;
    private final FlightRepository flightRepository;

    public OperationService(WorldBuilder worldBuilder,
                            AirportRepository airportRepository,
                            FlightRepository flightRepository) {
        this.worldBuilder = worldBuilder;
        this.airportRepository = airportRepository;
        this.flightRepository = flightRepository;
    }

    public LiveOperationWorld buildWorldFromCurrentPlan(CurrentPlan plan, Instant requestedStart) {
        if (plan == null || plan.getOrderPlans() == null) {
            return null;
        }

        log.info("[OPS] Construyendo MUNDO OPERATIVO desde plan con {} pedidos", plan.getOrderPlans().size());

        // 1. Calcular inicio global de la simulación
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

        // 2. Cargar Aeropuertos y Mapa de Continentes
        Map<String, LiveAirport> liveAirports = new HashMap<>();
        Map<String, String> airportContinents = new HashMap<>();

        airportRepository.findAll().forEach(a -> {
            liveAirports.put(a.getCode(), new LiveAirport(
                    a.getCode(), a.getStorageCapacity(), a.getLatitude(), a.getLongitude()
            ));
            // Guardamos el continente para reglas de negocio (fallback a UNKNOWN si es nulo)
            airportContinents.put(a.getCode(), a.getContinent() != null ? a.getContinent().toUpperCase() : "UNKNOWN");
        });

        LiveOperationWorld liveWorld = new LiveOperationWorld("ops-current", startInstant, liveAirports);

        // 3. Mapa para no duplicar instancias de vuelo en memoria
        Map<String, LiveFlight> uniqueFlightsMap = new HashMap<>();

        // 4. Procesar Pedidos
        for (OrderPlan op : plan.getOrderPlans()) {
            int totalQty = op.getRoutes() == null ? 0 : op.getRoutes().stream().mapToInt(Route::getQuantity).sum();
            if (totalQty <= 0) continue;

            String destCode = null;
            boolean isIntercontinental = false;
            Instant maxPlannedArrival = startInstant; // Para rastrear cuándo termina realmente el plan

            if (op.getRoutes() != null) {
                // Analizar rutas para determinar destino, tipo de vuelo y tiempo máximo
                for (Route route : op.getRoutes()) {
                    if (route.getSegments() != null && !route.getSegments().isEmpty()) {
                        // A) Determinar destino (tomamos el del último segmento)
                        RouteSegment lastSeg = route.getSegments().get(route.getSegments().size() - 1);
                        if (lastSeg.getFlight() != null && lastSeg.getFlight().getDestination() != null) {
                            destCode = lastSeg.getFlight().getDestination().getCode();
                        }

                        // B) Calcular llegada planificada de esta ruta
                        if (lastSeg.getFlight() != null && lastSeg.getDate() != null) {
                            Instant arr = lastSeg.getFlight().getArrivalInstant(lastSeg.getDate());
                            // Sumamos el dwell time para ser precisos con el momento de "Delivery"
                            Instant completion = arr.plus(Config.WAREHOUSE_DWELL);
                            if (completion.isAfter(maxPlannedArrival)) {
                                maxPlannedArrival = completion;
                            }
                        }

                        // C) Chequeo Intercontinental: Origen de la ruta vs Destino Final
                        RouteSegment firstSeg = route.getSegments().get(0);
                        if (destCode != null && firstSeg.getFlight() != null && firstSeg.getFlight().getOrigin() != null) {
                            String originCode = firstSeg.getFlight().getOrigin().getCode();
                            String originCont = airportContinents.getOrDefault(originCode, "A");
                            String destCont = airportContinents.getOrDefault(destCode, "B");

                            if (!originCont.equals(destCont)) {
                                isIntercontinental = true;
                            }
                        }
                    }
                }
            }

            // --- CÁLCULO DE DEADLINE "SIEMPRE POSITIVO" ---
            // 1. Calculamos el SLA teórico (Regla de Negocio)
            long slaHours = isIntercontinental ? 72 : 48;
            Instant standardDeadline = startInstant.plus(Duration.ofHours(slaHours));

            // 2. Calculamos el Deadline Técnico (Planificación + Buffer de 60 min)
            Instant plannedDeadline = maxPlannedArrival.plus(Duration.ofMinutes(60));

            // 3. El Deadline final es el mayor de los dos.
            // Si el plan es rápido, mantenemos el SLA de 48h (dando mucha holgura).
            // Si el plan es lento (ej. 3 días), extendemos el deadline para cubrir el plan (holgura pequeña pero positiva).
            Instant finalDueUtc = standardDeadline.isAfter(plannedDeadline) ? standardDeadline : plannedDeadline;

            liveWorld.registerOrderBasic(op.getOrderId(), totalQty, destCode, startInstant, finalDueUtc);

            // Registrar estado inicial visual
            liveWorld.registerPlanned(new OrderStatusTick(op.getOrderId(), "PLANNED", destCode != null ? destCode : "", totalQty));

            // Programar vuelos en el simulador
            if (op.getRoutes() == null) continue;
            for (Route route : op.getRoutes()) {
                if (route.getSegments() == null) continue;
                for (RouteSegment seg : route.getSegments()) {
                    Flight flightData = seg.getFlight();
                    if (flightData == null || seg.getDate() == null) continue;

                    String uniqueKey = flightData.getId() + "_" + seg.getDate().toString();
                    LiveFlight liveFlight = uniqueFlightsMap.get(uniqueKey);

                    if (liveFlight == null) {
                        Instant dep = flightData.getDepartureInstant(seg.getDate());
                        Instant arr = flightData.getArrivalInstant(seg.getDate());
                        liveFlight = new LiveFlight(
                                flightData.getId(),
                                flightData.getOrigin().getCode(),
                                flightData.getDestination().getCode(),
                                dep, arr, flightData.getDailyCapacity()
                        );
                        uniqueFlightsMap.put(uniqueKey, liveFlight);
                    }
                    liveWorld.scheduleFutureFlight(liveFlight, op.getOrderId(), seg.getRouteQuantity());
                }
            }
        }

        // 5. Fast Forward si se solicita
        if (requestedStart != null && requestedStart.isAfter(startInstant)) {
            long seconds = java.time.Duration.between(startInstant, requestedStart).getSeconds();
            if (seconds > 0) {
                log.info("[OPS] Fast Forwarding world by {} seconds", seconds);
                liveWorld.tick(seconds);
            }
        }

        return liveWorld;
    }
}