package com.morapack.skyroute.controllers;

import com.morapack.skyroute.models.Vuelo;
import com.morapack.skyroute.services.VueloService;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/vuelos")
public class VueloController {

    private final VueloService service;

    public VueloController(VueloService service) {
        this.service = service;
    }

    @GetMapping
    public List<Vuelo> getAll() {
        return service.getAll();
    }

    @PostMapping
    public Vuelo create(@RequestBody Vuelo vuelo) {
        return service.create(vuelo);
    }
}

