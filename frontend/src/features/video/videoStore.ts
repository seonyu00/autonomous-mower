import { create } from 'zustand';

type VideoStore = {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
};

export const useVideoStore = create<VideoStore>((set) => ({
  enabled: false,
  setEnabled: (enabled) => set({ enabled }),
}));
