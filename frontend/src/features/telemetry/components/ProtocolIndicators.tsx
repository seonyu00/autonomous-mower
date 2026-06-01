import { useTelemetryStore } from '../telemetryStore';

export function ProtocolIndicators() {
  const protocolState = useTelemetryStore((state) => state.protocolState);

  return (
    <div className="protocol-indicators" aria-label="프로토콜 상태">
      <Protocol name="HTTPS" state={protocolState.https} />
      <Protocol name="WSS" state={protocolState.wss} />
      <Protocol name="MQTT" state={protocolState.mqtt} />
    </div>
  );
}

function Protocol({ name, state }: { name: string; state: string }) {
  const normalized = state === 'connected' ? 'connected' : state === 'disconnected' ? 'offline' : 'degraded';

  return (
    <span className={`protocol ${normalized}`}>
      <span className={`dot ${normalized}`} />
      {name}
    </span>
  );
}
