import React from 'react';
import { useUIStore } from '../../stores/uiStore';
import { motion } from 'framer-motion';
import { 
  Activity, 
  SlidersHorizontal, 
  Volume2, 
  Mic2, 
  Settings2, 
  Layers, 
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface SidebarItemProps {
  icon: React.ElementType;
  label: string;
  active?: boolean;
  onClick: () => void;
}

const SidebarItem = ({ icon: Icon, label, active, onClick }: SidebarItemProps) => (
  <motion.div
    whileHover={{ x: 4 }}
    whileTap={{ scale: 0.98 }}
    onClick={onClick}
    className={cn(
      "group relative flex items-center gap-3 px-4 py-3 cursor-pointer rounded-xl transition-all duration-200",
      active 
        ? "bg-accent-primary text-white shadow-lg shadow-accent-primary/20" 
        : "text-text-secondary hover:text-text-primary hover:bg-white/5"
    )}
  >
    <Icon size={20} className={cn(active ? "text-white" : "text-accent-primary group-hover:scale-110 transition-transform")} />
    <span className="font-medium text-sm">{label}</span>
    {active && (
      <motion.div 
        layoutId="active-indicator"
        className="absolute left-0 w-1 h-6 bg-white rounded-r-full"
      />
    )}
  </motion.div>
);

export const Sidebar = () => {
  const { activeTab, setActiveTab } = useUIStore();

  const menuItems = [
    { id: 'dashboard', icon: Activity, label: 'Dashboard' },
    { id: 'equalizer', icon: SlidersHorizontal, label: 'Equalizer' },
    { id: 'mixer', icon: Volume2, label: 'Volume Mixer' },
    { id: 'microphone', icon: Mic2, label: 'Microphone' },
    { id: 'profiles', icon: Layers, label: 'Profiles' },
  ];

  return (
    <aside className="w-sidebar-width h-screen glass border-r border-border-color flex flex-col p-4 z-20 sticky top-0">
      <div className="flex items-center gap-3 px-2 mb-10 mt-2">
        <div className="w-10 h-10 rounded-xl bg-accent-primary flex items-center justify-center shadow-lg shadow-accent-primary/40">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-white">
            <path d="M12 5C17.5 5 22 12 22 12C22 12 17.5 19 12 19C6.5 19 2 12 2 12C2 12 6.5 5 12 5Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight gradient-text">Frazer</h1>
          <p className="text-[10px] uppercase tracking-widest text-text-dim font-bold">Razer, unbloated</p>
        </div>
      </div>

      <nav className="flex-1 space-y-2">
        {menuItems.map((item) => (
          <SidebarItem
            key={item.id}
            icon={item.icon}
            label={item.label}
            active={activeTab === item.id}
            onClick={() => setActiveTab(item.id)}
          />
        ))}
      </nav>

      <div className="mt-auto space-y-2 pt-4 border-t border-border-color">
        <SidebarItem icon={Settings2} label="Settings" onClick={() => setActiveTab('settings')} active={activeTab === 'settings'} />
      </div>
    </aside>
  );
};
