import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from './components/ErrorBoundary';
import { getLyricsOutputSessionFromLocation } from './utils/lyricsPresentationChannel';
import './index.css';

const LyricsAudienceOutput = lazy(() =>
  import('./components/LyricsAudienceOutput').then((m) => ({ default: m.LyricsAudienceOutput }))
);

const MainWorkspace = lazy(async () => {
  const [{ default: App }, { OverlayProvider }, { StorageService }] = await Promise.all([
    import('./App.tsx'),
    import('./context/OverlayContext'),
    import('./services/storage')
  ]);
  StorageService.applyAccessibilityToDOM(StorageService.getAccessibilitySettings());
  StorageService.applyAppearanceToDOM();
  return {
    default: () => (
      <OverlayProvider>
        <App />
      </OverlayProvider>
    )
  };
});

const audienceOutputSessionId = getLyricsOutputSessionFromLocation();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      {audienceOutputSessionId ? (
        <Suspense fallback={<div className="fixed inset-0 bg-black" />}>
          <LyricsAudienceOutput sessionId={audienceOutputSessionId} />
        </Suspense>
      ) : (
        <Suspense fallback={<div className="fixed inset-0 bg-black" />}>
          <MainWorkspace />
        </Suspense>
      )}
    </ErrorBoundary>
  </StrictMode>
);

