from __future__ import annotations

import argparse
import sys

from .config import load_config
from .pipeline import build_gstreamer_pipeline


def main() -> None:
    parser = argparse.ArgumentParser(
        description="ROS 2 컬러 영상을 MediaMTX RTSP로 송출합니다."
    )
    parser.add_argument(
        "--config",
        default="config.yaml",
        help="영상 송출 설정 파일 경로",
    )
    args = parser.parse_args()
    config = load_config(args.config)

    import gi

    gi.require_version("Gst", "1.0")
    from gi.repository import Gst
    import rclpy
    from rclpy.node import Node
    from sensor_msgs.msg import Image

    Gst.init(None)
    pipeline = Gst.parse_launch(build_gstreamer_pipeline(config))
    appsrc = pipeline.get_by_name("source")
    if appsrc is None:
        raise RuntimeError("GStreamer appsrc를 생성하지 못했습니다.")

    class VideoStreamerNode(Node):
        def __init__(self) -> None:
            super().__init__("jetson_video_streamer")
            self.frame_duration = Gst.util_uint64_scale_int(
                1, Gst.SECOND, config.fps
            )
            self.frame_index = 0
            self.create_subscription(
                Image,
                config.image_topic,
                self.on_image,
                5,
            )

        def on_image(self, message: Image) -> None:
            if (
                message.width != config.width
                or message.height != config.height
                or message.encoding.lower() != "rgb8"
            ):
                self.get_logger().error(
                    "지원하지 않는 영상입니다: "
                    f"{message.width}x{message.height} {message.encoding}"
                )
                return

            buffer = Gst.Buffer.new_allocate(None, len(message.data), None)
            buffer.fill(0, bytes(message.data))
            buffer.pts = self.frame_index * self.frame_duration
            buffer.dts = buffer.pts
            buffer.duration = self.frame_duration
            self.frame_index += 1
            result = appsrc.emit("push-buffer", buffer)
            if result != Gst.FlowReturn.OK:
                self.get_logger().error(
                    f"GStreamer buffer 전송 실패: {result}"
                )

    rclpy.init()
    node = VideoStreamerNode()
    if pipeline.set_state(Gst.State.PLAYING) == Gst.StateChangeReturn.FAILURE:
        node.destroy_node()
        rclpy.shutdown()
        raise RuntimeError("GStreamer pipeline을 시작하지 못했습니다.")

    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        appsrc.emit("end-of-stream")
        pipeline.set_state(Gst.State.NULL)
        node.destroy_node()
        rclpy.shutdown()


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"영상 송출기 실행 실패: {exc}", file=sys.stderr)
        raise
