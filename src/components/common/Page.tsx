import { motion, type Variants } from 'framer-motion';
import type { ReactNode } from 'react';

/** Children marked `variants={item}` fade/slide in one after another. */
export const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
};

export const item: Variants = {
  hidden: { opacity: 0, y: 14, filter: 'blur(4px)' },
  show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { type: 'spring', stiffness: 260, damping: 26 } },
};

interface PageProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}

export const Page = ({ title, subtitle, actions, children }: PageProps) => (
  <motion.div variants={stagger} initial="hidden" animate="show" exit={{ opacity: 0, y: -8, transition: { duration: 0.15 } }} className="space-y-6 pb-10">
    <motion.header variants={item} className="flex items-end justify-between gap-4">
      <div>
        <h1 className="text-[28px] font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-fg-muted text-sm mt-1">{subtitle}</p>}
      </div>
      {actions}
    </motion.header>
    {children}
  </motion.div>
);

export const Card = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <motion.section variants={item} className={`surface p-6 ${className}`}>
    {children}
  </motion.section>
);

export const CardTitle = ({ icon: Icon, title, hint, right }: { icon: any; title: string; hint?: string; right?: ReactNode }) => (
  <div className="flex items-center gap-3 mb-5">
    <div className="w-9 h-9 rounded-xl bg-mint/10 text-mint flex items-center justify-center">
      <Icon size={18} />
    </div>
    <div className="flex-1 min-w-0">
      <h2 className="font-semibold">{title}</h2>
      {hint && <p className="text-xs text-fg-dim mt-0.5">{hint}</p>}
    </div>
    {right}
  </div>
);
