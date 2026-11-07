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

  // 차체 중심 기준으로 HD-7000W 외접원을 감싸는 보수적인 격자 영역을 검사한다.
  // placeMower의 Cut 표시는 날 중심도 같다고 가정한 도형 시뮬레이션이며 실측 이력이 아니다.
  bool canPlaceMower(CellIndex mower_center) const;
  bool placeMower(CellIndex mower_center);

  // 예초 폭 0.65m를 넘지 않는 격자 간격으로 왕복한다.
  // 점 사이의 연속 경로와 실제 경계 여유는 planCoverage에서 검사한다.
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
