package com.morapack.skyroute.controllers;

import com.morapack.skyroute.models.Flight;
import com.morapack.skyroute.services.FlightService;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/vuelos")
public class VueloController {

    private final FlightService service;

    public VueloController(FlightService service) {
        this.service = service;
    }

    @GetMapping
    public List<Flight> getAll() {
        return service.getAll();
    }

    @PostMapping
    public Flight create(@RequestBody Flight vuelo) {
        return service.create(vuelo);
    }
}

