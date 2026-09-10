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
      <div className="robot-items">
        {robots.map((robot) => (
          <button
            key={robot.id}
            className={robot.id === selectedRobotId ? 'robot-item selected' : 'robot-item'}
            type="button"
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
