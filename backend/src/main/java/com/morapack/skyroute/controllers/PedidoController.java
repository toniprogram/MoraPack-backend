package com.morapack.skyroute.controllers;

import com.morapack.skyroute.models.Pedido;
import com.morapack.skyroute.services.PedidoService;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/pedidos")
public class PedidoController {

    private final PedidoService service;

    public PedidoController(PedidoService service) {
        this.service = service;
    }

    @GetMapping
    public List<Pedido> getAll() {
        return service.getAll();
    }

    @PostMapping
    public Pedido create(@RequestBody Pedido pedido) {
        return service.create(pedido);
    }

    @PutMapping("/{id}")
    public Pedido update(@PathVariable Long id, @RequestBody Pedido pedido) {
        return service.update(id, pedido);
    }
}
