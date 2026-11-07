#include "mower_map/coverage_planner.hpp"
#include "mower_map/hd7000w_spec.hpp"

#include <algorithm>
#include <array>
#include <cmath>
#include <limits>
#include <stdexcept>

namespace mower_map {
namespace {

constexpr double kEpsilon = 1e-8;
struct Point { double x, y; };
using Ring = std::vector<Point>;

double cross(Point a, Point b, Point c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

bool onSegment(Point a, Point b, Point p) {
  return std::abs(cross(a, b, p)) <= kEpsilon &&
      p.x >= std::min(a.x, b.x) - kEpsilon && p.x <= std::max(a.x, b.x) + kEpsilon &&
      p.y >= std::min(a.y, b.y) - kEpsilon && p.y <= std::max(a.y, b.y) + kEpsilon;
}

bool intersects(Point a, Point b, Point c, Point d) {
  if (std::max(a.x, b.x) < std::min(c.x, d.x) - kEpsilon ||
      std::max(c.x, d.x) < std::min(a.x, b.x) - kEpsilon ||
      std::max(a.y, b.y) < std::min(c.y, d.y) - kEpsilon ||
      std::max(c.y, d.y) < std::min(a.y, b.y) - kEpsilon) return false;
  const double ab_c = cross(a, b, c), ab_d = cross(a, b, d);
  const double cd_a = cross(c, d, a), cd_b = cross(c, d, b);
  if (((ab_c > kEpsilon && ab_d < -kEpsilon) || (ab_c < -kEpsilon && ab_d > kEpsilon)) &&
      ((cd_a > kEpsilon && cd_b < -kEpsilon) || (cd_a < -kEpsilon && cd_b > kEpsilon))) return true;
  return onSegment(a, b, c) || onSegment(a, b, d) || onSegment(c, d, a) || onSegment(c, d, b);
}

bool pointInPolygon(Point point, const Ring& polygon) {
  bool inside = false;
  const std::size_t n = polygon.size();
  for (std::size_t i = 0, j = n - 1; i < n; j = i++) {
    if (onSegment(polygon[j], polygon[i], point)) return false;
    const double xi = polygon[i].x, yi = polygon[i].y;
    const double xj = polygon[j].x, yj = polygon[j].y;
    const bool crosses = (yi > point.y) != (yj > point.y);
    if (crosses) {
      const double x_intersect = xi + (point.y - yi) * (xj - xi) / (yj - yi);
      if (point.x < x_intersect) inside = !inside;
    }
  }
  return inside;
}

double pointSegmentDistanceSquared(Point point, Point a, Point b) {
  const double dx = b.x - a.x, dy = b.y - a.y;
  const double length_squared = dx * dx + dy * dy;
  const double t = length_squared == 0 ? 0 : std::clamp(
      ((point.x - a.x) * dx + (point.y - a.y) * dy) / length_squared, 0.0, 1.0);
  const double x = point.x - a.x - t * dx, y = point.y - a.y - t * dy;
  return x * x + y * y;
}

bool hasBodyClearance(Point a, Point b, const std::vector<Ring>& rings, const std::vector<Point>& obstacles) {
  const double radius = mowerEnvelopeRadiusM() + kEpsilon;
  const double radius_squared = radius * radius;
  for (const auto& ring : rings) {
    for (std::size_t i = 0; i < ring.size(); ++i) {
      const auto c = ring[i], d = ring[(i + 1) % ring.size()];
      if (std::max(a.x, b.x) + radius < std::min(c.x, d.x) ||
          std::max(c.x, d.x) + radius < std::min(a.x, b.x) ||
          std::max(a.y, b.y) + radius < std::min(c.y, d.y) ||
          std::max(c.y, d.y) + radius < std::min(a.y, b.y)) continue;
      if (intersects(a, b, c, d) ||
          std::min({pointSegmentDistanceSquared(a, c, d), pointSegmentDistanceSquared(b, c, d),
                    pointSegmentDistanceSquared(c, a, b), pointSegmentDistanceSquared(d, a, b)}) <= radius_squared) return false;
    }
  }
  for (auto obstacle : obstacles) {
    if (pointSegmentDistanceSquared(obstacle, a, b) <= radius_squared) return false;
  }
  return true;
}

void validateRings(const std::vector<Ring>& rings) {
  for (std::size_t r = 0; r < rings.size(); ++r) {
    const auto& ring = rings[r];
    if (ring.size() < 3) throw std::invalid_argument("ring needs at least 3 vertices");
    double area = 0;
    for (std::size_t i = 0; i < ring.size(); ++i) {
      const auto a = ring[i], b = ring[(i + 1) % ring.size()];
      if (std::hypot(a.x - b.x, a.y - b.y) <= kEpsilon) {
        throw std::invalid_argument("duplicate polygon vertex");
      }
      area += a.x * b.y - b.x * a.y;
      for (std::size_t j = i + 1; j < ring.size(); ++j) {
        if (j == i + 1 || (i == 0 && j == ring.size() - 1)) continue;
        if (intersects(a, b, ring[j], ring[(j + 1) % ring.size()])) {
          throw std::invalid_argument("self-intersecting ring");
        }
      }
      for (std::size_t s = 0; s < r; ++s) {
        const auto& other = rings[s];
        for (std::size_t j = 0; j < other.size(); ++j) {
          if (intersects(a, b, other[j], other[(j + 1) % other.size()])) {
            throw std::invalid_argument("intersecting polygon rings");
          }
        }
      }
    }
    if (std::abs(area) <= kEpsilon) throw std::invalid_argument("ring has no area");
    if (r > 0 && !pointInPolygon(ring.front(), rings.front())) {
      throw std::invalid_argument("hole outside polygon");
    }
    for (std::size_t s = 1; s < r; ++s) {
      if (pointInPolygon(ring.front(), rings[s]) || pointInPolygon(rings[s].front(), ring)) {
        throw std::invalid_argument("nested polygon holes");
      }
    }
  }
}

}  // namespace

CoveragePlanResult planCoverage(const std::vector<GpsCoordinate>& polygon,
                                 const std::vector<GpsCoordinate>& obstacles,
                                 double cell_size_m,
                                 const std::vector<std::vector<GpsCoordinate>>& holes) {
  if (polygon.size() < 3) {
    throw std::invalid_argument("polygon must have at least 3 vertices");
  }
  if (!std::isfinite(cell_size_m) || cell_size_m <= 0 || cell_size_m > kCuttingWidthM) {
    throw std::invalid_argument("cell size must be positive and at most HD-7000W cutting width");
  }

  GpsCoordinate south_west{std::numeric_limits<double>::max(),
                           std::numeric_limits<double>::max()};
  GpsCoordinate north_east{std::numeric_limits<double>::lowest(),
                           std::numeric_limits<double>::lowest()};
  for (const auto& vertex : polygon) {
    if (!std::isfinite(vertex.latitude) || !std::isfinite(vertex.longitude) ||
        std::abs(vertex.latitude) > 85 || std::abs(vertex.longitude) > 180) {
      throw std::invalid_argument("invalid GPS coordinate");
    }
    south_west.latitude = std::min(south_west.latitude, vertex.latitude);
    south_west.longitude = std::min(south_west.longitude, vertex.longitude);
    north_east.latitude = std::max(north_east.latitude, vertex.latitude);
    north_east.longitude = std::max(north_east.longitude, vertex.longitude);
  }

  // 지역 좌표에서 교차를 계산해 큰 절대 위경도 값의 상쇄 오차를 줄인다.
  const double north_scale = 6378137.0 * std::acos(-1.0) / 180.0;
  const double east_scale = north_scale * std::cos((south_west.latitude + north_east.latitude) / 2 * std::acos(-1.0) / 180.0);
  auto project = [&](GpsCoordinate p) -> Point {
    if (!std::isfinite(p.latitude) || !std::isfinite(p.longitude) ||
        std::abs(p.latitude) > 85 || std::abs(p.longitude) > 180) {
      throw std::invalid_argument("invalid GPS coordinate");
    }
    return {(p.longitude - south_west.longitude) * east_scale,
            (p.latitude - south_west.latitude) * north_scale};
  };
  const double height = (north_east.latitude - south_west.latitude) * north_scale / cell_size_m;
  const double width = (north_east.longitude - south_west.longitude) * east_scale / cell_size_m;
  if (north_east.latitude - south_west.latitude > 1 || north_east.longitude - south_west.longitude > 1 ||
      std::ceil(height) * std::ceil(width) > 100000) {
    throw std::invalid_argument("polygon grid too large");
  }
  std::vector<Ring> rings;
  std::size_t vertices = 0;
  auto addRing = [&](const std::vector<GpsCoordinate>& input) {
    Ring ring;
    for (auto p : input) ring.push_back(project(p));
    if (ring.size() > 1 && ring.front().x == ring.back().x && ring.front().y == ring.back().y) ring.pop_back();
    vertices += ring.size();
    if (vertices > 500) throw std::invalid_argument("too many polygon vertices");
    rings.push_back(std::move(ring));
  };
  addRing(polygon);
  for (const auto& hole : holes) addRing(hole);
  validateRings(rings);
  GridMap map = GridMap::fromGpsBounds(south_west, north_east, cell_size_m);

  for (std::size_t row = 0; row < map.rows(); ++row) {
    for (std::size_t column = 0; column < map.columns(); ++column) {
      const CellIndex cell{row, column};
      const auto point = project(map.gpsForCell(cell));
      bool allowed = pointInPolygon(point, rings.front());
      for (std::size_t i = 1; i < rings.size(); ++i) {
        if (pointInPolygon(point, rings[i])) allowed = false;
        for (std::size_t j = 0; j < rings[i].size(); ++j) {
          if (onSegment(rings[i][j], rings[i][(j + 1) % rings[i].size()], point)) allowed = false;
        }
      }
      if (!allowed) {
        map.setObstacle(cell);
      }
    }
  }

  std::vector<Point> obstacle_points;
  for (const auto& obstacle_point : obstacles) {
    obstacle_points.push_back(project(obstacle_point));
    if (const auto cell = map.cellForGps(obstacle_point)) {
      map.setObstacle(*cell);
    }
  }

  CoveragePlanResult result;
  result.rows = map.rows();
  result.columns = map.columns();
  result.origin = map.origin();
  const auto count = map.rows() * map.columns();
  auto index = [&](CellIndex c) { return c.row * map.columns() + c.column; };
  auto cell = [&](std::size_t i) -> CellIndex { return {i / map.columns(), i % map.columns()}; };
  std::vector<bool> allowed(count);
  std::vector<Point> points(count);
  for (std::size_t i = 0; i < count; ++i) {
    points[i] = project(map.gpsForCell(cell(i)));
    allowed[i] = map.canPlaceMower(cell(i)) && hasBodyClearance(points[i], points[i], rings, obstacle_points);
  }
  std::vector<CellIndex> targets;
  for (const auto target : map.coveragePath()) {
    if (allowed[index(target)]) targets.push_back(target);
  }
  if (targets.empty()) return result;
  // 점뿐 아니라 이동 선분 전체에서도 차체 외접원이 경계·장애물에 닿지 않아야 한다.
  std::vector<std::vector<std::size_t>> neighbors(count);
  for (std::size_t i = 0; i < count; ++i) {
    if (!allowed[i]) continue;
    const auto c = cell(i);
    for (const auto next : std::array<CellIndex, 2>{{{c.row, c.column + 1}, {c.row + 1, c.column}}}) {
      if (next.row >= map.rows() || next.column >= map.columns()) continue;
      const auto j = index(next);
      if (allowed[j] && hasBodyClearance(points[i], points[j], rings, obstacle_points)) {
        neighbors[i].push_back(j);
        neighbors[j].push_back(i);
      }
    }
  }
  std::vector<std::size_t> parent(count), visited(count, 0), queue;
  queue.reserve(count);
  std::size_t generation = 0;
  auto search = [&](std::size_t start, std::size_t goal, bool all) {
    ++generation;
    queue.clear();
    queue.push_back(start);
    visited[start] = generation;
    parent[start] = start;
    for (std::size_t head = 0; head < queue.size(); ++head) {
      const auto current = queue[head];
      if (!all && current == goal) return;
      for (auto next : neighbors[current]) {
        if (visited[next] == generation) continue;
        visited[next] = generation;
        parent[next] = current;
        queue.push_back(next);
      }
    }
  };
  const auto start = index(targets.front());
  search(start, start, true);
  for (std::size_t i = 0; i < count; ++i) {
    if (allowed[i] && visited[i] != generation) {
      throw std::invalid_argument("work zone has disconnected traversable areas");
    }
  }
  std::vector<std::size_t> route{start};
  for (std::size_t t = 1; t < targets.size(); ++t) {
    const auto goal = index(targets[t]);
    search(route.back(), goal, false);
    std::vector<std::size_t> connection;
    for (auto i = goal; i != route.back(); i = parent[i]) connection.push_back(i);
    route.insert(route.end(), connection.rbegin(), connection.rend());
  }
  // 같은 방향의 중간 점만 줄이며, 생략 후의 실제 위경도 선분도 재검사한다.
  std::vector<std::size_t> compact;
  for (auto i : route) {
    if (compact.size() >= 2) {
      const auto a = cell(compact[compact.size() - 2]), b = cell(compact.back()), c = cell(i);
      const bool same_direction = (a.row == b.row && b.row == c.row &&
          ((a.column < b.column && b.column < c.column) || (a.column > b.column && b.column > c.column))) ||
          (a.column == b.column && b.column == c.column &&
          ((a.row < b.row && b.row < c.row) || (a.row > b.row && b.row > c.row)));
      if (same_direction && hasBodyClearance(points[compact[compact.size() - 2]], points[i], rings, obstacle_points)) compact.pop_back();
    }
    compact.push_back(i);
  }
  for (auto i : compact) result.path.push_back(map.gpsForCell(cell(i)));
  return result;
}

}  // namespace mower_map
