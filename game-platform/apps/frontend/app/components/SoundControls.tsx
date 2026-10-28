'use client';

import { useState, useEffect } from 'react';
import { Volume, Volume1, Volume2, VolumeX } from 'lucide-react';
import { getSoundManager } from '../lib/sounds/soundManager';
import { useT } from '../i18n/I18nProvider';
import { gameMessages } from '../i18n/messages/game';

export default function SoundControls() {
  const t = useT(gameMessages);
  const [volume, setVolume] = useState(0.7);
  const [muted, setMuted] = useState(false);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    const soundManager = getSoundManager();
    soundManager.init().then(() => {
      setInitialized(true);
      setVolume(soundManager.getVolume());
      setMuted(soundManager.isMuted());
    });
  }, []);

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    const soundManager = getSoundManager();
    soundManager.setVolume(newVolume);
  };

  const handleMuteToggle = () => {
    const soundManager = getSoundManager();
    const newMutedState = soundManager.toggleMute();
    setMuted(newMutedState);
  };

  if (!initialized) {
    return null;
  }

  return (
    <div className="flex items-center gap-1.5">
      {/* Mute/Unmute Button */}
      <button
        type="button"
        onClick={handleMuteToggle}
        className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-chalk transition hover:bg-white/10 hover:text-white"
        title={muted ? t('unmute') : t('mute')}
        aria-label={muted ? t('unmute') : t('mute')}
      >
        {muted ? (
          <VolumeX className="h-5 w-5" aria-hidden="true" />
        ) : volume > 0.5 ? (
          <Volume2 className="h-5 w-5" aria-hidden="true" />
        ) : volume > 0 ? (
          <Volume1 className="h-5 w-5" aria-hidden="true" />
        ) : (
          <Volume className="h-5 w-5" aria-hidden="true" />
        )}
      </button>

      {/* Volume Slider: hidden on phones to keep the game bar on one line */}
      <div className="hidden items-center gap-2 sm:flex">
        <input
          type="range"
          min="0"
          max="1"
          step="0.1"
          value={volume}
          onChange={handleVolumeChange}
          disabled={muted}
          className="h-2 w-20 cursor-pointer accent-gold disabled:cursor-not-allowed disabled:opacity-50"
          aria-label={t('volume')}
        />
        <span className="min-w-[4ch] text-right text-sm tabular-nums text-chalk">
          {Math.round(volume * 100)}%
        </span>
      </div>
    </div>
  );
}
