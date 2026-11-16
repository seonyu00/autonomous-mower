import importlib.util
import unittest


@unittest.skipUnless(importlib.util.find_spec('rclpy'), '실제 ROS 토픽 이름 검사')
class DualGpsRosTopicTest(unittest.TestCase):
    def test_dashboard_position_and_alias_do_not_remap_to_same_topic(self):
        import rclpy
        from libnmea_navsat_driver.driver import Ros2NMEADriver
        from sensor_msgs.msg import NavSatFix
        from jetson_mower_client.dual_gps_node import ROS_ARGUMENTS

        arguments = ['__node:=dual_gps_graph_test' if arg.startswith('__node:=') else arg
                     for arg in ROS_ARGUMENTS]
        rclpy.init(args=arguments)
        node = Ros2NMEADriver()
        try:
            alias = node.create_publisher(NavSatFix, '/dual_gps/main_fix', 10)
            strict = node.create_publisher(NavSatFix, '/dual_gps/fix', 10)
            self.assertEqual(node.fix_pub.topic_name, '/fix')
            self.assertEqual(alias.topic_name, '/dual_gps/main_fix')
            self.assertEqual(strict.topic_name, '/dual_gps/fix')
        finally:
            node.destroy_node()
            rclpy.shutdown()
