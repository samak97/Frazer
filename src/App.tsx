import type { ComponentType } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Layout } from './components/Layout/Layout';
import { Dashboard } from './components/Dashboard/Dashboard';
import { AppVolumeMixer } from './components/Mixer/AppVolumeMixer';
import { EqualizerPanel } from './components/Equalizer/EqualizerPanel';
import { MicrophonePanel } from './components/Microphone/MicrophonePanel';
import { SettingsPanel } from './components/Settings/SettingsPanel';
import { ProfilesPanel } from './components/Profiles/ProfilesPanel';
import { useUIStore } from './stores/uiStore';

const PAGES: Record<string, ComponentType> = {
  dashboard: Dashboard,
  equalizer: EqualizerPanel,
  microphone: MicrophonePanel,
  mixer: AppVolumeMixer,
  profiles: ProfilesPanel,
  settings: SettingsPanel,
};

function App() {
  const activeTab = useUIStore((s) => s.activeTab);
  const Current = PAGES[activeTab] ?? Dashboard;

  return (
    <Layout>
      <AnimatePresence mode="wait">
        <Current key={activeTab} />
      </AnimatePresence>
    </Layout>
  );
}

export default App;
