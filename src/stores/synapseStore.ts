import { create } from 'zustand';
import { getSynapseStatus, onSynapseChanged, setSynapseAutostart, stopSynapse, SynapseStatus } from '../utils/tauri-bridge';

interface SynapseState {
  status: SynapseStatus | null;
  error: string | null;
  refresh: () => Promise<void>;
  stop: () => Promise<void>;
  setAutostart: (enabled: boolean) => Promise<void>;
}

export const useSynapseStore = create<SynapseState>((set) => {
  const run = async (action: () => Promise<SynapseStatus>) => {
    try {
      set({ status: await action(), error: null });
    } catch (e) {
      set({ error: String(e) });
    }
  };
  return {
    status: null,
    error: null,
    refresh: () => run(getSynapseStatus),
    stop: () => run(stopSynapse),
    setAutostart: (enabled) => run(() => setSynapseAutostart(enabled)),
  };
});

onSynapseChanged((status) => useSynapseStore.setState({ status }));
useSynapseStore.getState().refresh();
