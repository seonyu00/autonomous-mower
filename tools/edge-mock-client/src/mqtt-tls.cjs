const fs = require('node:fs');

function mqttTlsOptions(brokerUrl, caCertPath) {
  const tls = new URL(brokerUrl).protocol === 'mqtts:';
  if (caCertPath && !tls) {
    throw new Error('MQTT_CA_CERT_PATH는 mqtts:// 연결에서만 사용할 수 있습니다.');
  }
  if (!tls) return {};
  const options = { minVersion: 'TLSv1.2', rejectUnauthorized: true };
  if (caCertPath) {
    try {
      options.ca = fs.readFileSync(caCertPath);
    } catch {
      throw new Error('MQTT CA 인증서 파일을 읽을 수 없습니다.');
    }
  }
  return options;
}
module.exports = { mqttTlsOptions };
