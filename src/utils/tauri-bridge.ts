import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface Capabilities {
  battery: boolean;
  eq: boolean;
  sidetone: boolean;
  mic_mute: boolean;
  mic_eq: boolean;
  auto_off: boolean;
}

export interface HeadsetInfo {
  name: string;
  battery_level: number | null;
  is_charging: boolean;
  /** Dongle plugged in and headset powered on. */
  is_connected: boolean;
  connection_type: string;
  capabilities: Capabilities;
}

export interface HeadsetSettings {
  /** Hardware EQ active; Synapse switches it off while THX Spatial is on. */
  eq_enabled: boolean | null;
  eq_group: number | null;
  eq_preset: number | null;
  eq_bands: number[] | null;
  sidetone_enabled: boolean | null;
  /** 0–100 */
  sidetone_level: number | null;
  mic_muted: boolean | null;
  mic_eq_preset: number | null;
  auto_off_minutes: number | null;
  firmware: string | null;
  serial: string | null;
}

export const getConnectedHeadsets = async (): Promise<HeadsetInfo[]> => {
  try {
    return await invoke<HeadsetInfo[]>("get_connected_headsets");
  } catch (error) {
    console.error("Failed to fetch headsets:", error);
    return [];
  }
};

export interface EqSetting {
  name: string | null;
  preset: number;
  bands: number[];
}

export interface AppConfig {
  active_eq: EqSetting | null;
  button_cycle: EqSetting[];
  cycle_pos: number;
}

export const getHeadsetSettings = () => invoke<HeadsetSettings>("get_headset_settings");
export const setHeadsetEq = (preset: number, bands: number[], name: string | null) =>
  invoke("set_headset_eq", { preset, bands, name });
export const getAppConfig = () => invoke<AppConfig>("get_app_config");
export const setButtonCycle = (cycle: EqSetting[]) => invoke("set_button_cycle", { cycle });
/** Fired when the headset changed something itself (EQ button, mic button, power). */
export const onHeadsetSettingsChanged = (callback: () => void) => listen("headset-settings-changed", () => callback());
export const setHeadsetSidetone = (enabled: boolean, level: number) => invoke("set_headset_sidetone", { enabled, level });
export const setHeadsetMicMute = (muted: boolean) => invoke("set_headset_mic_mute", { muted });
export const setHeadsetMicEqPreset = (preset: number) => invoke("set_headset_mic_eq_preset", { preset });
export const setHeadsetAutoOff = (minutes: number) => invoke("set_headset_auto_off", { minutes });
export const loadProfiles = <T>() => invoke<T[]>("load_profiles");
export const saveProfiles = <T>(profiles: T[]) => invoke("save_profiles", { profiles });

export const toggleMute = async (): Promise<boolean> => {
  try {
    return await invoke<boolean>("toggle_mute");
  } catch (error) {
    console.error("Failed to toggle mute:", error);
    return false;
  }
};

// Event listeners
export const onDeviceChange = (callback: (devices: HeadsetInfo[]) => void) => {
  return listen<HeadsetInfo[]>("device-changed", (event) => {
    callback(event.payload);
  });
};
