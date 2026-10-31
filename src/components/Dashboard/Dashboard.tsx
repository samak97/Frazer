import { useEffect, useState } from 'react';
import { getVersion } from '@tauri-apps/api/app';
import { openUrl } from '@tauri-apps/plugin-opener';
import { motion } from 'framer-motion';
import { Mic, MicOff, VolumeX, Ear, SlidersHorizontal, Power, RefreshCw, BatteryCharging, Wifi, MessageSquarePlus } from 'lucide-react';
import { useAudioStore } from '../../stores/audioStore';
import { CUSTOM_EQ_INDEX, EQ_PRESETS, RECOMMENDED_EQ, useHeadsetStore } from '../../stores/headsetStore';
import { useUIStore } from '../../stores/uiStore';
import { Page, item } from '../common/Page';
import logo from '../../assets/logo.svg';
import { deviceName, supportRequestUrl, unsupportedDevice, usbId } from '../../utils/deviceSupport';

const RING = 2 * Math.PI * 70;

const BatteryRing = ({ level, charging }: { level: number | null; charging: boolean }) => {
  const pct = level ?? 0;
  const low = level != null && level < 20;
  return (
    <div className="relative w-44 h-44">
      <svg viewBox="0 0 160 160" className="w-full h-full -rotate-90">
        <defs>
          <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#22d3ee" />
            <stop offset="1" stopColor="#3df5b0" />
          </linearGradient>
        </defs>
        <circle cx="80" cy="80" r="70" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="10" />
        <motion.circle
          cx="80" cy="80" r="70" fill="none"
          stroke={low ? '#ff6b81' : 'url(#ring)'}
          strokeWidth="10" strokeLinecap="round"
          strokeDasharray={RING}
          initial={{ strokeDashoffset: RING }}
          animate={{ strokeDashoffset: RING * (1 - pct / 100) }}
          transition={{ type: 'spring', stiffness: 40, damping: 16 }}
          style={{ filter: 'drop-shadow(0 0 8px rgba(61,245,176,0.45))' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {charging && <BatteryCharging size={18} className="text-mint mb-1" />}
        <span className="text-4xl font-semibold tabular-nums">{level == null ? '—' : level}</span>
        <span className="text-xs text-fg-dim uppercase tracking-widest mt-1">{charging ? 'Charging' : 'Battery'}</span>
      </div>
    </div>
  );
};

const Stat = ({ icon: Icon, label, value, onClick, accent }: { icon: any; label: string; value: string; onClick?: () => void; accent?: boolean }) => (
  <motion.button
    variants={item}
    whileHover={{ y: -3 }}
    whileTap={{ scale: 0.97 }}
    onClick={onClick}
    className="surface surface-hover p-5 text-left flex flex-col gap-3"
  >
    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${accent ? 'bg-coral/15 text-coral' : 'bg-mint/10 text-mint'}`}>
      <Icon size={18} />
    </div>
    <div>
      <p className="text-xs text-fg-dim uppercase tracking-wider">{label}</p>
      <p className="font-semibold mt-1 truncate">{value}</p>
    </div>
  </motion.button>
);

function eqName(preset: number | null | undefined, bands: number[] | null | undefined) {
  if (preset == null) return '—';
  if (preset === CUSTOM_EQ_INDEX) {
    return RECOMMENDED_EQ.find((r) => bands && r.bands.every((b, i) => b === bands[i]))?.name ?? 'Custom';
  }
  return EQ_PRESETS.find((p) => p.index === preset)?.name ?? `Slot ${preset}`;
}

export const Dashboard = () => {
  const { headsets, headsetsLoaded, detected, fetchHeadsets, toggleMasterMute } = useAudioStore();
  const { settings, loadSettings, setMicMute } = useHeadsetStore();
  const setActiveTab = useUIStore((s) => s.setActiveTab);
  const headset = headsets[0];
  const other = headset ? undefined : unsupportedDevice(detected);
  const [version, setVersion] = useState('');
  useEffect(() => {
    getVersion().then(setVersion).catch(() => {});
  }, []);

  useEffect(() => {
    fetchHeadsets();
    loadSettings(true);
    const id = setInterval(fetchHeadsets, 30000);
    return () => clearInterval(id);
  }, [fetchHeadsets, loadSettings]);

  const muted = settings?.mic_muted ?? false;

  return (
    <Page
      title="Dashboard"
      subtitle="Your Razer audio, without the bloat."
      actions={
        <button onClick={() => { fetchHeadsets(); loadSettings(true); }} className="chip chip-idle flex items-center gap-2">
          <RefreshCw size={14} /> Refresh
        </button>
      }
    >
      <motion.section variants={item} className="surface relative overflow-hidden p-8 flex items-center gap-10">
        <div className="absolute -right-24 -top-24 w-96 h-96 rounded-full bg-mint/10 blur-3xl" />
        {!headsetsLoaded ? (
          <div className="skeleton w-44 h-44 !rounded-full" />
        ) : headset ? (
          <BatteryRing level={headset.battery_level} charging={headset.is_charging} />
        ) : (
          <img src={logo} alt="" className="w-40 h-40 opacity-60 animate-float" />
        )}
        <div className="relative flex-1 min-w-0">
          <div className="flex items-center gap-2 text-sm">
            <span className={`w-2 h-2 rounded-full ${headset?.is_connected ? 'bg-mint shadow-[0_0_12px_#3df5b0]' : 'bg-fg-dim'}`} />
            <span className="text-fg-muted">
              {headset
                ? headset.is_connected ? 'Connected' : 'Dongle found, headset is off'
                : !other ? 'Plug in the HyperSpeed dongle'
                : other.status === 'identifying' ? 'Identifying your Razer device…'
                : other.status === 'unsupported' ? 'Detected, not supported yet'
                : 'Razer device found, but it could not be identified'}
            </span>
          </div>
          <h2 className="text-3xl font-semibold tracking-tight mt-2">{headset?.name ?? (other ? deviceName(other) : 'No headset')}</h2>
          {other && other.status !== 'identifying' && (
            <div className="mt-3 space-y-3">
              <p className="text-sm text-fg-muted max-w-lg">
                {other.status === 'unsupported'
                  ? "Frazer doesn't support this headset's chip yet. Send a support request so it can be added, usually together with the rest of its family."
                  : "This may be an older model, or Frazer couldn't reach Razer's server to identify it. A support request with its USB ID helps add it."}
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <button onClick={() => openUrl(supportRequestUrl(other, version))} className="chip chip-active flex items-center gap-2">
                  <MessageSquarePlus size={14} /> Request support
                </button>
                <span className="text-xs text-fg-dim">
                  USB {usbId(other.pid)}{other.family ? ' · ' + other.family : ''}
                </span>
              </div>
            </div>
          )}
          {headset && (
            <div className="flex items-center gap-2 mt-3 text-sm text-fg-muted">
              <Wifi size={15} /> {headset.connection_type}
            </div>
          )}
        </div>
        <img src={logo} alt="" className="relative w-28 h-28 animate-float drop-shadow-[0_20px_40px_rgba(61,245,176,0.25)]" />
      </motion.section>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat icon={SlidersHorizontal} label="Equalizer" value={eqName(settings?.eq_preset, settings?.eq_bands)} onClick={() => setActiveTab('equalizer')} />
        <Stat
          icon={muted ? MicOff : Mic}
          label="Microphone"
          value={settings ? (muted ? 'Muted, tap to unmute' : 'Live, tap to mute') : '—'}
          accent={muted}
          onClick={() => settings && setMicMute(!muted)}
        />
        <Stat
          icon={Ear}
          label="Sidetone"
          value={settings?.sidetone_enabled == null ? '—' : settings.sidetone_enabled ? `On · ${settings.sidetone_level}%` : 'Off'}
          onClick={() => setActiveTab('microphone')}
        />
        <Stat
          icon={Power}
          label="Auto power-off"
          value={settings?.auto_off_minutes == null ? '—' : settings.auto_off_minutes === 0 ? 'Never' : `${settings.auto_off_minutes} min`}
          onClick={() => setActiveTab('settings')}
        />
      </div>

      <motion.div variants={item} className="flex gap-3">
        <button onClick={toggleMasterMute} className="chip chip-idle flex items-center gap-2 !py-2.5 !px-4">
          <VolumeX size={15} /> Mute PC audio
        </button>
      </motion.div>
    </Page>
  );
};
