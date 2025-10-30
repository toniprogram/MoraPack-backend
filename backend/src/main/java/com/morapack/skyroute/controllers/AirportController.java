package com.morapack.skyroute.controllers;

import com.morapack.skyroute.models.Airport;
import com.morapack.skyroute.services.AirportService;


import org.springframework.web.bind.annotation.*;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.List;
import java.util.Optional;

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