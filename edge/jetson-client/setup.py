from setuptools import find_packages, setup

package_name = "jetson_mower_client"

setup(
    name=package_name,
    version="0.1.0",
    packages=find_packages(exclude=["tests"]),
    data_files=[
        ("share/ament_index/resource_index/packages", ["resource/" + package_name]),
        ("share/" + package_name, ["package.xml", "config.yaml.example"]),
    ],
    install_requires=["setuptools", "paho-mqtt", "PyYAML"],
    zip_safe=True,
    maintainer="Autonomous Mower Team",
    maintainer_email="dev@example.com",
    description="MQTT to ROS 2 edge client skeleton for the autonomous mower Jetson.",
    license="UNLICENSED",
    entry_points={
        "console_scripts": [
            "jetson_mower_client = jetson_mower_client.main:main",
        ],
    },
)
