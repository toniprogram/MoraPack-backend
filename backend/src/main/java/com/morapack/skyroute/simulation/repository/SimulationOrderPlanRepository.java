package com.morapack.skyroute.simulation.repository;

import com.morapack.skyroute.simulation.model.SimulationOrderPlan;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

public interface SimulationOrderPlanRepository extends JpaRepository<SimulationOrderPlan, Long> {

    @Modifying
    @Transactional
    @Query("""
            update SimulationOrderPlan sop
               set sop.status = :status
             where sop.orderId = :orderId
               and sop.plan.simulationId = :simulationId
            """)
    int updateStatus(@Param("simulationId") String simulationId,
                     @Param("orderId") String orderId,
                     @Param("status") String status);

    @Modifying
    @Transactional
    @Query("""
            update SimulationOrderPlan sop
               set sop.status = :status
             where sop.plan.simulationId = :simulationId
               and sop.orderId in :orderIds
            """)
    int updateStatusBulk(@Param("simulationId") String simulationId,
                         @Param("status") String status,
                         @Param("orderIds") java.util.Collection<String> orderIds);

    org.springframework.data.domain.Page<SimulationOrderPlan> findByPlanSimulationId(String simulationId,
                                                                                     org.springframework.data.domain.Pageable pageable);

    org.springframework.data.domain.Page<SimulationOrderPlan> findByPlanSimulationIdAndOrderIdContainingIgnoreCase(String simulationId,
                                                                                                                   String orderId,
                                                                                                                   org.springframework.data.domain.Pageable pageable);

    org.springframework.data.domain.Page<SimulationOrderPlan> findByPlanSimulationIdAndStatusIn(String simulationId,
                                                                                                java.util.Collection<String> status,
                                                                                                org.springframework.data.domain.Pageable pageable);

    org.springframework.data.domain.Page<SimulationOrderPlan> findByPlanSimulationIdAndStatusInAndOrderIdContainingIgnoreCase(String simulationId,
                                                                                                                              java.util.Collection<String> status,
                                                                                                                              String orderId,
                                                                                                                              org.springframework.data.domain.Pageable pageable);
}
