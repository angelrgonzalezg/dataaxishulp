import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const REFRESH_INTERVAL_OPTIONS = [15000, 30000, 60000, 120000, 300000] as const;

interface StatusWallState {
  refreshIntervalMs: number;
  setRefreshIntervalMs: (value: number) => void;
}

export const useStatusWallStore = create<StatusWallState>()(
  persist(
    (set) => ({
      refreshIntervalMs: 60000,
      setRefreshIntervalMs: (refreshIntervalMs) => set({ refreshIntervalMs }),
    }),
    { name: 'dataaxis-hulp-statuswall' },
  ),
);
