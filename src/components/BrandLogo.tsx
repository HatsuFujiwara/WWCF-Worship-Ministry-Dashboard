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
 * BrandLogo has been deprecated in accordance with the requirement to remove all logos from the UI.
 * It renders null to guarantee no logo image, placeholder, or fallback is rendered.
 */
export const BrandLogo: React.FC<BrandLogoProps> = () => {
  return null;
};
