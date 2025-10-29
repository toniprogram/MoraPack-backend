package com.morapack.skyroute.repositories;

import com.morapack.skyroute.models.OrderPlan;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;
import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface OrderPlanRepository extends JpaRepository<OrderPlan, Long> {
    
    List<OrderPlan> findByStatus(String status);
    
    List<OrderPlan> findByCreatedAtBetween(LocalDateTime startDate, LocalDateTime endDate);
    
    @Query("SELECT op FROM OrderPlan op WHERE SIZE(op.routes) > 0")
    List<OrderPlan> findOrderPlansWithRoutes();
    
    @Query("SELECT op FROM OrderPlan op WHERE SIZE(op.routes) >= ?1")
    List<OrderPlan> findByMinimumRoutes(int minRoutes);
}
