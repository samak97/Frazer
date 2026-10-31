import { create } from 'zustand';
import {
  DetectedDevice,
  getConnectedHeadsets,
  getDetectedDevices,
  onDetectedDevicesChanged,
  onDeviceChange,
  HeadsetInfo
} from '../utils/tauri-bridge';
import { invoke } from "@tauri-apps/api/core";

/** One mixer row: every audio session of one app. */
export interface AudioSession {
  id: string;
  name: string;
  /** PNG data URL, when the app's icon could be extracted. */
  icon: string | null;
  volume: number;
  is_muted: boolean;
  process_ids: number[];
}

interface AudioState {
  sessions: AudioSession[];
  headsets: HeadsetInfo[];
  headsetsLoaded: boolean;
  /** Razer audio devices plugged in, supported or not. */
  detected: DetectedDevice[];

  fetchSessions: () => Promise<void>;
  fetchHeadsets: () => Promise<void>;
  updateSessionVolume: (id: string, volume: number) => Promise<void>;
  toggleSessionMute: (id: string) => Promise<void>;
  toggleMasterMute: () => Promise<void>;
}

export const useAudioStore = create<AudioState>((set, get) => ({
  sessions: [],
  headsets: [],
  headsetsLoaded: false,
  detected: [],

  fetchSessions: async () => {
    try {
      const sessions = await invoke<AudioSession[]>("list_audio_sessions");
      set({ sessions });
    } catch (error) {
      console.error("Failed to fetch sessions:", error);
    }
  },

  fetchHeadsets: async () => {
    const [headsets, detected] = await Promise.all([getConnectedHeadsets(), getDetectedDevices()]);
    set({ headsets, detected, headsetsLoaded: true });
  },

  updateSessionVolume: async (id, volume) => {
    const session = get().sessions.find((s) => s.id === id);
    if (!session) return;
    set((state) => ({ sessions: state.sessions.map((s) => (s.id === id ? { ...s, volume } : s)) }));
    try {
      await invoke("update_session_volume", { pids: session.process_ids, volume });
    } catch (error) {
      console.error("Failed to update volume:", error);
    }
  },

  toggleSessionMute: async (id) => {
    const session = get().sessions.find((s) => s.id === id);
    if (!session) return;
    const mute = !session.is_muted;
    set((state) => ({ sessions: state.sessions.map((s) => (s.id === id ? { ...s, is_muted: mute } : s)) }));
    try {
      await invoke("set_session_mute_state", { pids: session.process_ids, mute });
    } catch (error) {
      console.error("Failed to toggle session mute:", error);
    }
  },

  toggleMasterMute: async () => {
    try {
      await invoke("toggle_mute");
    } catch (error) {
      console.error("Failed to toggle master mute:", error);
    }
  },
}));

onDeviceChange((headsets) => {
  useAudioStore.setState({ headsets, headsetsLoaded: true });
});

onDetectedDevicesChanged((detected) => {
  useAudioStore.setState({ detected });
});
