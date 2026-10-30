import { create } from 'zustand';
import {
  EqSetting,
  getAppConfig,
  getHeadsetSettings,
  HeadsetSettings,
  onHeadsetSettingsChanged,
  setButtonCycle,
  setHeadsetAutoOff,
  setHeadsetEq,
  setHeadsetMicEqPreset,
  setHeadsetMicMute,
  setHeadsetSidetone,
} from '../utils/tauri-bridge';

/** The 2023 model's hardware EQ range (Synapse's slider: minValue -5, maxValue 5, 11 steps). */
export const EQ_MIN_DB = -5;
export const EQ_MAX_DB = 5;

/** Synapse's built-in speaker EQ presets for the BlackShark V2 Pro and their on-device slots.
 *  Game/Music/Movie are fixed firmware curves; the bands here are what Synapse's UI displays. */
export const EQ_PRESETS: { name: string; index: number; bands: number[] }[] = [
  { name: 'Game', index: 7, bands: [3, 4, 5, 0, 0, 0, 4, 3, 4, 2] },
  { name: 'Movie', index: 9, bands: [3, 3, 3, 1, 4, 3, 3, 1, 3, 3] },
  { name: 'Music', index: 8, bands: [4, 4, 4, 0, 0, 1, 2, 3, 4, 0] },
  { name: 'Apex', index: 250, bands: [-1, 0, 0, 0, -1, 0, 2, 3, 2, 3] },
  { name: 'CoD', index: 254, bands: [-2, 0, 3, 3, 3, 3, 0, 0, 0, 0] },
  { name: 'CS', index: 251, bands: [-5, -4, 3, 5, 3, -2, 1, 5, 4, -4] },
  { name: 'Fortnite', index: 253, bands: [-4, 5, 5, 3, -2, 3, 4, 4, -1, 4] },
  { name: 'Valorant', index: 252, bands: [0, 0, 0, 0, 0, 1, 4, 4, 4, -3] },
];
export const CUSTOM_EQ_INDEX = 255;

/** Curated curves written into the Custom slot. Bands: 31, 63, 125, 250, 500, 1k, 2k, 4k, 8k, 16k Hz.
 *  Shifting a whole curve only changes loudness, so each one is shifted until its highest band
 *  sits at +5: same shape, as loud as the ±5 range allows. */
export const RECOMMENDED_EQ: { name: string; use: string; source: string; bands: number[] }[] = [
  {
    name: 'Reference',
    use: 'Music & general use: the most accurate sound',
    // AutoEQ FixedBandEQ for "Razer BlackShark V2 Pro 2023" (RTINGS HMS II.3 measurement, Harman target):
    // 6.9 3.4 -1.7 0.4 4.4 -0.9 -1.9 3.0 -5.4 -1.5 dB, rounded and clamped to the headset's ±5.
    source: 'AutoEQ (RTINGS measurement → Harman target)',
    bands: [5, 3, -2, 0, 4, -1, -2, 3, -5, -2],
  },
  {
    name: 'Reference Lite',
    use: 'Everyday listening, videos, calls: gentler correction',
    // Same AutoEQ correction at half strength (3 2 -1 0 2 0 -1 2 -3 -1), shifted +2.
    source: 'AutoEQ at 50%',
    bands: [5, 4, 1, 2, 4, 2, 1, 4, -1, 1],
  },
  {
    name: 'Bass Music',
    use: 'Hip-hop, EDM, pop: deep bass',
    // swissmacuser "music with deep bass" 8 6 8 6 4 2 1 3 5 4 (±12 model), shifted -3 to fit ±5.
    source: 'swissmacuser.ch, fitted to ±5',
    bands: [5, 3, 5, 3, 1, -1, -2, 0, 2, 1],
  },
  {
    name: 'Balanced Music',
    use: 'Rock, acoustic, mixed playlists',
    // swissmacuser "overall music experience" 1 1 2 6 4 2 1 3 -4 4 (±12 model), shifted -1 to fit ±5.
    source: 'swissmacuser.ch, fitted to ±5',
    bands: [0, 0, 1, 5, 3, 1, 0, 2, -5, 3],
  },
];

export const MIC_EQ_PRESETS = [
  { name: 'Default', index: 0 },
  { name: 'Mic Boost', index: 1 },
  { name: 'Broadcast', index: 2 },
  { name: 'Conference', index: 3 },
];

