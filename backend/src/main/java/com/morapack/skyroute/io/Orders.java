package com.morapack.skyroute.io;

import java.io.BufferedReader;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.DateTimeException;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.YearMonth;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;

import com.morapack.skyroute.config.*;
import com.morapack.skyroute.models.*;

public class Orders implements AutoCloseable {
    private final BufferedReader reader;
    private final Airports airports;
    private final List<Order> activeOrders = new ArrayList<>();
    private final Map<String, Order> byId = new HashMap<>();
    private Observer observer;
    private YearMonth currentMonth = Config.BASE_DATE;
    private LocalDateTime lastCreationLocal;

    public Orders(BufferedReader reader, Airports airports) {
        this.reader = reader;
        this.airports = airports;
    }

    public static Orders open(Path path, Airports airports) throws IOException {
        BufferedReader bufferedReader = Files.newBufferedReader(path);
        return new Orders(bufferedReader, airports);
    }

    public Order next() throws IOException {
        String rawLine;
        while ((rawLine = reader.readLine()) != null) {
            String line = rawLine.strip();
            if (line.isEmpty() || line.startsWith("#")) {
                continue;
            }

            String[] parts = line.split("-");
            if (parts.length != 6) {
                continue;
            }

            try {
                int day = Integer.parseInt(parts[0]);
                int hour = Integer.parseInt(parts[1]);
                int minute = Integer.parseInt(parts[2]);
                String destinationCode = parts[3];
                int quantity = Integer.parseInt(parts[4]);
                String orderId = parts[5];

                Airport destination = airports.get(destinationCode);
                if (destination == null) {
                    continue;
                }

                LocalDateTime creationLocal = resolveDateTime(day, hour, minute);
                ZoneOffset offset = destination.getZoneOffset();
                var creationUtc = creationLocal.toInstant(offset);
                var dueUtc = creationUtc.plus(Config.INTERCONTINENTAL_SLA_HOURS, ChronoUnit.HOURS);

                Order order = new Order(orderId, orderId, destination, quantity, creationUtc, dueUtc);
                register(order);
                return order;
            } catch (NumberFormatException | DateTimeException ignored) {
                // Skip malformed lines.
            }
        }
        return null;
    }

    public void setObserver(Observer observer) {
        this.observer = observer;
    }

    public List<Order> getActiveOrders() {
        return Collections.unmodifiableList(activeOrders);
    }

    public Order getById(String id) {
        return byId.get(id);
    }

    public int size() {
        return activeOrders.size();
    }

    public List<Order> pruneExpired(Instant now) {
        List<Order> removed = new ArrayList<>();
        Iterator<Order> it = activeOrders.iterator();
        while (it.hasNext()) {
            Order order = it.next();
            if (order.getDueUtc().isBefore(now)) {
                removed.add(order);
                it.remove();
                byId.remove(order.getId());
            }
        }
        return removed;
    }

    @Override
    public void close() throws IOException {
        reader.close();
    }

    void register(Order order) {
        activeOrders.add(order);
        byId.put(order.getId(), order);
        if (observer != null) {
            observer.onOrderRead(order);
        }
    }

    private LocalDateTime resolveDateTime(int day, int hour, int minute) {
        YearMonth trialMonth = currentMonth;
        LocalDateTime candidate = tryCreate(trialMonth, day, hour, minute);

        while (candidate == null || (lastCreationLocal != null && !candidate.isAfter(lastCreationLocal))) {
            trialMonth = trialMonth.plusMonths(1);
            candidate = tryCreate(trialMonth, day, hour, minute);
        }

        currentMonth = trialMonth;
        lastCreationLocal = candidate;
        return candidate;
    }

    private static LocalDateTime tryCreate(YearMonth month, int day, int hour, int minute) {
        try {
            return LocalDateTime.of(month.getYear(), month.getMonthValue(), day, hour, minute);
        } catch (DateTimeException ex) {
            return null;
        }
    }

    public interface Observer {
        void onOrderRead(Order order);
    }
}
