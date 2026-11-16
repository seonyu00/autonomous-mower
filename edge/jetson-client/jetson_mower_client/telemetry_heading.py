"""듀얼 GPS의 유효한 기체 방향만 관제 텔레메트리에 제공한다."""

from datetime import datetime
import json
import math


class TelemetryHeading:
    def __init__(self):
        self.latest = None
        self.last_measurement = float('-inf')
        self.received = None

    def update(self, payload, monotonic_s, unix_s):
        try:
            data = json.loads(payload)
            value = data.get('headingDegrees')
            observed = data.get('headingObservedAt')
            measured = datetime.fromisoformat(observed.replace('Z', '+00:00'))
            epoch = measured.timestamp()
            if (data.get('valid') is not True or data.get('source') != 'dual_gps_fixed_baseline'
                    or data.get('main_quality') != 4 or data.get('aux_quality') != 4
                    or type(value) not in (int, float) or not math.isfinite(value)
                    or not 0 <= value < 360 or measured.tzinfo is None
                    or not 0 <= unix_s - epoch < 3):
                raise ValueError()
            if epoch < self.last_measurement:
                return
            if epoch == self.last_measurement:
                if self.latest is not None and value != self.latest['headingDegrees']:
                    self.latest = None
                return
            self.last_measurement = epoch
            self.received = monotonic_s
            self.latest = {'headingDegrees': value, 'headingSource': 'dual-gps', 'headingObservedAt': observed}
        except (ValueError, TypeError, AttributeError, OverflowError):
            self.latest = None

    def snapshot(self, monotonic_s, unix_s):
        if self.latest is None or self.received is None:
            return None
        if not (0 <= monotonic_s - self.received < 3 and 0 <= unix_s - self.last_measurement < 3):
            return None
        return dict(self.latest)
