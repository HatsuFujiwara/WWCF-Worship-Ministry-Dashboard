import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';
import { Html5Qrcode } from 'html5-qrcode';
import { Member, Schedule, Song } from '../types';
import { StorageService, DraftSchedule } from '../services/storage';
import { SongService } from '../services/songService';
import { SongFamilyService } from '../services/songFamilyService';
import { LineupHistoryService } from '../services/lineupHistoryService';
import { useOverlay, OverlayLayer } from '../hooks/useOverlay';
import {
  X,
  QrCode,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowRightLeft,
  Camera,
  RefreshCw,
  RotateCcw,
  Upload,
  Download,
  Check,
  Sparkles,
  ArrowRight,
  ArrowLeft
} from 'lucide-react';

interface TransferDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  members: Member[];
  songs: Song[];
  schedules: Schedule[];
  labels: string[];
  draftSchedule?: DraftSchedule | null;
  onDataTransferred: () => void;
  showToast: (text: string, type?: 'success' | 'danger' | 'info') => void;
  initialSessionParams?: { sessionId: string; token: string } | null;
}

type MainMode = 'select' | 'send' | 'receive';
type ReceiveViewType = 'qr' | 'scanner';

type SendState =
  | 'idle'
  | 'creating'
  | 'waiting'
  | 'connected'
  | 'success'
  | 'expired'
  | 'error'
  | 'cancelled';

type ReceiveQrState =
  | 'idle'
  | 'creating'
  | 'waiting'
  | 'connected'
  | 'data_received'
  | 'importing'
  | 'success'
  | 'expired'
  | 'error'
  | 'cancelled';

type ScannerState =
  | 'idle'
  | 'scanning'
  | 'connecting'
  | 'confirm_import'
  | 'importing'
  | 'confirm_send'
  | 'uploading'
  | 'upload_success'
  | 'success'
  | 'error';

/**
 * Reusable helper to build transfer payload from application state.
 */
async function buildCurrentPayload(options: {
  members?: Member[];
  songs?: Song[];
  schedules?: Schedule[];
  labels?: string[];
  includeDraft: boolean;
  draftSchedule?: DraftSchedule | null;
  direction: 'pc_to_phone' | 'phone_to_pc';
}) {
  const currentMembers = options.members || StorageService.getMembersSync();
  const currentSongs = options.songs || (await SongService.getSongs());
  const currentSchedules = options.schedules || StorageService.getSchedulesSync();
  const currentLabels = options.labels || StorageService.getLabelsSync();
  const currentSongFamilies = await SongFamilyService.getSongFamilies();
  const currentDraft =
    options.draftSchedule !== undefined ? options.draftSchedule : StorageService.getDraftScheduleSync();

  return {
    app: 'WWCF Santa Cruz Worship Ministry',
    version: '1.0',
    exportedAt: new Date().toISOString(),
    direction: options.direction,
    data: {
      members: currentMembers,
      songs: currentSongs,
      schedules: currentSchedules,
      labels: currentLabels,
      songFamilies: currentSongFamilies,
      draft: options.includeDraft ? currentDraft : undefined
    }
  };
}

/**
 * Reusable helper to execute Merge or Replace data import on the local device.
 */
async function executeDataImport(incoming: any, strategy: 'merge' | 'replace'): Promise<void> {
  if (!incoming) return;

  if (strategy === 'replace') {
    if (Array.isArray(incoming.members)) {
      StorageService.saveMembers(incoming.members);
    }
    if (Array.isArray(incoming.labels)) {
      StorageService.saveLabels(incoming.labels);
    }
    if (Array.isArray(incoming.schedules)) {
      StorageService.saveSchedules(incoming.schedules);
    }
    if (Array.isArray(incoming.songs)) {
      await SongService.saveSongsList(incoming.songs);
    }
    if (Array.isArray(incoming.songFamilies)) {
      await SongFamilyService.saveSongFamilies(incoming.songFamilies);
    }
    if (incoming.draft !== undefined) {
      StorageService.saveDraftSchedule(incoming.draft);
    }
  } else {
    if (Array.isArray(incoming.members)) {
      const currentMembers = StorageService.getMembersSync();
      const memberMap = new Map<string, Member>();
      currentMembers.forEach((m) => memberMap.set(m.id, m));
      incoming.members.forEach((m: Member) => {
        if (!memberMap.has(m.id)) {
          memberMap.set(m.id, m);
        }
      });
      StorageService.saveMembers(Array.from(memberMap.values()));
    }

    if (Array.isArray(incoming.labels)) {
      const currentLabels = StorageService.getLabelsSync();
      const labelSet = new Set([...currentLabels, ...incoming.labels]);
      StorageService.saveLabels(Array.from(labelSet));
    }

    if (Array.isArray(incoming.schedules)) {
      const currentSchedules = StorageService.getSchedulesSync();
      const scheduleMap = new Map<string, Schedule>();
      currentSchedules.forEach((s) => scheduleMap.set(s.id, s));
      incoming.schedules.forEach((s: Schedule) => {
        if (!scheduleMap.has(s.id)) {
          scheduleMap.set(s.id, s);
        }
      });
      StorageService.saveSchedules(Array.from(scheduleMap.values()));
    }

    if (Array.isArray(incoming.songs)) {
      const currentSongs = await SongService.getSongs();
      const songMap = new Map<string, Song>();
      currentSongs.forEach((s) => songMap.set(s.id, s));
      incoming.songs.forEach((s: Song) => {
        if (!songMap.has(s.id)) {
          songMap.set(s.id, s);
        }
      });
      await SongService.saveSongsList(Array.from(songMap.values()));
    }

    if (Array.isArray(incoming.songFamilies)) {
      const currentFamilies = await SongFamilyService.getSongFamilies();
      const familyMap = new Map<string, any>();
      currentFamilies.forEach((f) => familyMap.set(f.id, f));
      incoming.songFamilies.forEach((f: any) => {
        if (!familyMap.has(f.id)) {
          familyMap.set(f.id, f);
        }
      });
      await SongFamilyService.saveSongFamilies(Array.from(familyMap.values()));
    }

    if (incoming.draft) {
      StorageService.saveDraftSchedule(incoming.draft);
    }
  }
}

