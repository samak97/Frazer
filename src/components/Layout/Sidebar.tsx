import { motion } from 'framer-motion';
import { Activity, SlidersHorizontal, Volume2, Mic2, Settings2, Layers, Info, BatteryCharging, BatteryMedium } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import { useAudioStore } from '../../stores/audioStore';
import { deviceName, unsupportedDevice } from '../../utils/deviceSupport';

const NAV = [
  { id: 'dashboard', icon: Activity, label: 'Dashboard' },
  { id: 'equalizer', icon: SlidersHorizontal, label: 'Equalizer' },
  { id: 'microphone', icon: Mic2, label: 'Microphone' },
  { id: 'mixer', icon: Volume2, label: 'Volume Mixer' },
  { id: 'profiles', icon: Layers, label: 'Profiles' },
  { id: 'settings', icon: Settings2, label: 'Settings' },
  { id: 'about', icon: Info, label: 'About' },
];

const NavItem = ({ id, icon: Icon, label }: (typeof NAV)[number]) => {
  const { activeTab, setActiveTab } = useUIStore();
  const active = activeTab === id;
  return (
    <button
      onClick={() => setActiveTab(id)}
      className={`relative w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm transition-colors ${
        active ? 'text-fg' : 'text-fg-muted hover:text-fg hover:bg-white/[0.03]'
      }`}
    >
      {active && (
        <motion.span
          layoutId="nav-pill"
          transition={{ type: 'spring', stiffness: 420, damping: 34 }}
          className="absolute inset-0 rounded-xl bg-white/[0.06] border border-line"
        >
          <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full accent-gradient" />
        </motion.span>
      )}
      <Icon size={18} className={`relative ${active ? 'text-mint' : ''}`} />
      <span className="relative font-medium">{label}</span>
    </button>
  );
};

/** Live headset status at the bottom of the sidebar. */
const HeadsetChip = () => {
  const headset = useAudioStore((s) => s.headsets[0]);
  const other = useAudioStore((s) => (s.headsets[0] ? undefined : unsupportedDevice(s.detected)));
  const battery = headset?.battery_level;
  const Icon = headset?.is_charging ? BatteryCharging : BatteryMedium;
  const online = !!headset?.is_connected;

  return (
    <div className="surface p-3.5 !rounded-2xl">
      <div className="flex items-center gap-2 text-xs">
        <span className="relative flex w-2 h-2">
          {online && <span className="absolute inset-0 rounded-full bg-mint animate-ping opacity-60" />}
          <span className={`relative w-2 h-2 rounded-full ${online ? 'bg-mint' : 'bg-fg-dim'}`} />
        </span>
        <span className="text-fg-muted truncate">
          {headset ? (online ? 'Connected' : 'Headset off') : other?.status === 'unsupported' ? 'Not supported yet' : 'No headset'}
        </span>
      </div>
      {other?.status === 'unsupported' && <p className="text-sm font-semibold mt-2 truncate">{deviceName(other).replace('Razer ', '')}</p>}
      {headset && (
        <>
          <p className="text-sm font-semibold mt-2 truncate">{headset.name.replace('Razer ', '')}</p>
          {battery != null && (
            <div className="flex items-center gap-2 mt-2">
              <Icon size={15} className={battery < 20 ? 'text-coral' : 'text-mint'} />
              <div className="flex-1 h-1.5 rounded-full bg-white/[0.07] overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${battery}%` }}
                  transition={{ type: 'spring', stiffness: 80, damping: 20 }}
                  className={`h-full rounded-full ${battery < 20 ? 'bg-coral' : 'accent-gradient'}`}
                />
              </div>
              <span className="text-xs font-mono text-fg-muted">{battery}%</span>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export const Sidebar = () => (
  <aside className="w-sidebar shrink-0 flex flex-col gap-6 p-4 border-r border-line bg-ink-950/40 backdrop-blur-xl">
    <nav className="space-y-1 mt-2">
      {NAV.map((n) => (
        <NavItem key={n.id} {...n} />
      ))}
    </nav>
    <div className="mt-auto">
      <HeadsetChip />
    </div>
  </aside>
);
