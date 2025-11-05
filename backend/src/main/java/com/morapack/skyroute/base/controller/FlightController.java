package com.morapack.skyroute.base.controller;

import com.morapack.skyroute.models.Flight;
import com.morapack.skyroute.base.service.FlightService;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/vuelos")
public class FlightController {

    private final FlightService service;

    public FlightController(FlightService service) {
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
