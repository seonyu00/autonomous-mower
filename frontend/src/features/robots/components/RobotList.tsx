import { useRobotStore } from '../robotStore';
import { env } from '../../../shared/config/env';

export function RobotList() {
  const robots = useRobotStore((state) => state.robots);
  const error = useRobotStore((state) => state.error);
  const selectedRobotId = useRobotStore((state) => state.selectedRobotId);
  const selectRobot = useRobotStore((state) => state.selectRobot);

  return (
    <section className="robot-list" aria-label="로봇 목록">
      <div className="section-heading">
        <span>로봇 목록</span>
        <small>{robots.length}대</small>
      </div>
      {env.enableMockRobots ? <p className="muted">샘플 로봇</p> : null}
      {error ? <p role="alert" className="warning-line">{error}</p> : null}
      {!error && robots.length === 0 ? <p className="muted">표시할 로봇이 없습니다.</p> : null}
      {robots.length > 0 ? (
        <label className="mobile-robot-selector">
          선택 장비
          <select value={selectedRobotId ?? ''} onChange={(event) => selectRobot(event.target.value)}>
            {!selectedRobotId ? <option value="" disabled>로봇을 선택하세요</option> : null}
            {robots.map((robot) => <option key={robot.id} value={robot.id}>{robot.id} · {robot.modelName}</option>)}
          </select>
        </label>
      ) : null}
      <div className="robot-items">
        {robots.map((robot) => (
          <button
            key={robot.id}
            className={robot.id === selectedRobotId ? 'robot-item selected' : 'robot-item'}
            type="button"
            aria-label={`${robot.id} ${robot.modelName}`}
            aria-pressed={robot.id === selectedRobotId}
            onClick={() => selectRobot(robot.id)}
          >
            <span className={`dot ${robot.connectionState}`} />
            <span>
              <strong>{robot.id}</strong>
              <small>{robot.modelName}</small>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
