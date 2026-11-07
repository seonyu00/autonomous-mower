#include <cassert>
#include <algorithm>
#include <array>
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

GpsCoordinate gps(double east, double north) {
  return {37.0 + north / 111319.49079327358,
          127.0 + east / (111319.49079327358 * std::cos(37.0 * std::acos(-1.0) / 180))};
}

// 선분이 열린 직사각형 내부를 통과하는지 매개변수 구간으로 독립 검사한다.
void excludesBox(const CoveragePlanResult& result, double left, double right, double bottom, double top) {
  assert(!result.path.empty());
  const auto sw = gps(left, bottom), ne = gps(right, top);
  for (std::size_t i = 0; i < result.path.size(); ++i) {
    const auto a = result.path[i == 0 ? 0 : i - 1], b = result.path[i];
    double low = 0, high = 1;
    bool possible = true;
    for (const auto dimension : {std::array<double, 4>{a.longitude, b.longitude, sw.longitude, ne.longitude},
                                 std::array<double, 4>{a.latitude, b.latitude, sw.latitude, ne.latitude}}) {
      const double delta = dimension[1] - dimension[0];
      if (std::abs(delta) < 1e-14) {
        if (dimension[0] <= dimension[2] || dimension[0] >= dimension[3]) possible = false;
      } else {
        const double t1 = (dimension[2] - dimension[0]) / delta;
        const double t2 = (dimension[3] - dimension[0]) / delta;
        low = std::max(low, std::min(t1, t2));
        high = std::min(high, std::max(t1, t2));
      }
    }
    assert(!possible || low >= high);
  }
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
  for (const auto& point : l_result.path) {
    assert(point.latitude <= 37.000090 || point.longitude <= 127.000120);
  }

  const std::vector<GpsCoordinate> u_shape = {gps(0, 0), gps(30, 0), gps(30, 30),
      gps(20, 30), gps(20, 10), gps(10, 10), gps(10, 30), gps(0, 30)};
  const auto u_result = planCoverage(u_shape, {}, 0.5);
  excludesBox(u_result, 10, 20, 10, 30);
  bool left_arm = false, right_arm = false;
  for (auto p : u_result.path) {
    left_arm = left_arm || (p.latitude > gps(0, 15).latitude && p.longitude < gps(10, 0).longitude);
    right_arm = right_arm || (p.latitude > gps(0, 15).latitude && p.longitude > gps(20, 0).longitude);
  }
  assert(left_arm && right_arm);

  const std::vector<GpsCoordinate> square = {gps(0, 0), gps(30, 0), gps(30, 30), gps(0, 30)};
  const std::vector<GpsCoordinate> hole = {gps(10, 10), gps(20, 10), gps(20, 20), gps(10, 20)};
  const auto hole_result = planCoverage(square, {}, 0.5, {hole});
  excludesBox(hole_result, 10, 20, 10, 20);
  auto reversed = square;
  std::reverse(reversed.begin(), reversed.end());
  excludesBox(planCoverage(reversed, {}, 0.5, {hole}), 10, 20, 10, 20);

  // 격자 중심이 걸리지 않는 가느다란 홈도 연결선이 통과하면 안 된다.
  const std::vector<GpsCoordinate> slit = {gps(0, 0), gps(30, 0), gps(30, 30),
      gps(15.02, 30), gps(15.02, 10), gps(15, 10), gps(15, 30), gps(0, 30)};
  excludesBox(planCoverage(slit, {}, 0.5), 15, 15.02, 10, 30);

  const std::vector<GpsCoordinate> narrow_bridge = {gps(0, 0), gps(10, 0), gps(10, 4),
      gps(20, 4), gps(20, 0), gps(30, 0), gps(30, 10), gps(20, 10),
      gps(20, 5.4), gps(10, 5.4), gps(10, 10), gps(0, 10)};
  bool disconnected = false;
  try { planCoverage(narrow_bridge, {}, 0.2); }
  catch (const std::invalid_argument&) { disconnected = true; }
  assert(disconnected);

  for (auto invalid_hole : {std::vector<GpsCoordinate>{gps(40, 40), gps(50, 40), gps(50, 50)},
                           std::vector<GpsCoordinate>{gps(10, 10), gps(20, 20), gps(10, 20), gps(20, 10)}}) {
    bool invalid = false;
    try { planCoverage(square, {}, 0.5, {invalid_hole}); }
    catch (const std::invalid_argument&) { invalid = true; }
    assert(invalid);
  }

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
