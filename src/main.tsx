import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import { OverlayProvider } from './context/OverlayContext';
import { StorageService } from './services/storage';
import './index.css';

// Immediately apply accessibility settings before initial render
StorageService.applyAccessibilityToDOM(StorageService.getAccessibilitySettings());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <OverlayProvider>
        <App />
      </OverlayProvider>
    </ErrorBoundary>
  </StrictMode>,
);
