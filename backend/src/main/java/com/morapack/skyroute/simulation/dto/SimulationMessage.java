package com.morapack.skyroute.simulation.dto;

public record SimulationMessage(
        String simulationId,
        SimulationMessageType type,
        SimulationSnapshot snapshot,
        SimulationTick tick,
        String error,
        java.util.List<SimulationOrderPlan> orderDetailsUpdate
) {

    public static SimulationMessage progress(String simulationId, SimulationSnapshot snapshot) {
        return new SimulationMessage(simulationId, SimulationMessageType.PROGRESS, snapshot, null, null, null);
    }

    public static SimulationMessage progress(String simulationId, SimulationSnapshot snapshot, SimulationTick tick) {
        return new SimulationMessage(simulationId, SimulationMessageType.PROGRESS, snapshot, tick, null, null);
    }

    public static SimulationMessage progress(String simulationId, SimulationSnapshot snapshot, SimulationTick tick, java.util.List<SimulationOrderPlan> orderDetailsUpdate) {
        return new SimulationMessage(simulationId, SimulationMessageType.PROGRESS, snapshot, tick, null, orderDetailsUpdate);
    }

    public static SimulationMessage completed(String simulationId, SimulationSnapshot snapshot) {
        return new SimulationMessage(simulationId, SimulationMessageType.COMPLETED, snapshot, null, null, null);
    }

    public static SimulationMessage error(String simulationId, String error) {
        return new SimulationMessage(simulationId, SimulationMessageType.ERROR, null, null, error, null);
    }
}
