cmake_minimum_required(VERSION 3.16)
project(mower_map)

if(NOT CMAKE_CXX_STANDARD)
  set(CMAKE_CXX_STANDARD 17)
endif()
set(CMAKE_CXX_STANDARD_REQUIRED ON)

find_package(ament_cmake REQUIRED)

add_library(mower_map_lib src/grid_map.cpp src/coverage_planner.cpp)
target_include_directories(mower_map_lib PUBLIC
  $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>)
target_compile_options(mower_map_lib PRIVATE -Wall -Wextra -Wpedantic)

# JSON-over-stdio CLI that cpp_bridge (ament_python) calls as a subprocess,
# since this package has no Python bindings. Installed to lib/mower_map so
# ament_index_python can locate it via get_package_prefix("mower_map").
add_executable(cpp_map_cli tools/cpp_map_cli.cpp)
target_link_libraries(cpp_map_cli PRIVATE mower_map_lib)

install(TARGETS cpp_map_cli
  DESTINATION lib/${PROJECT_NAME})

if(BUILD_TESTING)
  enable_testing()

  add_executable(mower_map_test tests/grid_map_test.cpp)
  target_link_libraries(mower_map_test PRIVATE mower_map_lib)
  add_test(NAME mower_map_test COMMAND mower_map_test)

  add_executable(coverage_planner_test tests/coverage_planner_test.cpp)
  target_link_libraries(coverage_planner_test PRIVATE mower_map_lib)
  add_test(NAME coverage_planner_test COMMAND coverage_planner_test)

  find_package(Python3 COMPONENTS Interpreter QUIET)
  if(Python3_Interpreter_FOUND)
    add_test(NAME cli_smoke_test
             COMMAND ${Python3_EXECUTABLE} ${CMAKE_CURRENT_SOURCE_DIR}/tests/cli_smoke_test.py
                     $<TARGET_FILE:cpp_map_cli>)
  endif()
endif()

ament_package()
