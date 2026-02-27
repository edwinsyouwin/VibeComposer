'use client';

import { useState } from 'react';
import { Mic, MicOff } from 'lucide-react';

interface MicrophoneCaptureProps {
  onPermissionGranted?: () => void;
  onPermissionDenied?: () => void;
}

export function MicrophoneCapture({
  onPermissionGranted,
  onPermissionDenied,
}: MicrophoneCaptureProps) {
  const [permissionState, setPermissionState] = useState<
    'prompt' | 'granted' | 'denied'
  >('prompt');

  const requestPermission = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setPermissionState('granted');
      onPermissionGranted?.();
    } catch {
      setPermissionState('denied');
      onPermissionDenied?.();
    }
  };

  if (permissionState === 'denied') {
    return (
      <div className="flex items-center gap-2 text-red-400 text-sm">
        <MicOff size={16} />
        Microphone access denied. Please enable it in browser settings.
      </div>
    );
  }

  if (permissionState === 'granted') {
    return (
      <div className="flex items-center gap-2 text-green-400 text-sm">
        <Mic size={16} />
        Microphone ready
      </div>
    );
  }

  return (
    <button
      onClick={requestPermission}
      className="flex items-center gap-2 text-gray-400 hover:text-white text-sm transition-colors"
    >
      <Mic size={16} />
      Click to enable microphone
    </button>
  );
}
