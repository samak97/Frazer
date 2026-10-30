import { motion } from 'framer-motion';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}

export const Toggle = ({ checked, onChange, label }: ToggleProps) => (
  <button
    role="switch"
    aria-checked={checked}
    aria-label={label}
    onClick={() => onChange(!checked)}
    className={`relative w-12 h-7 rounded-full p-1 flex transition-colors duration-300 ${
      checked ? 'accent-gradient justify-end' : 'bg-white/10 justify-start'
    }`}
  >
    <motion.span
      layout
      transition={{ type: 'spring', stiffness: 600, damping: 32 }}
      className="w-5 h-5 rounded-full bg-white shadow-md"
    />
  </button>
);
