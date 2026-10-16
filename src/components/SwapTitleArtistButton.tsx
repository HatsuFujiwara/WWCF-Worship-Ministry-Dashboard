import React from 'react';
import { ArrowUpDown } from 'lucide-react';

export interface SwapTitleArtistButtonProps {
  onSwap: () => void;
  disabled?: boolean;
  className?: string;
  size?: 'sm' | 'md';
}

export const SwapTitleArtistButton: React.FC<SwapTitleArtistButtonProps> = ({
  onSwap,
  disabled = false,
  className = '',
  size = 'md'
}) => {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onSwap();
      }}
      disabled={disabled}
      aria-label="Swap song title and artist"
      title="Swap song title and artist"
      className={`btn-tactile inline-flex items-center justify-center rounded-xl text-slate-500 hover:text-[#1b75bc] dark:hover:text-[#54b0e2] bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200/80 dark:border-white/10 transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#1b75bc] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed min-w-[44px] min-h-[44px] shrink-0 ${className}`}
    >
      <ArrowUpDown className={size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
    </button>
  );
};
