#include <cassert>
#include <cmath>

#include "mower_map/grid_map.hpp"
#include "mower_map/hd7000w_spec.hpp"

using mower_map::CellIndex;
using mower_map::CellState;
using mower_map::GpsCoordinate;
using mower_map::GridMap;

int main() {
  GridMap map(9, 9, 0.20, {37.0, 127.0});
  assert(map.canPlaceMower({4, 4}));
  assert(!map.canPlaceMower({3, 3}));
  assert(map.placeMower({4, 4}));
  assert(map.at({4, 4}) == CellState::Cut);
  assert(map.at({4, 5}) == CellState::Cut);
  assert(map.at({5, 5}) == CellState::Allocated);
  assert(map.render().find('?') == std::string::npos);
  assert(std::abs(mower_map::mowerEnvelopeRadiusM() - 0.772) < 0.001);

  GridMap blocked(9, 9, 0.20, {37.0, 127.0});
  blocked.setObstacle({3, 3});
  assert(!blocked.canPlaceMower({4, 4}));
  assert(!blocked.placeMower({4, 4}));

  const auto bounds = GridMap::fromGpsBounds({37.0, 127.0}, {37.00002, 127.00002});
  assert(bounds.rows() == 11);  // partial north/east border is discarded
  assert(bounds.columns() == 8);

  const auto center = map.gpsForCell({3, 3});
  const auto cell = map.cellForGps(center);
  assert(cell.has_value() && (*cell == CellIndex{3, 3}));
  assert(!map.cellForGps({36.999, 127.0}).has_value());

  GridMap route_map(20, 20, 0.20, {37.0, 127.0});
  route_map.setObstacle({9, 9});
  const auto path = route_map.coveragePath();
  assert(!path.empty());
  for (const auto position : path) {
    assert(route_map.canPlaceMower(position));
  }
  // 격자를 바꿔도 왕복 줄 간격은 실제 예초 폭보다 커지지 않아야 한다.
  for (double size : {0.2, 0.3, 0.5, 0.65}) {
    GridMap scaled(30, 30, size, {37.0, 127.0});
    const auto scaled_path = scaled.coveragePath();
    assert(!scaled_path.empty());
    for (std::size_t i = 1; i < scaled_path.size(); ++i) {
      const auto previous = scaled_path[i - 1], current = scaled_path[i];
      if (current.row != previous.row) {
        assert((current.row - previous.row) * size <= 0.650000001);
      }
    }
  }
  return 0;
}
