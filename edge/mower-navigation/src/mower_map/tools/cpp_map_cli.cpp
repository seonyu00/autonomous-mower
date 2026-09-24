// Minimal stdin/stdout JSON bridge around mower_map::planCoverage(), so a
// non-C++ caller (e.g. an rclpy node) can invoke the coverage planner as a
// subprocess without needing language bindings.
//
// Request  (stdin):  {"cell_size_m": 0.2, "polygon": [{"lat":..,"lon":..}, ...],
//                      "obstacles": [{"lat":..,"lon":..}, ...]}
//   "cell_size_m" and "obstacles" are optional.
// Response (stdout): {"rows":.., "columns":.., "origin":{"lat":..,"lon":..},
//                      "path": [{"lat":..,"lon":..}, ...]}
//
// The parser below is intentionally not a general-purpose JSON library: it
// only understands the fixed request shape above, to keep this module
// dependency-free.

#include <cctype>
#include <iomanip>
#include <iostream>
#include <limits>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

#include "mower_map/coverage_planner.hpp"

namespace {

class JsonReader {
 public:
  explicit JsonReader(std::string text) : text_(std::move(text)) {}

  struct Request {
    double cell_size_m = 0.20;
    std::vector<mower_map::GpsCoordinate> polygon;
    std::vector<mower_map::GpsCoordinate> obstacles;
  };

  Request parseRequest() {
    Request request;
    expect('{');
    skipWhitespace();
    if (peek() == '}') {
      ++pos_;
      return request;
    }
    while (true) {
      skipWhitespace();
      const std::string key = parseString();
      skipWhitespace();
      expect(':');
      if (key == "cell_size_m") {
        request.cell_size_m = parseNumber();
      } else if (key == "polygon") {
        request.polygon = parseGpsArray();
      } else if (key == "obstacles") {
        request.obstacles = parseGpsArray();
      } else {
        throw std::runtime_error("unexpected key '" + key + "' in request");
      }
      skipWhitespace();
      if (peek() == ',') {
        ++pos_;
        continue;
      }
      break;
    }
    expect('}');
    return request;
  }

 private:
  void skipWhitespace() {
    while (pos_ < text_.size() &&
           std::isspace(static_cast<unsigned char>(text_[pos_]))) {
      ++pos_;
    }
  }

  char peek() {
    skipWhitespace();
    if (pos_ >= text_.size()) {
      throw std::runtime_error("unexpected end of JSON input");
    }
    return text_[pos_];
  }

  void expect(char c) {
    if (peek() != c) {
      throw std::runtime_error(std::string("expected '") + c + "'");
    }
    ++pos_;
  }

  double parseNumber() {
    skipWhitespace();
    const std::size_t start = pos_;
    if (pos_ < text_.size() && (text_[pos_] == '-' || text_[pos_] == '+')) {
      ++pos_;
    }
    while (pos_ < text_.size() &&
           (std::isdigit(static_cast<unsigned char>(text_[pos_])) ||
            text_[pos_] == '.' || text_[pos_] == 'e' || text_[pos_] == 'E' ||
            text_[pos_] == '-' || text_[pos_] == '+')) {
      ++pos_;
    }
    if (pos_ == start) throw std::runtime_error("expected number");
    return std::stod(text_.substr(start, pos_ - start));
  }

  std::string parseString() {
    expect('"');
    std::string value;
    while (pos_ < text_.size() && text_[pos_] != '"') {
      value += text_[pos_++];
    }
    expect('"');
    return value;
  }

  // Parses {"lat": <num>, "lon": <num>} in any key order.
  mower_map::GpsCoordinate parseGpsCoordinate() {
    mower_map::GpsCoordinate coordinate;
    expect('{');
    while (true) {
      skipWhitespace();
      const std::string key = parseString();
      skipWhitespace();
      expect(':');
      const double value = parseNumber();
      if (key == "lat") {
        coordinate.latitude = value;
      } else if (key == "lon") {
        coordinate.longitude = value;
      } else {
        throw std::runtime_error("unexpected key '" + key +
                                 "' in GPS coordinate");
      }
      skipWhitespace();
      if (peek() == ',') {
        ++pos_;
        continue;
      }
      break;
    }
    expect('}');
    return coordinate;
  }

  std::vector<mower_map::GpsCoordinate> parseGpsArray() {
    std::vector<mower_map::GpsCoordinate> points;
    expect('[');
    skipWhitespace();
    if (peek() == ']') {
      ++pos_;
      return points;
    }
    while (true) {
      points.push_back(parseGpsCoordinate());
      skipWhitespace();
      if (peek() == ',') {
        ++pos_;
        continue;
      }
      break;
    }
    expect(']');
    return points;
  }

  std::string text_;
  std::size_t pos_ = 0;
};

void writeGpsCoordinate(std::ostream& out,
                        const mower_map::GpsCoordinate& coordinate) {
  // Default ostream precision (6 significant digits) truncates longitudes
  // like 127.4531102 down to 127.453, silently discarding the sub-meter
  // detail the grid actually resolved. max_digits10 guarantees a
  // round-trippable double.
  out << std::setprecision(std::numeric_limits<double>::max_digits10)
      << "{\"lat\":" << coordinate.latitude
      << ",\"lon\":" << coordinate.longitude << "}";
}

}  // namespace

int main() {
  std::ostringstream buffer;
  buffer << std::cin.rdbuf();

  JsonReader::Request request;
  try {
    request = JsonReader(buffer.str()).parseRequest();
  } catch (const std::exception& error) {
    std::cerr << "invalid request JSON: " << error.what() << '\n';
    return 1;
  }

  mower_map::CoveragePlanResult result;
  try {
    result = mower_map::planCoverage(request.polygon, request.obstacles,
                                     request.cell_size_m);
  } catch (const std::exception& error) {
    std::cerr << "coverage planning failed: " << error.what() << '\n';
    return 1;
  }

  std::cout << "{\"rows\":" << result.rows << ",\"columns\":" << result.columns
            << ",\"origin\":";
  writeGpsCoordinate(std::cout, result.origin);
  std::cout << ",\"path\":[";
  for (std::size_t i = 0; i < result.path.size(); ++i) {
    if (i > 0) std::cout << ',';
    writeGpsCoordinate(std::cout, result.path[i]);
  }
  std::cout << "]}\n";
  return 0;
}
