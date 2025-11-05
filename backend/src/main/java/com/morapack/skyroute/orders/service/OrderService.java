package com.morapack.skyroute.orders.service;

import com.morapack.skyroute.base.repository.AirportRepository;
import com.morapack.skyroute.models.Airport;
import com.morapack.skyroute.models.Order;
import com.morapack.skyroute.orders.dto.OrderRequest;
import com.morapack.skyroute.orders.repository.OrderRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.List;

@Service
public class OrderService {

    private final OrderRepository orderRepository;
    private final AirportRepository airportRepository;

    public OrderService(OrderRepository orderRepository, AirportRepository airportRepository) {
        this.orderRepository = orderRepository;
        this.airportRepository = airportRepository;
    }

    public List<Order> getAll() {
        return orderRepository.findAll();
    }

    public Order create(OrderRequest request) {
        validateRequest(request, true);
        if (orderRepository.existsById(request.id())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Order " + request.id() + " already exists");
        }
        Order order = buildOrderFromRequest(request);
        return orderRepository.save(order);
    }

    public Order update(String id, OrderRequest request) {
        Order existing = orderRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Order " + id + " not found"));
        validateRequest(request, false);
        Airport destination = airportRepository.findById(request.destinationAirportCode())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Destination airport not found: " + request.destinationAirportCode()));

        existing.setCustomerReference(request.customerReference());
        existing.setDestinationAirport(destination);
        existing.setQuantity(request.quantity());
        existing.setCreationUtc(request.creationUtc());
        existing.setDueUtc(request.dueUtc());
        return orderRepository.save(existing);
    }

    private Order buildOrderFromRequest(OrderRequest request) {
        Airport destination = airportRepository.findById(request.destinationAirportCode())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Destination airport not found: " + request.destinationAirportCode()));
        return new Order(
                request.id(),
                request.customerReference(),
                destination,
                request.quantity(),
                request.creationUtc(),
                request.dueUtc()
        );
    }

    private void validateRequest(OrderRequest request, boolean requireId) {
        if (request == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Request body is required");
        }
        if (requireId && isBlank(request.id())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "id is required");
        }
        if (isBlank(request.customerReference())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "customerReference is required");
        }
        if (isBlank(request.destinationAirportCode())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "destinationAirportCode is required");
        }
        if (request.quantity() == null || request.quantity() <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "quantity must be greater than zero");
        }
        Instant creation = request.creationUtc();
        Instant due = request.dueUtc();
        if (creation == null || due == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "creationUtc and dueUtc are required");
        }
        if (due.isBefore(creation)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "dueUtc must be after creationUtc");
        }
    }

    private boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }
}
