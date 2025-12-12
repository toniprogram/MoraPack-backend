package com.morapack.skyroute.simulation.repository;

import com.morapack.skyroute.simulation.model.SimulationDelivery;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface SimulationDeliveryRepository extends JpaRepository<SimulationDelivery, UUID> {
    Optional<SimulationDelivery> findBySimulationIdAndOrderId(UUID simulationId, String orderId);

    Page<SimulationDelivery> findBySimulationId(UUID simulationId, Pageable pageable);

    Page<SimulationDelivery> findBySimulationIdAndOrderIdContainingIgnoreCase(UUID simulationId, String orderId, Pageable pageable);
}
