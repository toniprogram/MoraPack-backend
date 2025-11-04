package com.morapack.skyroute.config;

import java.io.IOException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;

import com.morapack.skyroute.io.*;
import com.morapack.skyroute.models.*;

public class World implements Orders.Observer {
    private static World instance;
    private final Airports airports;
    private final Flights flights;
    private final Orders orders;
    private final AirportSchedule airportSchedule;
    private Instant currentInstant = Instant.EPOCH;

    public static synchronized World getInstance() {
        if (instance == null) {
            instance = new World();
        }
        return instance;
    }

    private World() {
        try{
            this.airports = Airports.load(Config.PATH_AEROPUERTOS);
        } catch (IOException e) {
            throw new RuntimeException("Error loading airports", e);
        }
        try{
            this.flights = Flights.load(Config.PATH_VUELOS, airports);
        } catch (IOException e) {
            throw new RuntimeException("Error loading flights", e);
        }
        
        try{
            this.orders = Orders.open(Config.PATH_ORDENES, airports);
        } catch (IOException e) {
            throw new RuntimeException("Error loading orders", e);
        }
        
        this.orders.setObserver(this);
        this.airportSchedule = new AirportSchedule(this.airports.asMap());
    }

    public Airports getAirports() {
        return airports;
    }

    public Flights getFlights() {
        return flights;
    }

    public Orders getOrders() {
        return orders;
    }

    public AirportSchedule getAirportSchedule() {
        return airportSchedule;
    }

    public Instant getCurrentInstant() {
        return currentInstant;
    }

    @Override
    public synchronized void onOrderRead(Order order) {
        advanceTo(order.getCreationUtc());
    }

    public synchronized void advanceTo(Instant instant) {
        if (instant == null) {
            return;
        }
        currentInstant = instant;
        cleanupState(currentInstant);
    }

    private void cleanupState(Instant now) {
        cleanupWarehouses(now);
        cleanupFlights(now);
    }

    private void cleanupWarehouses(Instant now) {
        for (Airport airport : airports.asMap().values()) {
            LocalDateTime localNow = LocalDateTime.ofInstant(now, airport.getZoneOffset());
            airportSchedule.cleanupUntil(airport.code, localNow);
        }
    }

    private void cleanupFlights(Instant now) {
        var schedule = flights.getSchedule();
        for (Flight flight : flights.getAll()) {
            ZoneOffset offset = flight.getOrigin().getZoneOffset();
            LocalDate currentDate = LocalDateTime.ofInstant(now, offset).toLocalDate();
            schedule.purgeBefore(flight, currentDate);
        }
    }
}
