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

// Builds a grid map covering the bounding box of `polygon`, marks every cell
// whose center falls outside `polygon` (and every cell containing a point
// from `obstacles`) as an obstacle, then runs GridMap::coveragePath() over
// what remains. `polygon` must have at least 3 vertices.
//
// GridMap itself only understands rectangular GPS bounds, so this function
// is the adapter that lets an arbitrary work-zone polygon reuse its existing
// obstacle-avoidance behavior for the polygon boundary too.
CoveragePlanResult planCoverage(const std::vector<GpsCoordinate>& polygon,
                                 const std::vector<GpsCoordinate>& obstacles,
                                 double cell_size_m = 0.20);

}  // namespace mower_map
