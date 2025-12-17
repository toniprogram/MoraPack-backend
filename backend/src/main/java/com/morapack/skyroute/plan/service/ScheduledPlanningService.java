package com.morapack.skyroute.plan.service;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Service
public class ScheduledPlanningService {
    private static final Logger log = LoggerFactory.getLogger(ScheduledPlanningService.class);
    
    private final PlanningService planningService;

    public ScheduledPlanningService(PlanningService planningService) {
        this.planningService = planningService;
    }

    /**
     * Ejecuta la planificación automáticamente cada 60 segundos.
     * Si hay pedidos sin planificar, genera un nuevo plan.
     * Si no hay, simplemente pasa sin hacer nada.
     */
    @Scheduled(fixedDelay = 180000) // 180 segundos
    public void autoPlanScheduled() {
        try {
            log.info("[SCHEDULER] Ejecutando planificación automática...");
            planningService.run();
            log.info("[SCHEDULER] Planificación completada exitosamente");
        } catch (IllegalStateException e) {
            // Si no hay pedidos, es normal - no hacer nada
            log.debug("[SCHEDULER] No hay pedidos para planificar: {}", e.getMessage());
        } catch (Exception e) {
            log.error("[SCHEDULER] Error en planificación automática", e);
        }
    }
}
