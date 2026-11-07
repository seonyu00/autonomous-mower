#pragma once

#include <cmath>

namespace mower_map {

// 사용자가 제공한 HD-7000W 제원이다. 경로점은 차체의 기하 중심으로 해석한다.
inline constexpr double kMowerLengthM = 1.150;
inline constexpr double kMowerWidthM = 1.030;
inline constexpr double kMowerHeightM = 0.600;
inline constexpr double kCuttingWidthM = 0.650;

// 방향을 아직 정하지 않은 2D 미리보기에서 차체의 모든 모서리를 감싼다.
// GPS 오차·장착 오프셋·추가 여유와 실제 회전 궤적은 포함하지 않는다.
inline double mowerEnvelopeRadiusM() {
  return std::hypot(kMowerLengthM, kMowerWidthM) / 2;
}

}  // namespace mower_map
