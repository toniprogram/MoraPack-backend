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

    public Order create(Order pedido) {
        return repo.save(pedido);
    }

    public Order update(String id, Order nuevo) {
        Order existente = repo.findById(id)
            .orElseThrow(() -> new IllegalArgumentException("Pedido no encontrado"));
        existente.setDestinationAirport(nuevo.getDestinationAirport());
        existente.setQuantity(nuevo.getQuantity());
        return repo.save(existente);
    }
}
