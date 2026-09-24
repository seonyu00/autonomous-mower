#include <cassert>
#include <cmath>
#include <stdexcept>

#include "mower_map/coverage_planner.hpp"

using mower_map::CoveragePlanResult;
using mower_map::GpsCoordinate;
using mower_map::planCoverage;

namespace {

bool approxEqual(double a, double b, double epsilon = 1e-9) {
  return std::abs(a - b) < epsilon;
}

}  // namespace

int main() {
  // A simple ~20m x 14m rectangular work zone (5 vertices, first == last
  // repeated is not required; ray-casting works on the open ring).
  const std::vector<GpsCoordinate> rectangle = {
      {37.000000, 127.000000},
      {37.000000, 127.000230},  // ~20m east at this latitude
      {37.000126, 127.000230},  // ~14m north
      {37.000126, 127.000000},
  };

  const auto result = planCoverage(rectangle, /*obstacles=*/{}, 0.20);
  assert(result.rows > 0 && result.columns > 0);
  assert(!result.path.empty());

  // Every waypoint must fall within the polygon's bounding box (with a small
  // tolerance for the 0.2m cell size).
  for (const auto& point : result.path) {
    assert(point.latitude >= rectangle[0].latitude - 0.0001);
    assert(point.latitude <= rectangle[2].latitude + 0.0001);
    assert(point.longitude >= rectangle[0].longitude - 0.0001);
    assert(point.longitude <= rectangle[1].longitude + 0.0001);
  }

  // A non-rectangular (L-shaped) polygon should still plan, and the notch
  // should be excluded from the path as an implicit obstacle.
  const std::vector<GpsCoordinate> l_shape = {
      {37.000000, 127.000000},
      {37.000000, 127.000230},
      {37.000090, 127.000230},
      {37.000090, 127.000120},
      {37.000126, 127.000120},
      {37.000126, 127.000000},
  };
  const auto l_result = planCoverage(l_shape, /*obstacles=*/{}, 0.20);
  assert(!l_result.path.empty());
  assert(l_result.path.size() < result.path.size());

  // A polygon with fewer than 3 vertices must be rejected.
  bool threw = false;
  try {
    planCoverage({{37.0, 127.0}, {37.0001, 127.0001}}, {}, 0.20);
  } catch (const std::invalid_argument&) {
    threw = true;
  }
  assert(threw);

  return 0;
}
