import { create } from 'zustand';

type ControlStore = {
  hasControl: boolean;
  controlOwner: string | null;
  setControlOwner: (owner: string | null) => void;
};

export const useControlStore = create<ControlStore>((set) => ({
  hasControl: false,
  controlOwner: null,
  setControlOwner: (owner) => set({ controlOwner: owner, hasControl: Boolean(owner) }),
}));
