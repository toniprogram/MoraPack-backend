package com.morapack.skyroute.services;

import com.morapack.skyroute.algorithm.*;
import com.morapack.skyroute.models.*;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.Collections;
import java.util.stream.Collectors;

@Component
public class Mapper {

    public CurrentPlan toEntity(Individual ind) {
        CurrentPlan p = new CurrentPlan();
        p.setGeneratedAt(LocalDateTime.now());
        p.setFitness(ind.getFitness());
        p.setOrderPlans(
            ind.getPlans().stream()
                .map(orderPlan -> mapOrderPlan(orderPlan, p))
                .collect(Collectors.toList())
        );
        /*p.setOrderPlans(
            ind.getPlans().stream()
                .map(this::mapOrderPlan)
                .collect(Collectors.toList())
        );*/
        return p;
    }

        
    private OrderPlan mapOrderPlan(OrderPlan original, CurrentPlan parentPlan) {
        OrderPlan copy = new OrderPlan();
        copy.setOrderId(original.getOrderId());
        copy.setSlack(original.getSlack());
        copy.setPlan(parentPlan);

        if (original.getRoutes() != null) {
            copy.setRoutes(
                original.getRoutes().stream()
                        .map(this::mapRoute)
                        .collect(Collectors.toList())
            );
        } else {
            copy.setRoutes(Collections.emptyList());
        }

        return copy;
    }

    private Route mapRoute(Route original) {
        Route copy = new Route();
        copy.setQuantity(original.getQuantity());
        copy.setSlack(original.getSlack());

        if (original.getSegments() != null) {
            copy.setSegments(
                original.getSegments().stream()
                        .map(this::mapRouteSegment)
                        .collect(Collectors.toList())
            );
        } else {
            copy.setSegments(Collections.emptyList());
        }

        return copy;
    }

    private RouteSegment mapRouteSegment(RouteSegment original) {
        RouteSegment copy = new RouteSegment();

        copy.setFlight(original.getFlight()); // se asume que Flight ya existe en BD
        copy.setDate(original.getDate());
        copy.setRouteQuantity(original.getRouteQuantity());
        copy.setDeparted(original.isDeparted());
        copy.setArrived(original.isArrived());
        copy.setReceivedByNext(original.isReceivedByNext());
        copy.setFinalLeg(original.isFinalLeg());
        copy.setSlack(original.getSlack());

        return copy;
    }
    

}