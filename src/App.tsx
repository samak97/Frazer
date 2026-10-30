import { Layout } from './components/Layout/Layout';
import { DeviceCard } from './components/Dashboard/DeviceCard';
import { AppVolumeMixer } from './components/Mixer/AppVolumeMixer';
import { EqualizerPanel } from './components/Equalizer/EqualizerPanel';
import { MicrophonePanel } from './components/Microphone/MicrophonePanel';
import { SettingsPanel } from './components/Settings/SettingsPanel';
import { ProfilesPanel } from './components/Profiles/ProfilesPanel';
import { useUIStore } from './stores/uiStore';
import { useAudioStore } from './stores/audioStore';
import { useHeadsetStore } from './stores/headsetStore';
import { motion, AnimatePresence } from 'framer-motion';
import { VolumeX, MicOff, RefreshCw } from 'lucide-react';

const QuickAction = ({ icon: Icon, label, color, onClick }: { icon: any, label: string, color: string, onClick?: () => void }) => (
  <motion.button
    whileHover={{ y: -4 }}
    whileTap={{ scale: 0.95 }}
    onClick={onClick}
    className="glass p-6 rounded-3xl border border-border-color flex flex-col items-center gap-4 group min-w-[140px]"
  >
    <div className={`p-4 rounded-2xl ${color} text-white shadow-lg transition-transform group-hover:scale-110`}>
      <Icon size={24} />
    </div>
    <span className="text-sm font-semibold text-text-secondary group-hover:text-text-primary">{label}</span>
  </motion.button>
);

const toggleHeadsetMic = async () => {
  const store = useHeadsetStore.getState();
  if (!store.settings) await store.loadSettings();
  const muted = useHeadsetStore.getState().settings?.mic_muted;
  if (muted !== null && muted !== undefined) await store.setMicMute(!muted);
};

const DashboardContent = () => (
  <div className="space-y-12 pb-20 animate-in fade-in duration-500">
    <section>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
          <p className="text-text-dim mt-1">Your connected Razer audio hardware.</p>
        </div>
        <button
          onClick={() => useAudioStore.getState().fetchHeadsets()}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-white/5 border border-border-color text-sm font-bold hover:bg-white/10 transition-all"
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      <div className="flex gap-8 flex-wrap">
        <DeviceCard />
      </div>
    </section>

    <section>
      <h2 className="text-xl font-bold tracking-tight mb-8">Quick Actions</h2>
      <div className="flex gap-6 overflow-x-auto pb-4">
        <QuickAction
          icon={VolumeX}
          label="Mute PC Audio"
          color="bg-red-500"
          onClick={() => useAudioStore.getState().toggleMasterMute()}
        />
        <QuickAction icon={MicOff} label="Toggle Mic" color="bg-accent-primary" onClick={toggleHeadsetMic} />
      </div>
    </section>
  </div>
);

const MixerContent = () => (
  <div className="space-y-8 animate-in fade-in duration-500">
    <div className="flex items-center justify-between">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Audio Control</h2>
        <p className="text-text-dim mt-1">Real-time per-application volume mixing.</p>
      </div>
    </div>
    <AppVolumeMixer />
  </div>
);

function App() {
  const { activeTab } = useUIStore();

  return (
    <Layout>
      <div className="h-full">
        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && <DashboardContent key="dashboard" />}
          {activeTab === 'equalizer' && <EqualizerPanel key="equalizer" />}
          {activeTab === 'mixer' && <MixerContent key="mixer" />}
          {activeTab === 'microphone' && <MicrophonePanel key="microphone" />}
          {activeTab === 'profiles' && <ProfilesPanel key="profiles" />}
          {activeTab === 'settings' && <SettingsPanel key="settings" />}
        </AnimatePresence>
      </div>
    </Layout>
  );
}

export default App;
