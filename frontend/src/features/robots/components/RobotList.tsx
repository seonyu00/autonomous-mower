import { useRobotStore } from '../robotStore';

export function RobotList() {
  const robots = useRobotStore((state) => state.robots);
  const selectedRobotId = useRobotStore((state) => state.selectedRobotId);
  const selectRobot = useRobotStore((state) => state.selectRobot);

  return (
    <section className="robot-list" aria-label="로봇 목록">
      <div className="section-heading">
        <span>로봇 목록</span>
        <small>{robots.length}대</small>
      </div>
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
