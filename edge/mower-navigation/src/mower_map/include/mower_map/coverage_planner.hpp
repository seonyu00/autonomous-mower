#pragma once

#include <vector>

#include "mower_map/grid_map.hpp"

namespace mower_map {

struct CoveragePlanResult {
  std::size_t rows{};
  std::size_t columns{};
  GpsCoordinate origin{};
  // GPS position of each coverage waypoint, in visiting order.
  std::vector<GpsCoordinate> path;
};

// 다각형 외곽과 내부 제외 구역을 격자에 반영하고, 경계를 가로지르지 않는
// 인접 격자로 경로점을 연결한다. 연결할 수 없는 영역이 있으면 실패한다.
// HD-7000W 차체 외접원 여유를 적용한다. GPS 오차와 실제 회전 궤적은 별도다.
CoveragePlanResult planCoverage(const std::vector<GpsCoordinate>& polygon,
                                 const std::vector<GpsCoordinate>& obstacles,
                                 double cell_size_m = 0.20,
                                 const std::vector<std::vector<GpsCoordinate>>& holes = {});

}  // namespace mower_map