export const TransferDataModal: React.FC<TransferDataModalProps> = ({
  isOpen,
  onClose,
  members,
  songs,
  schedules,
  labels,
  draftSchedule,
  onDataTransferred,
  showToast,
  initialSessionParams
}) => {
  // Device detection
  const [isMobileDevice, setIsMobileDevice] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return (
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
      window.innerWidth < 768
    );
  });

  useEffect(() => {
    const checkDevice = () => {
      setIsMobileDevice(
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
        window.innerWidth < 768
      );
    };
    window.addEventListener('resize', checkDevice);
    return () => window.removeEventListener('resize', checkDevice);
  }, []);

  const [mode, setMode] = useState<MainMode>('select');
  const [receiveViewType, setReceiveViewType] = useState<ReceiveViewType>('qr');

  // SEND State (Generates QR for receiver to scan)
  const [sendState, setSendState] = useState<SendState>('idle');
  const [includeDraftSend, setIncludeDraftSend] = useState<boolean>(Boolean(draftSchedule));
  const [sendQrDataUrl, setSendQrDataUrl] = useState<string>('');
  const [sendSessionId, setSendSessionId] = useState<string>('');
  const [sendSessionToken, setSendSessionToken] = useState<string>('');
  const [sendExpiresAt, setSendExpiresAt] = useState<number | null>(null);
  const [sendSecondsRemaining, setSendSecondsRemaining] = useState<number>(0);
  const [sendErrorMessage, setSendErrorMessage] = useState<string>('');

  // RECEIVE QR State (PC generates Receive QR for Phone to scan & upload)
  const [receiveQrState, setReceiveQrState] = useState<ReceiveQrState>('idle');
  const [receiveQrDataUrl, setReceiveQrDataUrl] = useState<string>('');
  const [receiveSessionId, setReceiveSessionId] = useState<string>('');
  const [receiveSessionToken, setReceiveSessionToken] = useState<string>('');
  const [receiveExpiresAt, setReceiveExpiresAt] = useState<number | null>(null);
  const [receiveSecondsRemaining, setReceiveSecondsRemaining] = useState<number>(0);
  const [receiveErrorMessage, setReceiveErrorMessage] = useState<string>('');
  const [receiveStrategy, setReceiveStrategy] = useState<'merge' | 'replace'>('merge');
  const [receiveCounts, setReceiveCounts] = useState<{
    members: number;
    songs: number;
    schedules: number;
    songFamilies: number;
    hasDraft: boolean;
  } | null>(null);
  const [receivePayload, setReceivePayload] = useState<any>(null);

  // SCANNER State (Phone scans PC's QR code)
  const [scannerState, setScannerState] = useState<ScannerState>('idle');
  const [cameraError, setCameraError] = useState<'permission_denied' | 'no_camera' | 'unavailable' | null>(null);
  const [scannerImportStrategy, setScannerImportStrategy] = useState<'merge' | 'replace'>('merge');
  const [scannerIncludeDraft, setScannerIncludeDraft] = useState<boolean>(Boolean(draftSchedule));
  const [localCountsSummary, setLocalCountsSummary] = useState<{
    members: number;
    songs: number;
    schedules: number;
    songFamilies: number;
  }>({ members: 0, songs: 0, schedules: 0, songFamilies: 0 });
  const [scannedSessionData, setScannedSessionData] = useState<{
    sessionId: string;
    token: string;
    direction: 'pc_to_phone' | 'phone_to_pc';
    counts: { members: number; songs: number; schedules: number; songFamilies: number; hasDraft: boolean };
    payloadData?: any;
  } | null>(null);
  const [scannerErrorMessage, setScannerErrorMessage] = useState<string>('');

  const html5QrcodeRef = useRef<Html5Qrcode | null>(null);
  const sendPollingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const sendCountdownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const receivePollingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const receiveCountdownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isSendPollingInFlightRef = useRef<boolean>(false);
  const isReceivePollingInFlightRef = useRef<boolean>(false);

  // Load counts summary
  useEffect(() => {
    if (isOpen) {
      SongFamilyService.getSongFamilies().then((fams) => {
        setLocalCountsSummary({
          members: members.length,
          songs: songs.length,
          schedules: schedules.length,
          songFamilies: fams.length
        });
      });
    }
  }, [isOpen, members, songs, schedules]);

  // Handle URL query direct connect
  useEffect(() => {
    if (isOpen && initialSessionParams && initialSessionParams.sessionId && initialSessionParams.token) {
      setMode('receive');
      setReceiveViewType('scanner');
      handleConnectToSession(initialSessionParams.sessionId, initialSessionParams.token);
    }
  }, [isOpen, initialSessionParams]);

  // Timers & Polling for SEND QR
  useEffect(() => {
    if (isOpen && sendExpiresAt && (sendState === 'waiting' || sendState === 'connected')) {
      sendCountdownTimerRef.current = setInterval(() => {
        const diff = Math.max(0, Math.floor((sendExpiresAt - Date.now()) / 1000));
        setSendSecondsRemaining(diff);
        if (diff <= 0) {
          setSendState('expired');
          if (sendCountdownTimerRef.current) clearInterval(sendCountdownTimerRef.current);
          if (sendPollingTimerRef.current) clearInterval(sendPollingTimerRef.current);
        }
      }, 1000);
    } else {
      if (sendCountdownTimerRef.current) clearInterval(sendCountdownTimerRef.current);
    }

    return () => {
      if (sendCountdownTimerRef.current) clearInterval(sendCountdownTimerRef.current);
    };
  }, [isOpen, sendExpiresAt, sendState]);

  useEffect(() => {
    if (isOpen && sendSessionId && sendSessionToken && (sendState === 'waiting' || sendState === 'connected')) {
      sendPollingTimerRef.current = setInterval(async () => {
        if (isSendPollingInFlightRef.current) return; // Single-flight protection against slow networks
        isSendPollingInFlightRef.current = true;
        try {
          const res = await fetch(`/api/transfer/session/${sendSessionId}/status?token=${sendSessionToken}`);
          if (res.ok) {
            const data = await res.json();
            if (data.status === 'connected' && sendState === 'waiting') {
              setSendState('connected');
            } else if (data.status === 'completed') {
              setSendState('success');
              showToast('Data transferred successfully to the other device!', 'success');
              if (sendPollingTimerRef.current) clearInterval(sendPollingTimerRef.current);
            } else if (data.status === 'expired') {
              setSendState('expired');
              if (sendPollingTimerRef.current) clearInterval(sendPollingTimerRef.current);
            } else if (data.status === 'cancelled') {
              setSendState('cancelled');
              if (sendPollingTimerRef.current) clearInterval(sendPollingTimerRef.current);
            }
          }
        } catch (e) {
          console.error('Send Polling error:', e);
        } finally {
          isSendPollingInFlightRef.current = false;
        }
      }, 1500);
    } else {
      if (sendPollingTimerRef.current) clearInterval(sendPollingTimerRef.current);
      isSendPollingInFlightRef.current = false;
    }

    return () => {
      if (sendPollingTimerRef.current) clearInterval(sendPollingTimerRef.current);
      isSendPollingInFlightRef.current = false;
    };
  }, [isOpen, sendSessionId, sendSessionToken, sendState]);

  // Timers & Polling for RECEIVE QR
  useEffect(() => {
    if (isOpen && receiveExpiresAt && (receiveQrState === 'waiting' || receiveQrState === 'connected')) {
      receiveCountdownTimerRef.current = setInterval(() => {
        const diff = Math.max(0, Math.floor((receiveExpiresAt - Date.now()) / 1000));
        setReceiveSecondsRemaining(diff);
        if (diff <= 0) {
          setReceiveQrState('expired');
          if (receiveCountdownTimerRef.current) clearInterval(receiveCountdownTimerRef.current);
          if (receivePollingTimerRef.current) clearInterval(receivePollingTimerRef.current);
        }
      }, 1000);
    } else {
      if (receiveCountdownTimerRef.current) clearInterval(receiveCountdownTimerRef.current);
    }

    return () => {
      if (receiveCountdownTimerRef.current) clearInterval(receiveCountdownTimerRef.current);
    };
  }, [isOpen, receiveExpiresAt, receiveQrState]);

  useEffect(() => {
    if (isOpen && receiveSessionId && receiveSessionToken && (receiveQrState === 'waiting' || receiveQrState === 'connected')) {
      receivePollingTimerRef.current = setInterval(async () => {
        if (isReceivePollingInFlightRef.current) return; // Single-flight protection against slow networks
        isReceivePollingInFlightRef.current = true;
        try {
          const res = await fetch(`/api/transfer/session/${receiveSessionId}/status?token=${receiveSessionToken}`);
          if (res.ok) {
            const statusData = await res.json();
            if (statusData.status === 'connected' && receiveQrState === 'waiting') {
              setReceiveQrState('connected');
            } else if (statusData.status === 'data_ready') {
              if (receivePollingTimerRef.current) clearInterval(receivePollingTimerRef.current);
              try {
                const fullRes = await fetch(`/api/transfer/session/${receiveSessionId}?token=${receiveSessionToken}`);
                if (fullRes.ok) {
                  const fullData = await fullRes.json();
                  setReceiveCounts(fullData.counts);
                  setReceivePayload(fullData.payload?.data);
                  setReceiveQrState('data_received');
                  showToast('Incoming data received from device!', 'info');
                }
              } catch (err) {
                console.error('Failed to fetch session payload:', err);
              }
            } else if (statusData.status === 'expired') {
              setReceiveQrState('expired');
              if (receivePollingTimerRef.current) clearInterval(receivePollingTimerRef.current);
            } else if (statusData.status === 'cancelled') {
              setReceiveQrState('cancelled');
              if (receivePollingTimerRef.current) clearInterval(receivePollingTimerRef.current);
            }
          }
        } catch (e) {
          console.error('Receive Polling error:', e);
        } finally {
          isReceivePollingInFlightRef.current = false;
        }
      }, 1500);
    } else {
      if (receivePollingTimerRef.current) clearInterval(receivePollingTimerRef.current);
      isReceivePollingInFlightRef.current = false;
    }

    return () => {
      if (receivePollingTimerRef.current) clearInterval(receivePollingTimerRef.current);
      isReceivePollingInFlightRef.current = false;
    };
  }, [isOpen, receiveSessionId, receiveSessionToken, receiveQrState]);

  // Camera QR Scanner Lifecycle
  useEffect(() => {
    if (mode === 'receive' && receiveViewType === 'scanner' && scannerState === 'scanning') {
      let isMounted = true;
      setCameraError(null);

      const startCamera = async () => {
        try {
          await new Promise((res) => setTimeout(res, 150));
          if (!isMounted) return;

          const scanner = new Html5Qrcode('qr-reader-target');
          html5QrcodeRef.current = scanner;

          await scanner.start(
            { facingMode: 'environment' },
            { fps: 10, qrbox: { width: 220, height: 220 } },
            (decodedText) => {
              if (isMounted) {
                stopCamera();
                parseAndConnectQr(decodedText);
              }
            },
            () => {}
          );
        } catch (err: any) {
          console.error('Camera error:', err);
          if (!isMounted) return;
          const errStr = String(err?.message || err);
          if (errStr.includes('NotAllowedError') || errStr.includes('Permission')) {
            setCameraError('permission_denied');
          } else if (errStr.includes('NotFoundError') || errStr.includes('DevicesNotFoundError')) {
            setCameraError('no_camera');
          } else {
            setCameraError('unavailable');
          }
        }
      };

      startCamera();

      return () => {
        isMounted = false;
        stopCamera();
      };
    } else {
      stopCamera();
    }
  }, [mode, receiveViewType, scannerState]);

  const stopCamera = () => {
    if (html5QrcodeRef.current) {
      const scanner = html5QrcodeRef.current;
      html5QrcodeRef.current = null;
      scanner
        .stop()
        .catch(() => {})
        .finally(() => {
          try {
            scanner.clear();
          } catch {}
        });
    }
  };

  // HANDLERS: SEND FLOW
  const handleStartSend = () => {
    setMode('send');
    setSendState('idle');
    setSendErrorMessage('');
  };

  const handleGenerateSendQr = async () => {
    setSendState('creating');
    setSendErrorMessage('');

    try {
      const payloadObj = await buildCurrentPayload({
        members,
        songs,
        schedules,
        labels,
        includeDraft: includeDraftSend,
        draftSchedule,
        direction: 'pc_to_phone'
      });

      const response = await fetch('/api/transfer/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payload: payloadObj,
          direction: 'pc_to_phone',
          expiresInSeconds: 600
        })
      });

      if (!response.ok) {
        throw new Error('Failed to create transfer session.');
      }

      const resData = await response.json();
      if (!resData.success) {
        throw new Error(resData.message || 'Error generating transfer session.');
      }

      setSendSessionId(resData.sessionId);
      setSendSessionToken(resData.token);
      setSendExpiresAt(resData.expiresAt);
      setSendSecondsRemaining(Math.floor((resData.expiresAt - Date.now()) / 1000));

      const generatedDataUrl = await QRCode.toDataURL(resData.qrData, {
        width: 280,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' }
      });

      setSendQrDataUrl(generatedDataUrl);
      setSendState('waiting');
    } catch (err: any) {
      console.error('Send QR creation error:', err);
      setSendErrorMessage(err.message || 'Could not generate transfer QR code.');
      setSendState('error');
    }
  };

  const handleCancelSend = async () => {
    if (sendSessionId && sendSessionToken) {
      try {
        await fetch(`/api/transfer/session/${sendSessionId}/cancel`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: sendSessionToken })
        });
      } catch {}
    }
    setSendState('cancelled');
    if (sendPollingTimerRef.current) clearInterval(sendPollingTimerRef.current);
  };

  // HANDLERS: RECEIVE FLOW
  const handleStartReceive = () => {
    setMode('receive');
    if (isMobileDevice) {
      // Mobile device defaults directly to camera scanner
      setReceiveViewType('scanner');
      setScannerState('scanning');
    } else {
      // PC/Desktop defaults to generating Receive QR
      setReceiveViewType('qr');
      handleGenerateReceiveQr();
    }
  };

  const handleGenerateReceiveQr = async () => {
    setReceiveQrState('creating');
    setReceiveErrorMessage('');
    setReceiveCounts(null);
    setReceivePayload(null);

    try {
      const response = await fetch('/api/transfer/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          direction: 'phone_to_pc',
          expiresInSeconds: 600
        })
      });

      if (!response.ok) {
        throw new Error('Failed to create receiving session.');
      }

      const resData = await response.json();
      if (!resData.success) {
        throw new Error(resData.message || 'Error generating receiving session.');
      }

      setReceiveSessionId(resData.sessionId);
      setReceiveSessionToken(resData.token);
      setReceiveExpiresAt(resData.expiresAt);
      setReceiveSecondsRemaining(Math.floor((resData.expiresAt - Date.now()) / 1000));

      const generatedDataUrl = await QRCode.toDataURL(resData.qrData, {
        width: 280,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' }
      });

      setReceiveQrDataUrl(generatedDataUrl);
      setReceiveQrState('waiting');
    } catch (err: any) {
      console.error('Receive QR creation error:', err);
      setReceiveErrorMessage(err.message || 'Could not generate receiving QR code.');
      setReceiveQrState('error');
    }
  };

  const handleCancelReceiveQr = async () => {
    if (receiveSessionId && receiveSessionToken) {
      try {
        await fetch(`/api/transfer/session/${receiveSessionId}/cancel`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: receiveSessionToken })
        });
      } catch {}
    }
    setReceiveQrState('cancelled');
    if (receivePollingTimerRef.current) clearInterval(receivePollingTimerRef.current);
  };

  const handleExecuteReceiveQrImport = async () => {
    if (!receivePayload) return;
    setReceiveQrState('importing');

    try {
      const prevMembers = StorageService.getMembersSync();
      const prevLabels = StorageService.getLabelsSync();
      const prevSchedules = StorageService.getSchedulesSync();
      const prevSongs = await SongService.getSongs();
      const prevFamilies = await SongFamilyService.getSongFamilies();
      const prevDraft = StorageService.getDraftSchedule();
      const importedPayload = { ...receivePayload };

      await executeDataImport(receivePayload, receiveStrategy);

      LineupHistoryService.pushAppAction({
        description: `Imported transferred data (${receiveStrategy === 'replace' ? 'Replace' : 'Merge'} mode)`,
        undo: async () => {
          StorageService.saveMembers(prevMembers);
          StorageService.saveLabels(prevLabels);
          StorageService.saveSchedules(prevSchedules);
          await SongService.saveSongsList(prevSongs);
          await SongFamilyService.saveSongFamilies(prevFamilies);
          StorageService.saveDraftSchedule(prevDraft);
          onDataTransferred();
        },
        redo: async () => {
          await executeDataImport(importedPayload, receiveStrategy);
          onDataTransferred();
        }
      });

      try {
        await fetch(`/api/transfer/session/${receiveSessionId}/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: receiveSessionToken })
        });
      } catch {}

      setReceiveQrState('success');
      onDataTransferred();
      showToast('Data successfully transferred to this device.', 'success');
    } catch (err) {
      console.error('Import error:', err);
      setReceiveErrorMessage('Failed to import data onto device.');
      setReceiveQrState('error');
    }
  };

  // HANDLERS: SCANNER & ACTIONS
  const parseAndConnectQr = (rawQrText: string) => {
    try {
      setScannerState('connecting');
      setScannerErrorMessage('');

      let sid = '';
      let tok = '';

      if (rawQrText.includes('transferSessionId=')) {
        const url = new URL(rawQrText);
        sid = url.searchParams.get('transferSessionId') || '';
        tok = url.searchParams.get('token') || '';
      } else {
        const parsed = JSON.parse(rawQrText);
        sid = parsed.sessionId || parsed.transferSessionId || '';
        tok = parsed.token || '';
      }

      if (!sid || !tok) {
        setScannerErrorMessage('Invalid transfer QR code format.');
        setScannerState('error');
        return;
      }

      handleConnectToSession(sid, tok);
    } catch (e) {
      setScannerErrorMessage('Invalid or unrecognized QR code.');
      setScannerState('error');
    }
  };

  const handleConnectToSession = async (sid: string, tok: string) => {
    setScannerState('connecting');
    setScannerErrorMessage('');

    try {
      const response = await fetch(`/api/transfer/session/${sid}?token=${tok}`);
      const data = await response.json();

      if (!response.ok || !data.success) {
        if (data.error === 'EXPIRED') {
          setScannerErrorMessage('This transfer session has expired.');
        } else if (data.error === 'ALREADY_USED') {
          setScannerErrorMessage('This transfer session has already been used.');
        } else if (data.error === 'CANCELLED') {
          setScannerErrorMessage('This transfer session was cancelled by the other device.');
        } else {
          setScannerErrorMessage(data.message || 'Transfer session unavailable.');
        }
        setScannerState('error');
        return;
      }

      const sessionDirection: 'pc_to_phone' | 'phone_to_pc' = data.direction || 'pc_to_phone';

      setScannedSessionData({
        sessionId: sid,
        token: tok,
        direction: sessionDirection,
        counts: data.counts,
        payloadData: data.payload?.data
      });

      if (sessionDirection === 'phone_to_pc') {
        // Scanned a Receive QR (e.g. on PC): Upload local data to PC
        setScannerState('confirm_send');
      } else {
        // Scanned a Send QR: Import incoming PC data locally
        setScannerState('confirm_import');
      }
    } catch (err: any) {
      console.error('Error connecting to session:', err);
      setScannerErrorMessage('Failed to connect to transfer session. Check your network.');
      setScannerState('error');
    }
  };

  const handleSendScannedData = async () => {
    if (!scannedSessionData) return;
    setScannerState('uploading');

    try {
      const payloadObj = await buildCurrentPayload({
        members,
        songs,
        schedules,
        labels,
        includeDraft: scannerIncludeDraft,
        draftSchedule,
        direction: 'phone_to_pc'
      });

      const response = await fetch(`/api/transfer/session/${scannedSessionData.sessionId}/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: scannedSessionData.token,
          payload: payloadObj
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.message || 'Failed to upload data.');
      }

      setScannerState('upload_success');
      showToast('Data uploaded! Complete the import on the other screen.', 'success');
    } catch (err: any) {
      console.error('Upload error:', err);
      setScannerErrorMessage(err.message || 'Failed to upload data.');
      setScannerState('error');
    }
  };

  const handleExecuteScannerImport = async () => {
    if (!scannedSessionData || !scannedSessionData.payloadData) return;
    setScannerState('importing');

    try {
      const prevMembers = StorageService.getMembersSync();
      const prevLabels = StorageService.getLabelsSync();
      const prevSchedules = StorageService.getSchedulesSync();
      const prevSongs = await SongService.getSongs();
      const prevFamilies = await SongFamilyService.getSongFamilies();
      const prevDraft = StorageService.getDraftSchedule();
      const importedPayload = { ...scannedSessionData.payloadData };

      await executeDataImport(scannedSessionData.payloadData, scannerImportStrategy);

      LineupHistoryService.pushAppAction({
        description: `Imported scanned data (${scannerImportStrategy === 'replace' ? 'Replace' : 'Merge'} mode)`,
        undo: async () => {
          StorageService.saveMembers(prevMembers);
          StorageService.saveLabels(prevLabels);
          StorageService.saveSchedules(prevSchedules);
          await SongService.saveSongsList(prevSongs);
          await SongFamilyService.saveSongFamilies(prevFamilies);
          StorageService.saveDraftSchedule(prevDraft);
          onDataTransferred();
        },
        redo: async () => {
          await executeDataImport(importedPayload, scannerImportStrategy);
          onDataTransferred();
        }
      });

      try {
        await fetch(`/api/transfer/session/${scannedSessionData.sessionId}/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: scannedSessionData.token })
        });
      } catch {}

      setScannerState('success');
      onDataTransferred();
      showToast('Data imported successfully!', 'success');
    } catch (err) {
      console.error('Import error:', err);
      setScannerErrorMessage('Failed to import data into local storage.');
      setScannerState('error');
    }
  };

  const formatCountdown = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainder = secs % 60;
    return `${mins}:${remainder < 10 ? '0' : ''}${remainder}`;
  };

  const handleResetToSelect = () => {
    stopCamera();
    setMode('select');
    setSendState('idle');
    setReceiveQrState('idle');
    setScannerState('idle');
    setSendQrDataUrl('');
    setSendSessionId('');
    setSendSessionToken('');
    setSendExpiresAt(null);
    setReceiveQrDataUrl('');
    setReceiveSessionId('');
    setReceiveSessionToken('');
    setReceiveExpiresAt(null);
    setScannedSessionData(null);
    setSendErrorMessage('');
    setReceiveErrorMessage('');
    setScannerErrorMessage('');
    setReceiveCounts(null);
    setReceivePayload(null);
  };

  const { zIndex, isTopmost, isBlocked } = useOverlay({
    id: 'transfer-data-modal',
    isOpen,
    layer: OverlayLayer.NESTED_MODAL,
    onClose,
    closeOnEscape: true
  });

  if (!isOpen) return null;

  const modalContent = (
    <div
      style={{ zIndex }}
      data-overlay-id="transfer-data-modal"
      data-overlay-topmost={isTopmost}
      className={`fixed inset-0 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150 transition-opacity ${
        isBlocked ? 'pointer-events-none select-none opacity-40' : ''
      }`}
      aria-hidden={isBlocked}
      inert={isBlocked ? true : undefined}
    >
      <div
        data-tour="transfer-modal-container"
        className="w-full max-w-md wwcf-glass-modal text-slate-100 rounded-2xl shadow-2xl border border-slate-800/90 overflow-hidden flex flex-col max-h-[90vh] my-auto animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800/80 bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-[#1b75bc]/15 text-[#1b75bc] shrink-0">
              <ArrowRightLeft className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base leading-tight">
                Transfer Data
              </h3>
              <p className="text-xs text-slate-400 mt-0.5 leading-tight">
                Transfer your WWCF Santa Cruz data securely between devices.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer shrink-0 ml-2"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto flex-1">
          {/* ==================================================== */}
          {/* VIEW 1: MAIN SELECTION (ONLY TWO MAIN CHOICES)       */}
          {/* ==================================================== */}
          {mode === 'select' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* Option 1: Send Data */}
              <div
                data-tour="transfer-pc-send-option"
                onClick={handleStartSend}
                className="group p-4 rounded-2xl bg-slate-900/50 hover:bg-slate-900/90 border border-slate-800/90 hover:border-[#1b75bc]/50 transition-all cursor-pointer flex flex-col gap-3"
              >
                <div className="flex items-start gap-3.5">
                  <div className="p-2.5 rounded-xl bg-[#1b75bc]/15 text-[#1b75bc] group-hover:scale-105 transition-transform shrink-0 mt-0.5">
                    <Upload className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-white text-sm group-hover:text-[#1b75bc] transition-colors">
                      Send Data
                    </h4>
                    <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                      Send this device's data to another device.
                    </p>
                    <p className="text-[11px] text-[#1b75bc]/80 mt-1 font-medium">
                      {isMobileDevice
                        ? 'Send data from this phone to your PC.'
                        : 'Send data from this PC to your phone.'}
                    </p>
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStartSend();
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#1b75bc] hover:bg-[#16629e] text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                  >
                    <span>Generate QR Code</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Option 2: Receive Data */}
              <div
                data-tour="transfer-pc-receive-option"
                onClick={handleStartReceive}
                className="group p-4 rounded-2xl bg-slate-900/50 hover:bg-slate-900/90 border border-slate-800/90 hover:border-emerald-500/50 transition-all cursor-pointer flex flex-col gap-3"
              >
                <div className="flex items-start gap-3.5">
                  <div className="p-2.5 rounded-xl bg-emerald-950/70 text-emerald-400 group-hover:scale-105 transition-transform shrink-0 mt-0.5">
                    <Download className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-white text-sm group-hover:text-emerald-400 transition-colors">
                      Receive Data
                    </h4>
                    <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                      Receive data from another device.
                    </p>
                    <p className="text-[11px] text-emerald-400/80 mt-1 font-medium">
                      {isMobileDevice
                        ? 'Receive data from your PC.'
                        : 'Receive data from your phone.'}
                    </p>
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStartReceive();
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                  >
                    <span>Scan / Generate Receive QR</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Subtle minimal security info */}
              <div className="pt-2 text-center">
                <p className="text-[11px] text-slate-500 flex items-center justify-center gap-1.5 leading-normal">
                  <span>🔒</span>
                  <span>Transfers use a temporary secure connection. No database data is stored in the QR code.</span>
                </p>
              </div>
            </div>
          )}

          {/* ==================================================== */}
          {/* VIEW 2: SEND DATA FLOW                               */}
          {/* ==================================================== */}
          {mode === 'send' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* Context bar with back button */}
              <div className="flex items-center justify-between pb-1 border-b border-slate-800/60">
                <button
                  type="button"
                  onClick={handleResetToSelect}
                  className="text-xs text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer transition-colors py-1"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back</span>
                </button>
                <span className="text-xs font-semibold text-[#1b75bc] flex items-center gap-1">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Send Data</span>
                </span>
              </div>

              {/* Smart Subtitle */}
              <p className="text-xs text-slate-300">
                {isMobileDevice
                  ? 'Send data from this phone to your PC.'
                  : 'Send data from this PC to your phone.'}
              </p>

              {/* IDLE: Options before generating QR */}
              {sendState === 'idle' && (
                <div className="space-y-4">
                  <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-2.5 text-xs text-slate-400">
                    <div className="text-white font-medium">
                      Current dataset ready to send:
                    </div>
                    <div className="text-slate-300 font-mono text-[11px]">
                      {members.length} members · {songs.length} songs · {schedules.length} line-ups · {localCountsSummary.songFamilies} families
                    </div>

                    <label className="flex items-center gap-2.5 pt-1 cursor-pointer text-slate-300 hover:text-white transition-colors">
                      <input
                        type="checkbox"
                        checked={includeDraftSend}
                        onChange={(e) => setIncludeDraftSend(e.target.checked)}
                        className="rounded border-slate-700 bg-slate-800 text-[#1b75bc] focus:ring-[#1b75bc]"
                      />
                      <span>Include working draft schedule ({draftSchedule ? 'draft active' : 'none'})</span>
                    </label>
                  </div>

                  <button
                    type="button"
                    data-tour="transfer-generate-btn"
                    onClick={handleGenerateSendQr}
                    className="w-full py-2.5 px-4 bg-[#1b75bc] hover:bg-[#16629e] text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-2"
                  >
                    <QrCode className="w-4 h-4" />
                    <span>Generate Transfer QR Code</span>
                  </button>

                  {/* Contextual link for mobile if PC is already showing a Receive QR */}
                  {isMobileDevice && (
                    <div className="pt-2 text-center">
                      <button
                        type="button"
                        onClick={() => {
                          setMode('receive');
                          setReceiveViewType('scanner');
                          setScannerState('scanning');
                        }}
                        className="text-[11px] text-slate-400 hover:text-emerald-400 underline transition-colors cursor-pointer"
                      >
                        Scanning a Receive QR code on your PC screen instead? Open Scanner
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* CREATING */}
              {sendState === 'creating' && (
                <div className="py-10 flex flex-col items-center justify-center text-center space-y-3">
                  <RefreshCw className="w-7 h-7 text-[#1b75bc] animate-spin" />
                  <p className="text-xs text-slate-300">Generating secure transfer QR code...</p>
                </div>
              )}

              {/* WAITING / CONNECTED */}
              {(sendState === 'waiting' || sendState === 'connected') && (
                <div data-tour="transfer-qr-display" className="flex flex-col items-center justify-center text-center space-y-3.5 py-1">
                  <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs">
                    {sendState === 'waiting' ? (
                      <>
                        <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                        <span className="text-amber-400 font-medium">Waiting for device to scan...</span>
                      </>
                    ) : (
                      <>
                        <span className="w-2 h-2 rounded-full bg-emerald-400" />
                        <span className="text-emerald-400 font-medium">Device connected!</span>
                      </>
                    )}
                  </div>

                  {sendQrDataUrl && (
                    <div className="p-3 bg-white rounded-2xl shadow-lg border border-slate-700">
                      <img src={sendQrDataUrl} alt="Transfer QR Code" className="w-52 h-52 object-contain" />
                    </div>
                  )}

                  <p className="text-xs text-slate-300 max-w-xs leading-relaxed">
                    Scan this QR code using the camera or Transfer Data scanner on your other device.
                  </p>

                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <Clock className="w-3.5 h-3.5 text-[#1b75bc]" />
                    <span>Expires in: </span>
                    <span className="font-mono font-bold text-white">{formatCountdown(sendSecondsRemaining)}</span>
                  </div>

                  <button
                    type="button"
                    onClick={handleCancelSend}
                    className="py-1.5 px-3.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {/* SUCCESS */}
              {sendState === 'success' && (
                <div className="py-6 flex flex-col items-center justify-center text-center space-y-3 animate-in zoom-in-95 duration-150">
                  <div className="w-12 h-12 rounded-xl bg-emerald-950 border border-emerald-800 text-emerald-400 flex items-center justify-center">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-bold text-white text-sm">Transfer Complete!</h4>
                    <p className="text-xs text-slate-400 mt-1 max-w-xs">
                      Application data was successfully transferred to the other device.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    className="py-2 px-5 bg-[#1b75bc] hover:bg-[#16629e] text-white font-bold text-xs rounded-xl transition-colors cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              )}

              {/* EXPIRED */}
              {sendState === 'expired' && (
                <div className="py-6 flex flex-col items-center justify-center text-center space-y-3">
                  <div className="w-12 h-12 rounded-xl bg-amber-950 border border-amber-800 text-amber-400 flex items-center justify-center">
                    <Clock className="w-6 h-6" />
                  </div>
                  <p className="text-xs text-slate-300">Session expired. Please generate a new QR code.</p>
                  <button
                    type="button"
                    onClick={handleGenerateSendQr}
                    className="py-2 px-4 bg-[#1b75bc] hover:bg-[#16629e] text-white font-bold text-xs rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Generate New QR</span>
                  </button>
                </div>
              )}

              {/* CANCELLED */}
              {sendState === 'cancelled' && (
                <div className="py-6 flex flex-col items-center justify-center text-center space-y-3">
                  <p className="text-xs text-slate-400">Transfer was cancelled.</p>
                  <button
                    type="button"
                    onClick={handleResetToSelect}
                    className="py-1.5 px-3.5 bg-slate-900 border border-slate-800 text-xs text-white rounded-lg cursor-pointer"
                  >
                    Return to Transfer Options
                  </button>
                </div>
              )}

              {/* ERROR */}
              {sendState === 'error' && (
                <div className="p-3.5 rounded-xl bg-red-950/50 border border-red-800/80 text-red-300 text-xs space-y-2.5">
                  <div className="flex items-center gap-2 font-bold text-red-200">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>Error Creating Transfer</span>
                  </div>
                  <p>{sendErrorMessage || 'An unexpected error occurred.'}</p>
                  <button
                    type="button"
                    onClick={handleGenerateSendQr}
                    className="py-1.5 px-3 bg-red-900 hover:bg-red-800 text-white rounded-lg font-semibold text-xs cursor-pointer"
                  >
                    Retry
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ==================================================== */}
          {/* VIEW 3: RECEIVE DATA FLOW                            */}
          {/* ==================================================== */}
          {mode === 'receive' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* Context bar with back button */}
              <div className="flex items-center justify-between pb-1 border-b border-slate-800/60">
                <button
                  type="button"
                  onClick={handleResetToSelect}
                  className="text-xs text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer transition-colors py-1"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back</span>
                </button>
                <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
                  <Download className="w-3.5 h-3.5" />
                  <span>Receive Data</span>
                </span>
              </div>

              {/* Smart Subtitle */}
              <p className="text-xs text-slate-300">
                {isMobileDevice
                  ? 'Receive data from your PC.'
                  : 'Receive data from your phone.'}
              </p>

              {/* ---------------------------------------------------- */}
              {/* SUB-BRANCH A: CAMERA SCANNER (Mobile Default / Opt)  */}
              {/* ---------------------------------------------------- */}
              {receiveViewType === 'scanner' && (
                <div className="space-y-3.5">
                  {/* SCANNING */}
                  {scannerState === 'scanning' && (
                    <div className="space-y-3">
                      <p className="text-xs text-slate-400">
                        Scan the QR code shown on the other device.
                      </p>

                      <div
                        data-tour="transfer-scanner-view"
                        className="relative rounded-2xl overflow-hidden border border-slate-800 bg-slate-900 min-h-[250px] flex items-center justify-center"
                      >
                        <div id="qr-reader-target" className="w-full h-full min-h-[250px]" />

                        {cameraError === 'permission_denied' && (
                          <div className="absolute inset-0 p-5 bg-black/90 flex flex-col items-center justify-center text-center space-y-2 text-xs text-amber-300">
                            <AlertCircle className="w-7 h-7 text-amber-400" />
                            <p className="font-bold text-white">Camera Access Denied</p>
                            <p className="text-slate-300 text-[11px]">
                              Please enable camera permissions in your browser to scan the QR code.
                            </p>
                          </div>
                        )}

                        {cameraError === 'no_camera' && (
                          <div className="absolute inset-0 p-5 bg-black/90 flex flex-col items-center justify-center text-center space-y-2 text-xs text-slate-300">
                            <AlertCircle className="w-7 h-7 text-slate-400" />
                            <p className="font-bold text-white">No Camera Detected</p>
                            <p className="text-slate-400 text-[11px]">
                              No camera was found on this device.
                            </p>
                          </div>
                        )}

                        {cameraError === 'unavailable' && (
                          <div className="absolute inset-0 p-5 bg-black/90 flex flex-col items-center justify-center text-center space-y-2 text-xs text-slate-300">
                            <AlertCircle className="w-7 h-7 text-red-400" />
                            <p className="font-bold text-white">Camera Unavailable</p>
                            <p className="text-slate-400 text-[11px]">
                              Could not open camera stream. Ensure no other application is using it.
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Option to switch to QR generation */}
                      <div className="text-center pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            stopCamera();
                            setReceiveViewType('qr');
                            handleGenerateReceiveQr();
                          }}
                          className="text-[11px] text-slate-400 hover:text-emerald-400 underline transition-colors cursor-pointer"
                        >
                          Prefer to display a Receive QR code on this screen instead?
                        </button>
                      </div>
                    </div>
                  )}

                  {/* CONNECTING */}
                  {scannerState === 'connecting' && (
                    <div className="py-10 flex flex-col items-center justify-center text-center space-y-3">
                      <RefreshCw className="w-7 h-7 text-emerald-400 animate-spin" />
                      <p className="text-xs text-slate-300">Connecting to transfer session...</p>
                    </div>
                  )}

                  {/* CONFIRM SEND (Scanned a Receive QR) */}
                  {scannerState === 'confirm_send' && (
                    <div className="space-y-4 animate-in zoom-in-95 duration-150">
                      <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-2">
                        <div className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                          <Upload className="w-4 h-4" />
                          <span>Ready to Send Data to Other Device</span>
                        </div>
                        <p className="text-xs text-slate-300">
                          Connected to the receiver. Confirm your local data to upload:
                        </p>
                        <div className="text-[11px] font-mono text-slate-400 pt-1">
                          {localCountsSummary.members} members · {localCountsSummary.songs} songs · {localCountsSummary.schedules} line-ups · {localCountsSummary.songFamilies} families
                        </div>

                        <label className="flex items-center gap-2 pt-1.5 cursor-pointer text-xs text-slate-300">
                          <input
                            type="checkbox"
                            checked={scannerIncludeDraft}
                            onChange={(e) => setScannerIncludeDraft(e.target.checked)}
                            className="rounded border-slate-700 bg-slate-800 text-emerald-500 focus:ring-emerald-500"
                          />
                          <span>Include working draft schedule ({draftSchedule ? 'active' : 'none'})</span>
                        </label>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5">
                        <button
                          type="button"
                          onClick={handleResetToSelect}
                          className="py-2 px-3 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-slate-300 rounded-xl cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleSendScannedData}
                          className="py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          <span>Send Data Now</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* UPLOADING */}
                  {scannerState === 'uploading' && (
                    <div className="py-10 flex flex-col items-center justify-center text-center space-y-3">
                      <RefreshCw className="w-7 h-7 text-emerald-400 animate-spin" />
                      <p className="text-xs text-slate-300">Uploading data to session...</p>
                    </div>
                  )}

                  {/* UPLOAD SUCCESS */}
                  {scannerState === 'upload_success' && (
                    <div className="py-6 flex flex-col items-center justify-center text-center space-y-3 animate-in zoom-in-95 duration-150">
                      <div className="w-12 h-12 rounded-xl bg-emerald-950 border border-emerald-800 text-emerald-400 flex items-center justify-center">
                        <CheckCircle2 className="w-6 h-6" />
                      </div>
                      <div>
                        <h4 className="font-bold text-white text-sm">Data Sent!</h4>
                        <p className="text-xs text-slate-400 mt-1 max-w-xs leading-relaxed">
                          Your data has been sent. Please finalize the import on the other screen.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={onClose}
                        className="py-2 px-5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer"
                      >
                        Done
                      </button>
                    </div>
                  )}

                  {/* CONFIRM IMPORT (Scanned a Send QR) */}
                  {scannerState === 'confirm_import' && scannedSessionData && (
                    <div data-tour="transfer-confirm-panel" className="space-y-4 animate-in zoom-in-95 duration-150">
                      <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-2">
                        <div className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Data Ready to Import</span>
                        </div>
                        <p className="text-xs text-slate-300">
                          Incoming dataset summary:
                        </p>
                        <div className="text-[11px] font-mono text-slate-300 pt-0.5">
                          {scannedSessionData.counts.members} members · {scannedSessionData.counts.songs} songs · {scannedSessionData.counts.schedules} line-ups · {scannedSessionData.counts.songFamilies || 0} families
                        </div>
                      </div>

                      {/* Strategy Choice */}
                      <div className="space-y-2">
                        <div className="text-xs font-semibold text-slate-300">Import Strategy:</div>
                        <div className="space-y-1.5 text-xs">
                          <label
                            onClick={() => setScannerImportStrategy('merge')}
                            className={`flex items-start gap-2.5 p-2.5 rounded-xl border transition-all cursor-pointer ${
                              scannerImportStrategy === 'merge'
                                ? 'bg-emerald-950/40 border-emerald-600 text-white'
                                : 'bg-slate-900/40 border-slate-800 text-slate-400'
                            }`}
                          >
                            <input
                              type="radio"
                              name="scannerImportStrategy"
                              checked={scannerImportStrategy === 'merge'}
                              onChange={() => setScannerImportStrategy('merge')}
                              className="mt-0.5 text-emerald-500 focus:ring-emerald-500"
                            />
                            <div>
                              <span className="font-bold text-slate-200">Merge with Existing Data (Safe)</span>
                              <p className="text-[11px] opacity-75 mt-0.5">Appends new records without deleting existing items.</p>
                            </div>
                          </label>

                          <label
                            onClick={() => setScannerImportStrategy('replace')}
                            className={`flex items-start gap-2.5 p-2.5 rounded-xl border transition-all cursor-pointer ${
                              scannerImportStrategy === 'replace'
                                ? 'bg-amber-950/40 border-amber-600 text-white'
                                : 'bg-slate-900/40 border-slate-800 text-slate-400'
                            }`}
                          >
                            <input
                              type="radio"
                              name="scannerImportStrategy"
                              checked={scannerImportStrategy === 'replace'}
                              onChange={() => setScannerImportStrategy('replace')}
                              className="mt-0.5 text-amber-500 focus:ring-amber-500"
                            />
                            <div>
                              <span className="font-bold text-slate-200">Replace All Data</span>
                              <p className="text-[11px] opacity-75 mt-0.5">Replaces current device state with the incoming dataset.</p>
                            </div>
                          </label>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5 pt-1">
                        <button
                          type="button"
                          onClick={handleResetToSelect}
                          className="py-2 px-3 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-slate-300 rounded-xl cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          data-tour="transfer-import-btn"
                          onClick={handleExecuteScannerImport}
                          className="py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Import Data</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* IMPORTING */}
                  {scannerState === 'importing' && (
                    <div className="py-10 flex flex-col items-center justify-center text-center space-y-3">
                      <RefreshCw className="w-7 h-7 text-emerald-400 animate-spin" />
                      <p className="text-xs text-slate-300">Importing data into local storage...</p>
                    </div>
                  )}

                  {/* SUCCESS */}
                  {scannerState === 'success' && (
                    <div className="py-6 flex flex-col items-center justify-center text-center space-y-3 animate-in zoom-in-95 duration-150">
                      <div className="w-12 h-12 rounded-xl bg-emerald-950 border border-emerald-800 text-emerald-400 flex items-center justify-center">
                        <CheckCircle2 className="w-6 h-6" />
                      </div>
                      <div>
                        <h4 className="font-bold text-white text-sm">Transfer Complete!</h4>
                        <p className="text-xs text-slate-400 mt-1 max-w-xs leading-relaxed">
                          Your WWCF Santa Cruz data has been transferred successfully.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={onClose}
                        className="py-2 px-5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer"
                      >
                        Done
                      </button>
                    </div>
                  )}

                  {/* ERROR */}
                  {scannerState === 'error' && (
                    <div className="p-3.5 rounded-xl bg-red-950/50 border border-red-800/80 text-red-300 text-xs space-y-2.5">
                      <div className="flex items-center gap-2 font-bold text-red-200">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>Transfer Error</span>
                      </div>
                      <p>{scannerErrorMessage || 'An error occurred during transfer.'}</p>
                      <button
                        type="button"
                        onClick={() => setScannerState('scanning')}
                        className="py-1.5 px-3 bg-red-900 hover:bg-red-800 text-white rounded-lg font-semibold text-xs cursor-pointer"
                      >
                        Scan Again
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* ---------------------------------------------------- */}
              {/* SUB-BRANCH B: RECEIVE QR GENERATOR (PC Default)      */}
              {/* ---------------------------------------------------- */}
              {receiveViewType === 'qr' && (
                <div className="space-y-3.5">
                  {/* CREATING */}
                  {receiveQrState === 'creating' && (
                    <div className="py-10 flex flex-col items-center justify-center text-center space-y-3">
                      <RefreshCw className="w-7 h-7 text-emerald-400 animate-spin" />
                      <p className="text-xs text-slate-300">Creating receiving session...</p>
                    </div>
                  )}

                  {/* WAITING / CONNECTED */}
                  {(receiveQrState === 'waiting' || receiveQrState === 'connected') && (
                    <div className="flex flex-col items-center justify-center text-center space-y-3.5 py-1">
                      <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs">
                        {receiveQrState === 'waiting' ? (
                          <>
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                            <span className="text-emerald-400 font-medium">Waiting for device to connect...</span>
                          </>
                        ) : (
                          <>
                            <span className="w-2 h-2 rounded-full bg-emerald-400" />
                            <span className="text-emerald-400 font-medium">Connected! Waiting for upload...</span>
                          </>
                        )}
                      </div>

                      {receiveQrDataUrl && (
                        <div className="p-3 bg-white rounded-2xl shadow-lg border border-slate-700">
                          <img src={receiveQrDataUrl} alt="Receive QR Code" className="w-52 h-52 object-contain" />
                        </div>
                      )}

                      <p className="text-xs text-slate-300 max-w-xs leading-relaxed">
                        Scan this QR code with your phone or other device to upload and transfer its data here.
                      </p>

                      <div className="flex items-center gap-1.5 text-xs text-slate-400">
                        <Clock className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Expires in: </span>
                        <span className="font-mono font-bold text-white">{formatCountdown(receiveSecondsRemaining)}</span>
                      </div>

                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={handleCancelReceiveQr}
                          className="py-1.5 px-3.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>

                      {/* Switch to camera scanner option */}
                      <div className="text-center pt-2">
                        <button
                          type="button"
                          onClick={() => {
                            setReceiveViewType('scanner');
                            setScannerState('scanning');
                          }}
                          className="text-[11px] text-slate-400 hover:text-emerald-400 underline transition-colors cursor-pointer"
                        >
                          Have a camera on this device? Switch to Camera Scanner
                        </button>
                      </div>
                    </div>
                  )}

                  {/* DATA RECEIVED */}
                  {receiveQrState === 'data_received' && receiveCounts && (
                    <div className="space-y-4 animate-in zoom-in-95 duration-150">
                      <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-2">
                        <div className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Data Received from Other Device</span>
                        </div>
                        <p className="text-xs text-slate-300">
                          Incoming dataset summary:
                        </p>
                        <div className="text-[11px] font-mono text-slate-300">
                          {receiveCounts.members} members · {receiveCounts.songs} songs · {receiveCounts.schedules} line-ups · {receiveCounts.songFamilies} families
                        </div>
                        {receiveCounts.hasDraft && (
                          <div className="text-[11px] text-emerald-400 flex items-center gap-1 pt-0.5">
                            <Sparkles className="w-3 h-3" />
                            <span>Working draft schedule included</span>
                          </div>
                        )}
                      </div>

                      {/* Strategy */}
                      <div className="space-y-2">
                        <div className="text-xs font-semibold text-slate-300">Select Import Strategy:</div>
                        <div className="space-y-1.5 text-xs">
                          <label
                            onClick={() => setReceiveStrategy('merge')}
                            className={`flex items-start gap-2.5 p-2.5 rounded-xl border transition-all cursor-pointer ${
                              receiveStrategy === 'merge'
                                ? 'bg-emerald-950/40 border-emerald-600 text-white'
                                : 'bg-slate-900/40 border-slate-800 text-slate-400'
                            }`}
                          >
                            <input
                              type="radio"
                              name="receiveStrategy"
                              checked={receiveStrategy === 'merge'}
                              onChange={() => setReceiveStrategy('merge')}
                              className="mt-0.5 text-emerald-500 focus:ring-emerald-500"
                            />
                            <div>
                              <span className="font-bold text-slate-200">Merge with Existing Data (Safe)</span>
                              <p className="text-[11px] opacity-75 mt-0.5">Preserves existing records; appends new items.</p>
                            </div>
                          </label>

                          <label
                            onClick={() => setReceiveStrategy('replace')}
                            className={`flex items-start gap-2.5 p-2.5 rounded-xl border transition-all cursor-pointer ${
                              receiveStrategy === 'replace'
                                ? 'bg-amber-950/40 border-amber-600 text-white'
                                : 'bg-slate-900/40 border-slate-800 text-slate-400'
                            }`}
                          >
                            <input
                              type="radio"
                              name="receiveStrategy"
                              checked={receiveStrategy === 'replace'}
                              onChange={() => setReceiveStrategy('replace')}
                              className="mt-0.5 text-amber-500 focus:ring-amber-500"
                            />
                            <div>
                              <span className="font-bold text-slate-200">Replace All Data</span>
                              <p className="text-[11px] opacity-75 mt-0.5">Replaces current database with the incoming dataset.</p>
                            </div>
                          </label>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5 pt-1">
                        <button
                          type="button"
                          onClick={handleResetToSelect}
                          className="py-2 px-3 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-slate-300 rounded-xl cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleExecuteReceiveQrImport}
                          className="py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Import Data</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* IMPORTING */}
                  {receiveQrState === 'importing' && (
                    <div className="py-10 flex flex-col items-center justify-center text-center space-y-3">
                      <RefreshCw className="w-7 h-7 text-emerald-400 animate-spin" />
                      <p className="text-xs text-slate-300">Importing data onto device...</p>
                    </div>
                  )}

                  {/* SUCCESS */}
                  {receiveQrState === 'success' && (
                    <div className="py-6 flex flex-col items-center justify-center text-center space-y-3 animate-in zoom-in-95 duration-150">
                      <div className="w-12 h-12 rounded-xl bg-emerald-950 border border-emerald-800 text-emerald-400 flex items-center justify-center">
                        <CheckCircle2 className="w-6 h-6" />
                      </div>
                      <div>
                        <h4 className="font-bold text-white text-sm">Transfer Complete!</h4>
                        <p className="text-xs text-slate-400 mt-1 max-w-xs leading-relaxed">
                          Data was successfully received and imported.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={onClose}
                        className="py-2 px-5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer"
                      >
                        Done
                      </button>
                    </div>
                  )}

                  {/* EXPIRED */}
                  {receiveQrState === 'expired' && (
                    <div className="py-6 flex flex-col items-center justify-center text-center space-y-3">
                      <div className="w-12 h-12 rounded-xl bg-amber-950 border border-amber-800 text-amber-400 flex items-center justify-center">
                        <Clock className="w-6 h-6" />
                      </div>
                      <p className="text-xs text-slate-300">Receiving session expired. Please generate a new QR code.</p>
                      <button
                        type="button"
                        onClick={handleGenerateReceiveQr}
                        className="py-2 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Generate New QR</span>
                      </button>
                    </div>
                  )}

                  {/* CANCELLED */}
                  {receiveQrState === 'cancelled' && (
                    <div className="py-6 flex flex-col items-center justify-center text-center space-y-3">
                      <p className="text-xs text-slate-400">Receiving session was cancelled.</p>
                      <button
                        type="button"
                        onClick={handleResetToSelect}
                        className="py-1.5 px-3.5 bg-slate-900 border border-slate-800 text-xs text-white rounded-lg cursor-pointer"
                      >
                        Return to Transfer Options
                      </button>
                    </div>
                  )}

                  {/* ERROR */}
                  {receiveQrState === 'error' && (
                    <div className="p-3.5 rounded-xl bg-red-950/50 border border-red-800/80 text-red-300 text-xs space-y-2.5">
                      <div className="flex items-center gap-2 font-bold text-red-200">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>Error in Receive Session</span>
                      </div>
                      <p>{receiveErrorMessage || 'An unexpected error occurred.'}</p>
                      <button
                        type="button"
                        onClick={handleGenerateReceiveQr}
                        className="py-1.5 px-3 bg-red-900 hover:bg-red-800 text-white rounded-lg font-semibold text-xs cursor-pointer"
                      >
                        Retry
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modalContent, document.body);
};
