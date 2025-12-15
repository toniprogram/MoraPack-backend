package com.morapack.skyroute.simulation.live;

public class LiveAirport {
    private final String airportCode;
    private final int maxThroughputPerHour;
    private int currentLoad;
    private final Double latitude;
    private final Double longitude;

    public LiveAirport(String airportCode, int maxThroughputPerHour, Double latitude, Double longitude) {
        this.airportCode = airportCode;
        this.maxThroughputPerHour = Math.max(0, maxThroughputPerHour);
        this.currentLoad = 0;
        this.latitude = latitude;
        this.longitude = longitude;
    }

    public boolean canProcess(int qty) {
        return currentLoad + qty <= maxThroughputPerHour;
    }

    public void process(int qty) {
        currentLoad += Math.max(0, qty);
    }

    public void resetHour() {
        currentLoad = 0;
    }

    public String getAirportCode() {
        return airportCode;
    }

    public int getCurrentLoad() {
        return currentLoad;
    }

    public int getMaxThroughputPerHour() {
        return maxThroughputPerHour;
    }

    public Double getLatitude() {
        return latitude;
    }

    public Double getLongitude() {
        return longitude;
    }
}
