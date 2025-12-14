package com.morapack.skyroute.simulation.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "simulation_deliveries",
        indexes = {
                @Index(name = "idx_sim_delivery_sim_order", columnList = "simulationId,orderId"),
                @Index(name = "idx_sim_delivery_sim_time", columnList = "simulationId,lastDeliveredAt")
        })
@Getter
@Setter
@NoArgsConstructor
public class SimulationDelivery {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private UUID simulationId;

    @Column(nullable = false)
    private String orderId;

    @Column(nullable = false)
    private int deliveredQtyTotal;

    private String lastLocation;

    private Instant lastDeliveredAt;

    private Instant lastSimTime;

    @Column(nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    public SimulationDelivery(UUID simulationId,
                               String orderId,
                               int deliveredQtyTotal,
                               String lastLocation,
                               Instant lastDeliveredAt,
                               Instant lastSimTime) {
        this.simulationId = simulationId;
        this.orderId = orderId;
        this.deliveredQtyTotal = deliveredQtyTotal;
        this.lastLocation = lastLocation;
        this.lastDeliveredAt = lastDeliveredAt;
        this.lastSimTime = lastSimTime;
    }
}
