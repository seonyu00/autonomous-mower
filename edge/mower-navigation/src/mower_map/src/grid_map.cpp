#include "mower_map/grid_map.hpp"

#include <cmath>
#include <stdexcept>

namespace mower_map {
namespace {
constexpr double kEarthRadiusMeters = 6378137.0;
constexpr int kFootprintRadius = 3;
constexpr int kCutRadius = 1;
constexpr double kPi = 3.14159265358979323846;

double degreesToRadians(double degrees) { return degrees * kPi / 180.0; }

double metersNorth(double latitude, double origin_latitude) {
  return degreesToRadians(latitude - origin_latitude) * kEarthRadiusMeters;
}

double metersEast(double longitude, double origin_longitude,
                  double latitude) {
  return degreesToRadians(longitude - origin_longitude) * kEarthRadiusMeters *
         std::cos(degreesToRadians(latitude));
}
}  // namespace

GridMap GridMap::fromGpsBounds(GpsCoordinate south_west,
                               GpsCoordinate north_east, double cell_size_m) {
  if (cell_size_m <= 0.0) {
    throw std::invalid_argument("cell_size_m must be positive");
  }
  if (north_east.latitude <= south_west.latitude ||
      north_east.longitude <= south_west.longitude) {
    throw std::invalid_argument("GPS bounds must have positive area");
  }

  const double height = metersNorth(north_east.latitude, south_west.latitude);
  const double width = metersEast(north_east.longitude, south_west.longitude,
                                  (south_west.latitude + north_east.latitude) /
                                      2.0);
  const auto rows = static_cast<std::size_t>(std::floor(height / cell_size_m));
  const auto columns =
      static_cast<std::size_t>(std::floor(width / cell_size_m));
  if (rows == 0 || columns == 0) {
    throw std::invalid_argument("GPS bounds are smaller than one cell");
  }
  return GridMap(rows, columns, cell_size_m, south_west);
}

GridMap::GridMap(std::size_t rows, std::size_t columns, double cell_size_m,
                 GpsCoordinate origin)
    : rows_(rows),
      columns_(columns),
      cell_size_m_(cell_size_m),
      origin_(origin),
      cells_(rows * columns, CellState::Unknown) {
  if (rows == 0 || columns == 0 || cell_size_m <= 0.0) {
    throw std::invalid_argument("map dimensions and cell size must be positive");
  }
}

std::optional<CellIndex> GridMap::cellForGps(GpsCoordinate coordinate) const {
  const double east = metersEast(coordinate.longitude, origin_.longitude,
                                 coordinate.latitude);
  const double north = metersNorth(coordinate.latitude, origin_.latitude);
  if (east < 0.0 || north < 0.0) return std::nullopt;

  const auto column = static_cast<std::size_t>(std::floor(east / cell_size_m_));
  const auto row = static_cast<std::size_t>(std::floor(north / cell_size_m_));
  if (row >= rows_ || column >= columns_) return std::nullopt;
  return CellIndex{row, column};
}

GpsCoordinate GridMap::gpsForCell(CellIndex cell) const {
  if (cell.row >= rows_ || cell.column >= columns_) {
    throw std::out_of_range("cell is outside map");
  }
  const double north = (static_cast<double>(cell.row) + 0.5) * cell_size_m_;
  const double east = (static_cast<double>(cell.column) + 0.5) * cell_size_m_;
  const double latitude = origin_.latitude + north / kEarthRadiusMeters * 180.0 / kPi;
  const double longitude = origin_.longitude + east / (kEarthRadiusMeters *
      std::cos(degreesToRadians(latitude))) * 180.0 / kPi;
  return {latitude, longitude};
}

CellState GridMap::at(CellIndex cell) const { return cells_.at(offset(cell)); }
void GridMap::setFree(CellIndex cell) { cells_.at(offset(cell)) = CellState::Free; }
void GridMap::setObstacle(CellIndex cell) {
  cells_.at(offset(cell)) = CellState::Obstacle;
}

bool GridMap::inBounds(int row, int column) const noexcept {
  return row >= 0 && column >= 0 && static_cast<std::size_t>(row) < rows_ &&
         static_cast<std::size_t>(column) < columns_;
}

bool GridMap::canPlaceMower(CellIndex center) const {
  if (center.row >= rows_ || center.column >= columns_) return false;
  for (int row = static_cast<int>(center.row) - kFootprintRadius;
       row <= static_cast<int>(center.row) + kFootprintRadius; ++row) {
    for (int column = static_cast<int>(center.column) - kFootprintRadius;
         column <= static_cast<int>(center.column) + kFootprintRadius; ++column) {
      if (!inBounds(row, column) ||
          at({static_cast<std::size_t>(row), static_cast<std::size_t>(column)}) ==
              CellState::Obstacle) {
        return false;
      }
    }
  }
  return true;
}

bool GridMap::placeMower(CellIndex center) {
  if (!canPlaceMower(center)) return false;
  for (int row = static_cast<int>(center.row) - kFootprintRadius;
       row <= static_cast<int>(center.row) + kFootprintRadius; ++row) {
    for (int column = static_cast<int>(center.column) - kFootprintRadius;
         column <= static_cast<int>(center.column) + kFootprintRadius; ++column) {
      cells_[offset({static_cast<std::size_t>(row), static_cast<std::size_t>(column)})] =
          (std::abs(row - static_cast<int>(center.row)) <= kCutRadius &&
           std::abs(column - static_cast<int>(center.column)) <= kCutRadius)
              ? CellState::Cut
              : CellState::Allocated;
    }
  }
  return true;
}

std::vector<CellIndex> GridMap::coveragePath() const {
  std::vector<CellIndex> path;
  constexpr int kCenterStep = 2 * kCutRadius + 1;
  if (rows_ <= 2 * kFootprintRadius || columns_ <= 2 * kFootprintRadius) {
    return path;
  }

  bool left_to_right = true;
  for (int row = kFootprintRadius;
       row < static_cast<int>(rows_) - kFootprintRadius; row += kCenterStep) {
    if (left_to_right) {
      for (int column = kFootprintRadius;
           column < static_cast<int>(columns_) - kFootprintRadius;
           column += kCenterStep) {
        if (canPlaceMower({static_cast<std::size_t>(row),
                           static_cast<std::size_t>(column)})) {
          path.push_back({static_cast<std::size_t>(row),
                          static_cast<std::size_t>(column)});
        }
      }
    } else {
      for (int column = static_cast<int>(columns_) - kFootprintRadius - 1;
           column >= kFootprintRadius; column -= kCenterStep) {
        if (canPlaceMower({static_cast<std::size_t>(row),
                           static_cast<std::size_t>(column)})) {
          path.push_back({static_cast<std::size_t>(row),
                          static_cast<std::size_t>(column)});
        }
      }
    }
    left_to_right = !left_to_right;
  }
  return path;
}

std::size_t GridMap::offset(CellIndex cell) const {
  if (cell.row >= rows_ || cell.column >= columns_) {
    throw std::out_of_range("cell is outside map");
  }
  return cell.row * columns_ + cell.column;
}

std::string GridMap::render() const {
  std::string result;
  for (std::size_t row = rows_; row-- > 0;) {
    for (std::size_t column = 0; column < columns_; ++column) {
      const auto state = at({row, column});
      result += state == CellState::Obstacle ? '#' :
                state == CellState::Allocated ? '0' :
                state == CellState::Cut ? '1' :
                state == CellState::Free ? '.' : '?';
    }
    result += '\n';
  }
  return result;
}

}  // namespace mower_map
