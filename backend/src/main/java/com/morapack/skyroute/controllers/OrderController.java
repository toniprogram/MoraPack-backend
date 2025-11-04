package com.morapack.skyroute.controllers;

import com.morapack.skyroute.models.Order;
import com.morapack.skyroute.services.OrderService;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/pedidos")
public class OrderController {

    private final OrderService service;

    public OrderController(OrderService service) {
        this.service = service;
    }

    @GetMapping
    public List<Order> getAll() {
        return service.getAll();
    }

    @PostMapping
    public Order create(@RequestBody Order pedido) {
        return service.create(pedido);
    }

    @PutMapping("/{id}")
    public Order update(@PathVariable String id, @RequestBody Order pedido) {
        return service.update(id, pedido);
    }
}
