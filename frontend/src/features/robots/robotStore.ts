import { create } from 'zustand';
import { mockRobots } from './mockRobots';
import type { Robot } from './types';

type RobotStore = {
  robots: Robot[];
  selectedRobotId: string | null;
  selectRobot: (robotId: string) => void;
  setRobots: (robots: Robot[]) => void;
};

export const useRobotStore = create<RobotStore>((set) => ({
  robots: mockRobots,
  selectedRobotId: mockRobots[0]?.id ?? null,
  selectRobot: (robotId) => set({ selectedRobotId: robotId }),
  setRobots: (robots) =>
    set((state) => ({
      robots,
      selectedRobotId: state.selectedRobotId ?? robots[0]?.id ?? null,
    })),
}));
