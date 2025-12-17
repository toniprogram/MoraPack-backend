package com.morapack.skyroute.plan.repository;

import com.morapack.skyroute.models.CurrentPlan;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

@Repository
public interface CurrentPlanRepository extends JpaRepository<CurrentPlan, Long> {
    /**
     * Recupera un plan por ID y bloquea la fila en la base de datos (PESSIMISTIC_WRITE).
     * Esto evita que otros hilos o instancias lean/escriban esta fila hasta que la transacción termine.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT c FROM CurrentPlan c WHERE c.id = :id")
    Optional<CurrentPlan> findByIdWithLock(@Param("id") Long id);
}