/** Everything the headset's EQ button can step through, as the backend stores it. */
export const CYCLE_CHOICES: EqSetting[] = [
  ...RECOMMENDED_EQ.map((r) => ({ name: r.name, preset: CUSTOM_EQ_INDEX, bands: r.bands })),
  ...EQ_PRESETS.map((p) => ({ name: p.name, preset: p.index, bands: p.bands })),
];
const DEFAULT_CYCLE = ['Reference', 'Bass Music', 'Balanced Music', 'Game'];
const CYCLE_SEEDED_KEY = 'frazer.cycleSeeded';

const EQ_DEBOUNCE_MS = 150;
let eqTimer: ReturnType<typeof setTimeout> | undefined;

interface HeadsetState {
  settings: HeadsetSettings | null;
  loading: boolean;
  error: string | null;
  /** Names of the presets the EQ button cycles through, in order. */
  buttonCycle: string[];
  loadSettings: (quiet?: boolean) => Promise<void>;
  loadConfig: () => Promise<void>;
  toggleCycleEntry: (name: string) => Promise<void>;
  applyEq: (preset: number, bands: number[], name?: string) => void;
  setSidetone: (enabled: boolean, level: number) => Promise<void>;
  setMicMute: (muted: boolean) => Promise<void>;
  setMicEqPreset: (preset: number) => Promise<void>;
  setAutoOff: (minutes: number) => Promise<void>;
}

export const useHeadsetStore = create<HeadsetState>((set, get) => {
  /** Optimistically patches settings, sends the command, reloads from the device on failure. */
  const write = async (patch: Partial<HeadsetSettings>, send: () => Promise<unknown>) => {
    set((s) => ({ settings: s.settings ? { ...s.settings, ...patch } : s.settings, error: null }));
    try {
      await send();
    } catch (e) {
      set({ error: String(e) });
      await get().loadSettings();
    }
  };

  const saveCycle = async (names: string[]) => {
    set({ buttonCycle: names });
    await setButtonCycle(names.map((n) => CYCLE_CHOICES.find((c) => c.name === n)!).filter(Boolean));
  };

  return {
    settings: null,
    loading: false,
    error: null,
    buttonCycle: [],

    /** `quiet` refreshes in place (no loading state), for updates pushed by the headset. */
    loadSettings: async (quiet = false) => {
      if (!quiet) set({ loading: true });
      try {
        set({ settings: await getHeadsetSettings(), error: null });
      } catch (e) {
        if (!quiet) set({ settings: null, error: String(e) });
      } finally {
        if (!quiet) set({ loading: false });
      }
    },

    loadConfig: async () => {
      const config = await getAppConfig();
      let names = config.button_cycle.map((c) => c.name).filter((n): n is string => !!n);
      // First run: give the EQ button a sensible cycle instead of the firmware's.
      if (names.length === 0 && !localStorage.getItem(CYCLE_SEEDED_KEY)) {
        localStorage.setItem(CYCLE_SEEDED_KEY, '1');
        names = DEFAULT_CYCLE;
        await saveCycle(names);
      }
      set({ buttonCycle: names });
    },

    toggleCycleEntry: async (name) => {
      const current = get().buttonCycle;
      const next = current.includes(name)
        ? current.filter((n) => n !== name)
        : CYCLE_CHOICES.map((c) => c.name!).filter((n) => n === name || current.includes(n));
      await saveCycle(next);
    },

    applyEq: (preset, bands, name) => {
      set((s) => ({
        settings: s.settings ? { ...s.settings, eq_enabled: true, eq_preset: preset, eq_bands: bands } : s.settings,
      }));
      clearTimeout(eqTimer);
      const clamped = bands.map((b) => Math.min(EQ_MAX_DB, Math.max(EQ_MIN_DB, Math.round(b))));
      eqTimer = setTimeout(() => write({}, () => setHeadsetEq(preset, clamped, name ?? null)), EQ_DEBOUNCE_MS);
    },

    setSidetone: (enabled, level) =>
      write({ sidetone_enabled: enabled, sidetone_level: level }, () => setHeadsetSidetone(enabled, level)),
    setMicMute: (muted) => write({ mic_muted: muted }, () => setHeadsetMicMute(muted)),
    setMicEqPreset: (preset) => write({ mic_eq_preset: preset }, () => setHeadsetMicEqPreset(preset)),
    setAutoOff: (minutes) => write({ auto_off_minutes: minutes }, () => setHeadsetAutoOff(minutes)),
  };
});

onHeadsetSettingsChanged(() => useHeadsetStore.getState().loadSettings(true));
