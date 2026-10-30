import { create } from 'zustand';
import { 
  getConnectedHeadsets, 
  onDeviceChange, 
  HeadsetInfo 
} from '../utils/tauri-bridge';
import { invoke } from "@tauri-apps/api/core";

export interface AudioDevice {
  id: string;
  name: string;
  is_default: boolean;
}

export interface AudioSession {
  name: string;
  volume: number;
  is_muted: boolean;
  process_id: number;
}

interface AudioState {
  devices: AudioDevice[];
  sessions: AudioSession[];
  headsets: HeadsetInfo[];
  isLoading: boolean;
  
  fetchDevices: () => Promise<void>;
  fetchSessions: () => Promise<void>;
  fetchHeadsets: () => Promise<void>;
  updateSessionVolume: (pid: number, volume: number) => Promise<void>;
  toggleSessionMute: (pid: number, currentMute: boolean) => Promise<void>;
  toggleMasterMute: () => Promise<void>;
}

export const useAudioStore = create<AudioState>((set) => ({
  devices: [],
  sessions: [],
  headsets: [],
  isLoading: false,

  fetchDevices: async () => {
    try {
      const devices = await invoke<AudioDevice[]>("list_audio_devices");
      set({ devices });
    } catch (error) {
      console.error("Failed to fetch devices:", error);
    }
  },

  fetchSessions: async () => {
    try {
      const sessions = await invoke<AudioSession[]>("list_audio_sessions");
      set({ sessions });
    } catch (error) {
      console.error("Failed to fetch sessions:", error);
    }
  },

  fetchHeadsets: async () => {
    const headsets = await getConnectedHeadsets();
    set({ headsets });
  },

  updateSessionVolume: async (pid: number, volume: number) => {
    try {
      await invoke("update_session_volume", { pid, volume });
      // Optimistic update
      set((state) => ({
        sessions: state.sessions.map((s) => 
          s.process_id === pid ? { ...s, volume } : s
        ),
      }));
    } catch (error) {
      console.error("Failed to update volume:", error);
    }
  },

  toggleSessionMute: async (pid: number, currentMute: boolean) => {
    try {
      const newMute = !currentMute;
      await invoke("set_session_mute_state", { pid, mute: newMute });
      set((state) => ({
        sessions: state.sessions.map((s) => 
          s.process_id === pid ? { ...s, is_muted: newMute } : s
        ),
      }));
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

// Initialize listeners
onDeviceChange((headsets) => {
  useAudioStore.setState({ headsets });
});
