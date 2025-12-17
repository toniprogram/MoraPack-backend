package com.morapack.skyroute.simulation.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.morapack.skyroute.simulation.dto.SimulationOrderPlan;
import com.morapack.skyroute.simulation.dto.SimulationOrderPlanItem;
import com.morapack.skyroute.simulation.dto.SimulationOrderPlanPage;
import com.morapack.skyroute.simulation.dto.SimulationRoute;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Read model writer/reader for simulation_order_plan_read (JSONB + no FKs).
 *
 * Tabla esperada (PostgreSQL):
 *
 * create table simulation_order_plan_read (
 *   simulation_id varchar not null,
 *   order_id varchar not null,
 *   status varchar not null,
 *   slack_minutes bigint not null,
 *   routes jsonb not null,
 *   creation_utc timestamptz,
 *   updated_at timestamptz default now(),
 *   primary key (simulation_id, order_id)
 * );
 */
@Component
public class SimulationOrderPlanReadWriter {

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    public SimulationOrderPlanReadWriter(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public void upsertReadModel(String simulationId, List<SimulationOrderPlan> changes) {
        if (changes == null || changes.isEmpty()) {
            return;
        }
        List<Object[]> params = new ArrayList<>(changes.size());
        for (SimulationOrderPlan plan : changes) {
            params.add(new Object[]{
                    simulationId,
                    plan.orderId(),
                    "WAITING",
                    plan.slackMinutes(),
                    toJson(plan.routes()),
                    plan.creationUtc() != null ? Timestamp.from(plan.creationUtc()) : null
            });
        }
        jdbcTemplate.batchUpdate("""
                insert into simulation_order_plan_read
                (simulation_id, order_id, status, slack_minutes, routes, creation_utc, updated_at)
                values (?, ?, ?, ?, ?::jsonb, ?, now())
                on conflict (simulation_id, order_id) do update
                set status = simulation_order_plan_read.status, -- no degradar estados existentes
                    slack_minutes = excluded.slack_minutes,
                    routes = excluded.routes,
                    creation_utc = coalesce(excluded.creation_utc, simulation_order_plan_read.creation_utc),
                    updated_at = now()
                """, params);
    }

    public SimulationOrderPlanPage getPage(String simulationId,
                                           int page,
                                           int size,
                                           String search,
                                           List<String> statuses) {
        int sanitizedPage = Math.max(0, page);
        int sanitizedSize = Math.min(Math.max(1, size), 200);
        int offset = sanitizedPage * sanitizedSize;

        StringBuilder sql = new StringBuilder("""
                select order_id, status, slack_minutes, routes, creation_utc
                  from simulation_order_plan_read
                 where simulation_id = ?
                """);
        List<Object> args = new ArrayList<>();
        args.add(simulationId);

        if (statuses != null && !statuses.isEmpty()) {
            String inClause = statuses.stream().map(s -> "?").collect(Collectors.joining(","));
            sql.append(" and status in (").append(inClause).append(")");
            args.addAll(statuses);
        }
        if (search != null && !search.isBlank()) {
            sql.append(" and order_id ilike ?");
            args.add("%" + search + "%");
        }
        sql.append(" order by order_id asc limit ? offset ?");
        args.add(sanitizedSize);
        args.add(offset);

        List<SimulationOrderPlanItem> items = jdbcTemplate.query(sql.toString(), args.toArray(), new ReadRowMapper());

        Long total = jdbcTemplate.queryForObject(
                "select count(*) from simulation_order_plan_read where simulation_id = ?",
                Long.class,
                simulationId
        );

        return new SimulationOrderPlanPage(
                total != null ? total : 0L,
                sanitizedPage,
                sanitizedSize,
                items
        );
    }

    @Transactional
    public void markDelivered(String simulationId, String orderId) {
        if (simulationId == null || orderId == null) {
            return;
        }
        jdbcTemplate.update("""
                insert into simulation_order_plan_read
                    (simulation_id, order_id, status, slack_minutes, routes, creation_utc, updated_at)
                values (?,?,?,?, '[]'::jsonb, null, now())
                on conflict (simulation_id, order_id) do update
                  set status = 'DELIVERED',
                      slack_minutes = excluded.slack_minutes,
                      routes = excluded.routes,
                      updated_at = now()
                """,
                simulationId,
                orderId,
                "DELIVERED",
                0L
        );
    }

    @Transactional
    public void updateStatuses(String simulationId, Map<String, String> statusChanges) {
        if (simulationId == null || statusChanges == null || statusChanges.isEmpty()) {
            return;
        }
        List<Object[]> params = statusChanges.entrySet().stream()
                .map(e -> new Object[]{
                        simulationId,
                        e.getKey(),
                        e.getValue()
                })
                .toList();
        jdbcTemplate.batchUpdate("""
                insert into simulation_order_plan_read
                    (simulation_id, order_id, status, slack_minutes, routes, creation_utc, updated_at)
                values (?,?,?, 0, '[]'::jsonb, null, now())
                on conflict (simulation_id, order_id) do update
                  set status = excluded.status,
                      updated_at = now()
                """, params);
    }

    private String toJson(List<SimulationRoute> routes) {
        try {
            return objectMapper.writeValueAsString(routes == null ? List.of() : routes);
        } catch (Exception ex) {
            throw new IllegalStateException("Could not serialize routes to JSON", ex);
        }
    }

    private List<SimulationRoute> fromJson(String json) {
        try {
            return objectMapper.readValue(json, objectMapper.getTypeFactory().constructCollectionType(List.class, SimulationRoute.class));
        } catch (Exception ex) {
            throw new IllegalStateException("Could not deserialize routes JSON", ex);
        }
    }

    private class ReadRowMapper implements RowMapper<SimulationOrderPlanItem> {
        @Override
        public SimulationOrderPlanItem mapRow(ResultSet rs, int rowNum) throws SQLException {
            String orderId = rs.getString("order_id");
            String status = rs.getString("status");
            long slackMinutes = rs.getLong("slack_minutes");
            String routesJson = rs.getString("routes");
            Timestamp created = rs.getTimestamp("creation_utc");
            List<SimulationRoute> routes = fromJson(routesJson);
            Instant creationUtc = created != null ? created.toInstant() : null;
            return new SimulationOrderPlanItem(orderId, status, slackMinutes, routes, creationUtc);
        }
    }
}
