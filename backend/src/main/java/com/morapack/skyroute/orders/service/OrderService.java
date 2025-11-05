package com.morapack.skyroute.orders.service;

import com.morapack.skyroute.models.Order;
import com.morapack.skyroute.orders.repository.OrderRepository;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class OrderService {
    private final OrderRepository repo;

    public OrderService(OrderRepository repo) {
        this.repo = repo;
    }

    public List<Order> getAll() {
        return repo.findAll();
    }

    public Order create(Order order) {
        return repo.save(order);
    }

    public Order update(String id, Order updated) {
        Order existing = repo.findById(id)
            .orElseThrow(() -> new IllegalArgumentException("Order not found"));
        existing.setDestinationAirport(updated.getDestinationAirport());
        existing.setQuantity(updated.getQuantity());
        return repo.save(existing);
    }
}
