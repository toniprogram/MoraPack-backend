package com.morapack.skyroute.orders.controller;

import com.morapack.skyroute.models.Order;
import com.morapack.skyroute.orders.dto.OrderRequest;
import com.morapack.skyroute.orders.service.OrderService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/orders")
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
    public ResponseEntity<Order> create(@RequestBody OrderRequest request) {
        Order created = service.create(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @PutMapping("/{id}")
    public Order update(@PathVariable String id, @RequestBody OrderRequest request) {
        return service.update(id, request);
    }
}
