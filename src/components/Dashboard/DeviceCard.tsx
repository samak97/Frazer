import React from 'react';
import { motion } from 'framer-motion';
import { Wifi, Battery, BatteryCharging } from 'lucide-react';
import { useAudioStore } from '../../stores/audioStore';

export const DeviceCard = () => {
  const { headsets, fetchHeadsets } = useAudioStore();

  React.useEffect(() => {
    fetchHeadsets();
    const interval = setInterval(fetchHeadsets, 30000);
    return () => clearInterval(interval);
  }, [fetchHeadsets]);

  const activeHeadset = headsets.length > 0 ? headsets[0] : null;

  if (!activeHeadset) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="premium-card border-2 border-dashed border-border-color p-8 flex flex-col items-center justify-center gap-4 text-text-dim w-[400px] h-[360px]"
      >
        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
          <span className="text-4xl font-light">+</span>
        </div>
        <p className="font-semibold text-sm">No supported headset detected</p>
        <p className="text-xs text-center">Plug in the HyperSpeed dongle. Frazer picks it up automatically.</p>
      </motion.div>
    );
  }

  const battery = activeHeadset.battery_level;
  const low = battery !== null && battery < 20;
  const BatteryIcon = activeHeadset.is_charging ? BatteryCharging : Battery;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="premium-card glass p-6 flex flex-col gap-6 w-[400px] relative overflow-hidden group"
    >
      <div className="flex justify-between items-start">
        <div className="space-y-1">
          <h3 className="text-xl font-bold tracking-tight">{activeHeadset.name}</h3>
          <p className="text-sm text-text-dim uppercase tracking-wider font-semibold">Wireless</p>
        </div>
        {activeHeadset.is_connected ? (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-success/10 border border-success/20">
            <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
            <span className="text-xs font-bold text-success uppercase">Connected</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10">
            <div className="w-2 h-2 rounded-full bg-text-dim" />
            <span className="text-xs font-bold text-text-dim uppercase">Headset off</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-center py-4 relative">
        <div className="w-48 h-48 rounded-full bg-accent-primary/10 flex items-center justify-center relative">
          <div className="absolute inset-0 bg-accent-primary/20 blur-[60px] rounded-full animate-pulse" />
          <svg width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="text-accent-primary opacity-50">
            <path d="M3 12c0-5 4-9 9-9s9 4 9 9v3a3 3 0 0 1-3 3h-1" />
            <path d="M16 19a2 2 0 0 1 2 2v1" />
            <rect x="3" y="12" width="4" height="8" rx="1" />
            <rect x="17" y="12" width="4" height="8" rx="1" />
          </svg>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white/5 p-4 rounded-2xl border border-white/5 flex flex-col gap-2">
          <div className="flex items-center justify-between text-text-dim">
            <span className="text-xs font-medium uppercase tracking-tight">
              {activeHeadset.is_charging ? 'Charging' : 'Battery'}
            </span>
            <BatteryIcon size={14} className={low ? "text-error" : "text-success"} />
          </div>
          <div className="flex items-end gap-2">
            <span className="text-2xl font-bold">{battery === null ? '—' : `${battery}%`}</span>
          </div>
          <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${battery ?? 0}%` }}
              className={`h-full rounded-full ${low ? "bg-error" : "bg-success shadow-[0_0_8px_rgba(16,185,129,0.5)]"}`}
            />
          </div>
        </div>

        <div className="bg-white/5 p-4 rounded-2xl border border-white/5 flex flex-col gap-2">
          <div className="flex items-center justify-between text-text-dim">
            <span className="text-xs font-medium uppercase tracking-tight">Link</span>
            <Wifi size={14} />
          </div>
          <div className="flex items-end gap-2">
            <span className="text-lg font-bold truncate">{activeHeadset.connection_type}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
