#include <cassert>
#include <cmath>

#include "mower_map/grid_map.hpp"

using mower_map::CellIndex;
using mower_map::CellState;
using mower_map::GpsCoordinate;
using mower_map::GridMap;

int main() {
  GridMap map(7, 7, 0.20, {37.0, 127.0});
  assert(map.canPlaceMower({3, 3}));
  assert(map.placeMower({3, 3}));
  assert(map.render() == "0000000\n0000000\n0011100\n0011100\n0011100\n0000000\n0000000\n");

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
  return 0;
}
