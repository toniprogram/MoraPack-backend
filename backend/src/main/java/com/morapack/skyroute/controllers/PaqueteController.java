package com.morapack.skyroute.controllers;

import com.morapack.skyroute.models.Paquete;
import com.morapack.skyroute.services.PaqueteService;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/paquetes")
public class PaqueteController {

    private final PaqueteService service;

    public PaqueteController(PaqueteService service) {
        this.service = service;
    }

    @GetMapping
    public List<Paquete> getAll() {
        return service.getAll();
    }

    @PostMapping
    public Paquete create(@RequestBody Paquete paquete) {
        return service.create(paquete);
    }
}