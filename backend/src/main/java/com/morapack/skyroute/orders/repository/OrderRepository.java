package com.morapack.skyroute.orders.repository;

import com.morapack.skyroute.models.Order;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface OrderRepository extends JpaRepository<Order, String> {}
