package com.autonomousmower.workzone.entity;

import com.autonomousmower.robot.entity.Robot;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import java.util.Objects;
import org.locationtech.jts.geom.Point;
import org.locationtech.jts.geom.Polygon;

@Entity
@Table(name = "work_zone")
public class WorkZone {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "zone_id")
    private Long zoneId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "robot_id", nullable = false)
    private Robot robot;

    @Column(name = "zone_polygon", nullable = false, columnDefinition = "geometry(Polygon, 4326)")
    private Polygon zonePolygon;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @Column(name = "version", nullable = false)
    private int version = 1;

    protected WorkZone() {
    }

    public WorkZone(Robot robot, Polygon zonePolygon, LocalDateTime createdAt) {
        this.robot = Objects.requireNonNull(robot, "robot must not be null");
        this.zonePolygon = Objects.requireNonNull(zonePolygon, "zonePolygon must not be null");
        this.createdAt = Objects.requireNonNull(createdAt, "createdAt must not be null");
        this.updatedAt = createdAt;
    }

    public boolean isPointInside(Point currentPoint) {
        return currentPoint != null && zonePolygon.contains(currentPoint);
    }

    public Long getZoneId() {
        return zoneId;
    }

    public Robot getRobot() {
        return robot;
    }

    public Polygon getZonePolygon() {
        return zonePolygon;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }

    public int getVersion() {
        return version;
    }

    public void replacePolygon(Polygon zonePolygon, LocalDateTime updatedAt) {
        this.zonePolygon = Objects.requireNonNull(zonePolygon, "zonePolygon must not be null");
        this.updatedAt = Objects.requireNonNull(updatedAt, "updatedAt must not be null");
        this.version += 1;
    }
}
