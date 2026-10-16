import React, { createContext, useContext } from 'react';
import { overlayManager, OverlayLayer } from '../utils/overlayManager';
import { useOverlay, UseOverlayOptions, UseOverlayReturn } from '../hooks/useOverlay';

interface OverlayContextType {
  overlayManager: typeof overlayManager;
  OverlayLayer: typeof OverlayLayer;
}

const OverlayContext = createContext<OverlayContextType>({
  overlayManager,
  OverlayLayer
});

export const OverlayProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <OverlayContext.Provider value={{ overlayManager, OverlayLayer }}>
      {children}
    </OverlayContext.Provider>
  );
};

export const useOverlayContext = () => useContext(OverlayContext);
export { useOverlay, OverlayLayer, overlayManager };
export type { UseOverlayOptions, UseOverlayReturn };
