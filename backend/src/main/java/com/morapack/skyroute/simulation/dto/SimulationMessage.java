package com.morapack.skyroute.simulation.dto;

import com.morapack.skyroute.operation.dto.OperationTick;
import java.util.List;

public record SimulationMessage(
        String simulationId,
        SimulationMessageType type,
        SimulationSnapshot snapshot,
        SimulationTick tick,            // Campo 4: Simulación pura
        OperationTick operationTick,    // Campo 5: Operación en vivo (NUEVO)
        String error,
        java.util.List<SimulationOrderPlan> orderDetailsUpdate
) {

    // 1. Progress normal (Simulación)
    public static SimulationMessage progress(String simulationId, SimulationSnapshot snapshot) {
        return new SimulationMessage(simulationId, SimulationMessageType.PROGRESS, snapshot, null, null, null, null);
    }

    // 2. Progress con Tick (Simulación)
    public static SimulationMessage progress(String simulationId, SimulationSnapshot snapshot, SimulationTick tick) {
        // Pasamos 'null' en operationTick (posición 5)
        return new SimulationMessage(simulationId, SimulationMessageType.PROGRESS, snapshot, tick, null, null, null);
    }

    // 3. Progress con Updates (Simulación)
    public static SimulationMessage progress(String simulationId, SimulationSnapshot snapshot, SimulationTick tick, java.util.List<SimulationOrderPlan> orderDetailsUpdate) {
        return new SimulationMessage(simulationId, SimulationMessageType.PROGRESS, snapshot, tick, null, null, orderDetailsUpdate);
    }

    // 4. Completed
    public static SimulationMessage completed(String simulationId, SimulationSnapshot snapshot) {
        return new SimulationMessage(simulationId, SimulationMessageType.COMPLETED, snapshot, null, null, null, null);
    }

    // 5. Error
    public static SimulationMessage error(String simulationId, String error) {
        return new SimulationMessage(simulationId, SimulationMessageType.ERROR, null, null, null, error, null);
    }

    // 6. NUEVO: Operation Progress
    public static SimulationMessage operationProgress(String opId, OperationTick opTick) {
        // Pasamos 'null' en tick (posición 4) y 'opTick' en operationTick (posición 5)
        return new SimulationMessage(opId, SimulationMessageType.PROGRESS, null, null, opTick, null, null);
    }
}