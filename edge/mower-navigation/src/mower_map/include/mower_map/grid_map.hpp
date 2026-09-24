#pragma once

#include <cstddef>
#include <optional>
#include <string>
#include <vector>

namespace mower_map {

struct GpsCoordinate {
  double latitude{};
  double longitude{};
};

struct CellIndex {
  std::size_t row{};
  std::size_t column{};
};

inline bool operator==(const CellIndex& lhs, const CellIndex& rhs) {
  return lhs.row == rhs.row && lhs.column == rhs.column;
}

enum class CellState { Unknown, Free, Obstacle, Allocated, Cut };

class GridMap {
 public:
  // The map uses the south-west GPS point as its origin.
  // Partial cells at the north/east edges are intentionally discarded.
  static GridMap fromGpsBounds(GpsCoordinate south_west,
                               GpsCoordinate north_east,
                               double cell_size_m = 0.20);

  GridMap(std::size_t rows, std::size_t columns, double cell_size_m,
          GpsCoordinate origin);

  std::size_t rows() const noexcept { return rows_; }
  std::size_t columns() const noexcept { return columns_; }
  double cellSizeMeters() const noexcept { return cell_size_m_; }
  const GpsCoordinate& origin() const noexcept { return origin_; }

  std::optional<CellIndex> cellForGps(GpsCoordinate coordinate) const;
  GpsCoordinate gpsForCell(CellIndex cell) const;

  CellState at(CellIndex cell) const;
  void setFree(CellIndex cell);
  void setObstacle(CellIndex cell);

  // mower_center is the GPS position of the mower's geometric center.
  // The 7x7 footprint is allocated; the centered 3x3 area is marked cut.
  bool canPlaceMower(CellIndex mower_center) const;
  bool placeMower(CellIndex mower_center);

  // Simple CPP baseline (lawn-mower/boustrophedon route): centers are spaced
  // by the 3x3 cutter width and traversed in alternating directions.
  // Obstacle-overlapping mower positions are skipped.
  std::vector<CellIndex> coveragePath() const;

  std::string render() const;

 private:
  bool inBounds(int row, int column) const noexcept;
  std::size_t offset(CellIndex cell) const;

  std::size_t rows_;
  std::size_t columns_;
  double cell_size_m_;
  GpsCoordinate origin_;
  std::vector<CellState> cells_;
};

}  // namespace mower_map
