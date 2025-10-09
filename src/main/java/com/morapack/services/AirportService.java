package com.morapack.services;

import com.morapack.models.Airport;
import com.morapack.repositories.AirportRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;

@Service
public class AirportService {
    
    @Autowired
    private AirportRepository airportRepository;
    
    public List<Airport> findAll() {
        return airportRepository.findAll();
    }
    
    public Optional<Airport> findById(Long id) {
        return airportRepository.findById(id);
    }
    
    public Airport save(Airport airport) {
        return airportRepository.save(airport);
    }
    
    public void deleteById(Long id) {
        airportRepository.deleteById(id);
    }
}
