package com.morapack.skyroute.controllers;

import com.morapack.skyroute.models.Aeropuerto;
import com.morapack.skyroute.services.AeropuertoService;


import org.springframework.web.bind.annotation.*;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.List;
import java.util.Optional;

@RestController
@RequestMapping("/api/aeropuertos")
public class AeropuertoController {

    private final AeropuertoService service;

    public AeropuertoController(AeropuertoService service) {
        this.service = service;
    }

    @GetMapping
    public List<Aeropuerto> getAll() {
        return service.getAll();
    }

    @PostMapping
    public Aeropuerto create(@RequestBody Aeropuerto aeropuerto) {
        return service.create(aeropuerto);
    }
}