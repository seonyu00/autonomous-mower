import { create } from 'zustand';
import type { Robot, RobotConnectionState } from './types';

type RobotStore = {
  robots: Robot[];
  error: string | null;
  setError: (error: string | null) => void;
  selectedRobotId: string | null;
  selectRobot: (robotId: string) => void;
  setRobots: (robots: Robot[]) => void;
  setConnectionState: (robotId: string, connectionState: RobotConnectionState) => void;
};

export const useRobotStore = create<RobotStore>((set) => ({
  robots: [],
  error: null,
  setError: (error) => set({ error }),
  selectedRobotId: null,
  selectRobot: (robotId) => set((state) => ({ selectedRobotId: state.robots.some((robot) => robot.id === robotId) ? robotId : null })),
  setRobots: (robots) =>
    set((state) => ({
      robots,
      selectedRobotId: robots.some((robot) => robot.id === state.selectedRobotId) ? state.selectedRobotId : robots[0]?.id ?? null,
    })),
  setConnectionState: (robotId, connectionState) =>
    set((state) => ({
      robots: state.robots.map((robot) => (robot.id === robotId ? { ...robot, connectionState } : robot)),
    })),
}));
