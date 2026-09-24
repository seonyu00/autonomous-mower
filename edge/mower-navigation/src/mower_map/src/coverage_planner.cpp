#include "mower_map/coverage_planner.hpp"

#include <algorithm>
#include <limits>
#include <stdexcept>

namespace mower_map {
namespace {

bool pointInPolygon(const GpsCoordinate& point,
                     const std::vector<GpsCoordinate>& polygon) {
  bool inside = false;
  const std::size_t n = polygon.size();
  for (std::size_t i = 0, j = n - 1; i < n; j = i++) {
    const double xi = polygon[i].longitude;
    const double yi = polygon[i].latitude;
    const double xj = polygon[j].longitude;
    const double yj = polygon[j].latitude;
    const bool crosses = (yi > point.latitude) != (yj > point.latitude);
    if (crosses) {
      const double x_intersect =
          xi + (point.latitude - yi) * (xj - xi) / (yj - yi);
      if (point.longitude < x_intersect) inside = !inside;
    }
  }
  return inside;
}

}  // namespace

CoveragePlanResult planCoverage(const std::vector<GpsCoordinate>& polygon,
                                 const std::vector<GpsCoordinate>& obstacles,
                                 double cell_size_m) {
  if (polygon.size() < 3) {
    throw std::invalid_argument("polygon must have at least 3 vertices");
  }

  GpsCoordinate south_west{std::numeric_limits<double>::max(),
                           std::numeric_limits<double>::max()};
  GpsCoordinate north_east{std::numeric_limits<double>::lowest(),
                           std::numeric_limits<double>::lowest()};
  for (const auto& vertex : polygon) {
    south_west.latitude = std::min(south_west.latitude, vertex.latitude);
    south_west.longitude = std::min(south_west.longitude, vertex.longitude);
    north_east.latitude = std::max(north_east.latitude, vertex.latitude);
    north_east.longitude = std::max(north_east.longitude, vertex.longitude);
  }

  GridMap map = GridMap::fromGpsBounds(south_west, north_east, cell_size_m);

  for (std::size_t row = 0; row < map.rows(); ++row) {
    for (std::size_t column = 0; column < map.columns(); ++column) {
      const CellIndex cell{row, column};
      if (!pointInPolygon(map.gpsForCell(cell), polygon)) {
        map.setObstacle(cell);
      }
    }
  }

  for (const auto& obstacle_point : obstacles) {
    if (const auto cell = map.cellForGps(obstacle_point)) {
      map.setObstacle(*cell);
    }
  }

  CoveragePlanResult result;
  result.rows = map.rows();
  result.columns = map.columns();
  result.origin = map.origin();
  for (const auto cell : map.coveragePath()) {
    result.path.push_back(map.gpsForCell(cell));
  }
  return result;
}

}  // namespace mower_map
