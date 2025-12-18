package com.morapack.skyroute.config;

import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Duration;

public class Config {
    public static final int CONTINENTAL_SLA_HOURS = 48;
    public static final int INTERCONTINENTAL_SLA_HOURS = 72;
    public static final Duration TRANSFER_BUFFER = Duration.ofMinutes(30); // Nota: Revisar si duration es necesario
    public static final Duration WAREHOUSE_DWELL = Duration.ofHours(2); // Nota: Revisar si duration es necesario
    public static final int SIMULATION_WINDOW_MINUTES = 180; // 3 horas por defecto

    public static final Path PATH_AIRPORTS = Paths.get("src/com/morapack/config/data/aeropuertos.txt");
    public static final Path PATH_FLIGHTS = Paths.get("src/com/morapack/config/data/vuelos.txt");
    public static final Path PATH_ORDERS = Paths.get("src/com/morapack/config/data/pedidos.txt");
    public static final Path DIR_LOGS = Paths.get("logs");
    public static final Path DIR_EXPORTS = Paths.get("exports");

    // GA
    public static final int POP_SIZE = 10; // tamaño de población para simulación
    public static final int MAX_GEN = 1_000_000;
    // Parámetros específicos para operación diaria
    public static final int OPERATION_POP_SIZE = 10;
    public static final int OPERATION_MAX_GEN = 5;
    public static final double OPERATION_ATTEMPT_FACTOR = 3.0; // más intentos de construcción en operación diaria
    public static final double P_CROSS = 0.5;
    public static final double P_MUT = 0.5; // ligera alza para romper estancamiento

    // Pesos de fitness
    public static final double W_SLA = 1.5;           // prioridad 1: evitar atraso
    public static final double W_TIME = 0.7;          // prioridad 3: earliness
    public static final double W_BACKLOG = 0.5;
    public static final double W_INTERCONT = 0.7;
    public static final double W_INTERCONT_FIRST_LEG = 1.0; // penal extra si el primer salto es intercontinental
    public static final double W_INTL = 0.3;
    public static final double W_DISTANCE = 1.0;      // prioridad 2: distancia/operación
    public static final double W_ON_TIME = 0.5;       // bonus por pedidos dentro de SLA
    public static final double SLA_K = 50d;
    public static final int BACKLOG_OK = 200; // umbral a partir del cual no penalizamos intercontinental cuando ayuda

    // Overflow (uso de días posteriores al due)
    public static final double W_OVERFLOW = W_SLA * 2.0;
    public static final double MAX_OVERFLOW_MINUTES = 720.0; // 12h de tolerancia para normalizar
}
