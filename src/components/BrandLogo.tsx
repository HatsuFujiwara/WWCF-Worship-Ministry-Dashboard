import React from 'react';

export interface BrandLogoProps {
  onClick?: () => void;
  collapsed?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showSubtitle?: boolean;
  className?: string;
  dataTour?: string;
}

/**
 * Official WWCF Santa Cruz Brand Logo component.
 * Renders only the square church logo asset cleanly across light and AMOLED
 * dark themes, supporting collapsed navigation and custom sizing.
 */
export const BrandLogo: React.FC<BrandLogoProps> = ({
  onClick,
  collapsed: _collapsed = false,
  size = 'md',
  showSubtitle: _showSubtitle = true,
  className = '',
  dataTour
}) => {
  const sizeClasses: Record<NonNullable<BrandLogoProps['size']>, string> = {
    sm: 'w-7 h-7',
    md: 'w-8 h-8',
    lg: 'w-10 h-10',
    xl: 'w-[76px] h-[76px]'
  };

  const imageElement = (
    <img
      src="/assets/wwcf-square-logo-blue.png"
      alt="Word for the World Christian Fellowship - Santa Cruz"
      className={`${sizeClasses[size]} object-contain shrink-0 rounded-lg select-none block ${className}`.trim()}
      loading="eager"
    />
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        data-tour={dataTour}
        className="inline-flex w-fit items-center justify-center shrink-0 cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#1b75bc] rounded-xl p-1 -m-1 transition-opacity hover:opacity-90 active:scale-98"
        aria-label="Go to Dashboard"
        title="Go to Dashboard"
      >
        {imageElement}
      </button>
    );
  }

  return (
    <div data-tour={dataTour} className="inline-flex w-fit items-center justify-center shrink-0">
      {imageElement}
    </div>
  );
};
