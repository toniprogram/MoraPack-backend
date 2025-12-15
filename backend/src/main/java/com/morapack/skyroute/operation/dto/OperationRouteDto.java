package com.morapack.skyroute.operation.dto;

import java.util.List;

public class OperationRouteDto {
    private int quantity;
    private List<OperationSegmentDto> segments;

    public int getQuantity() {
        return quantity;
    }

    public void setQuantity(int quantity) {
        this.quantity = quantity;
    }

    public List<OperationSegmentDto> getSegments() {
        return segments;
    }

    public void setSegments(List<OperationSegmentDto> segments) {
        this.segments = segments;
    }
}
