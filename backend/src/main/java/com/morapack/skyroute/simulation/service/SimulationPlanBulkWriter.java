package com.morapack.skyroute.simulation.service;

import com.morapack.skyroute.models.OrderPlan;
import com.morapack.skyroute.models.Route;
import com.morapack.skyroute.models.RouteSegment;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.sql.PreparedStatement;
import java.sql.Statement;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

/**
 * Inserta planes/rutas/segmentos con JDBC batch para reducir overhead de JPA.
 */
@Component
public class SimulationPlanBulkWriter {

    private final JdbcTemplate jdbcTemplate;

    public SimulationPlanBulkWriter(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Transactional
    public void replaceChildren(long planId, List<OrderPlan> plans) {
        // Borramos hijos actuales
        jdbcTemplate.update("""
                delete from simulation_route_segment srs
                 where srs.route_id in (
                     select sr.id from simulation_route sr
                      where sr.order_plan_id in (
                          select sop.id from simulation_order_plan sop where sop.plan_id = ?
                      )
                 )
                """, planId);
        jdbcTemplate.update("""
                delete from simulation_route sr
                 where sr.order_plan_id in (
                     select sop.id from simulation_order_plan sop where sop.plan_id = ?
                 )
                """, planId);
        jdbcTemplate.update("delete from simulation_order_plan where plan_id = ?", planId);

        if (plans == null || plans.isEmpty()) {
            return;
        }

        for (OrderPlan op : plans) {
            long orderPlanId = insertOrderPlan(planId, op);
            if (op.getRoutes() == null) {
                continue;
            }
            for (Route route : op.getRoutes()) {
                long routeId = insertRoute(orderPlanId, route);
                if (route.getSegments() != null && !route.getSegments().isEmpty()) {
                    batchInsertSegments(routeId, route.getSegments());
                }
            }
        }
    }

    private long insertOrderPlan(long planId, OrderPlan op) {
        KeyHolder kh = new GeneratedKeyHolder();
        jdbcTemplate.update(con -> {
            PreparedStatement ps = con.prepareStatement(
                    "insert into simulation_order_plan(order_id, status, slack, plan_id) values (?,?,?,?)",
                    Statement.RETURN_GENERATED_KEYS
            );
            ps.setString(1, op.getOrderId());
            ps.setString(2, "WAITING");
            ps.setObject(3, safeDuration(op.getSlack()));
            ps.setLong(4, planId);
            return ps;
        }, kh);
        Number key = kh.getKey();
        if (key == null) {
            throw new IllegalStateException("No key returned for simulation_order_plan " + op.getOrderId());
        }
        return key.longValue();
    }

    private long insertRoute(long orderPlanId, Route route) {
        KeyHolder kh = new GeneratedKeyHolder();
        jdbcTemplate.update(con -> {
            PreparedStatement ps = con.prepareStatement(
                    "insert into simulation_route(quantity, slack, order_plan_id) values (?,?,?)",
                    Statement.RETURN_GENERATED_KEYS
            );
            ps.setInt(1, route.getQuantity());
            ps.setObject(2, safeDuration(route.getSlack()));
            ps.setLong(3, orderPlanId);
            return ps;
        }, kh);
        Number key = kh.getKey();
        if (key == null) {
            throw new IllegalStateException("No key returned for simulation_route");
        }
        return key.longValue();
    }

    private void batchInsertSegments(long routeId, List<RouteSegment> segments) {
        List<Object[]> params = new ArrayList<>(segments.size());
        for (RouteSegment seg : segments) {
            params.add(new Object[]{
                    seg.getFlight().getId(),
                    java.sql.Date.valueOf(seg.getDate()),
                    seg.getRouteQuantity(),
                    seg.isDeparted(),
                    seg.isArrived(),
                    seg.isReceivedByNext(),
                    seg.isFinalLeg(),
                    safeDuration(seg.getSlack()),
                    routeId
            });
        }
        jdbcTemplate.batchUpdate("""
                insert into simulation_route_segment(
                    flight_id, date, route_quantity, departed, arrived, received_by_next, final_leg, slack, route_id
                ) values (?,?,?,?,?,?,?,?,?)
                """, params);
    }

    private Duration safeDuration(Duration duration) {
        return duration == null ? Duration.ZERO : duration;
    }
}