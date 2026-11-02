import React from 'react';

export interface BrandLogoProps {
  onClick?: () => void;
  collapsed?: boolean;
  size?: 'sm' | 'md' | 'lg';
  showSubtitle?: boolean;
  className?: string;
  dataTour?: string;
}

/**
 * Official WWCF Santa Cruz Brand Logo component.
 * Renders the official church logo asset cleanly and responsively across
 * light and AMOLED dark themes, supporting collapsed navigation and custom sizing.
 */
export const BrandLogo: React.FC<BrandLogoProps> = ({
  onClick,
  collapsed = false,
  size = 'md',
  showSubtitle = true,
  className = '',
  dataTour
}) => {
  const sizeClasses = {
    sm: 'w-7 h-7',
    md: 'w-8 h-8',
    lg: 'w-10 h-10'
  };

  const imageElement = (
    <img
      src="/assets/WWCF_Santa_Cruz_Logo_1b75bc.png"
      alt="Word for the World Christian Fellowship - Santa Cruz"
      className={`${sizeClasses[size]} object-contain shrink-0 rounded-lg select-none`}
      loading="eager"
      onError={(e) => {
        // Fallback to wwcf-logo.png if needed
        const target = e.target as HTMLImageElement;
        if (!target.src.endsWith('wwcf-logo.png')) {
          target.src = '/assets/wwcf-logo.png';
        }
      }}
    />
  );

  const content = (
    <div className={`flex items-center gap-2.5 ${className}`}>
      {imageElement}
      {!collapsed && (
        <div className="min-w-0 flex flex-col justify-center text-left">
          <span className="text-xs font-black tracking-tight text-slate-900 dark:text-slate-100 truncate">
            WWCF Santa Cruz
          </span>
          {showSubtitle && (
            <span className="text-[10px] font-bold text-[#1b75bc] dark:text-[#54b0e2] tracking-wider uppercase truncate">
              Worship Ministry
            </span>
          )}
        </div>
      )}
    </div>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        data-tour={dataTour}
        className="flex items-center text-left cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#1b75bc] rounded-xl group p-1 -m-1 transition-opacity hover:opacity-90 active:scale-98"
        aria-label="WWCF Santa Cruz Worship Ministry Home"
      >
        {content}
      </button>
    );
  }

  return (
    <div data-tour={dataTour} className="flex items-center">
      {content}
    </div>
  );
};
