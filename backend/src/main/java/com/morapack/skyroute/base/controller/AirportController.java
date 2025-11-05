package com.morapack.skyroute.base.controller;

import com.morapack.skyroute.models.Airport;
import com.morapack.skyroute.base.service.AirportService;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/aeropuertos")
public class AirportController {

    private final AirportService service;

    public AirportController(AirportService service) {
        this.service = service;
    }

    @GetMapping
    public List<Airport> getAll() {
        return service.getAll();
    }

    @PostMapping
    public Airport create(@RequestBody Airport aeropuerto) {
        return service.create(aeropuerto);
    }
}
