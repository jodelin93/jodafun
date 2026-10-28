'use client';

import { useState, useEffect } from 'react';
import { getSoundManager } from '../lib/sounds/soundManager';

export default function SoundControls() {
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
    <div className="flex items-center gap-4 bg-white/10 backdrop-blur-sm rounded-lg px-4 py-2">
      {/* Mute/Unmute Button */}
      <button
        onClick={handleMuteToggle}
        className="text-2xl hover:scale-110 transition-transform"
        title={muted ? 'Unmute' : 'Mute'}
        aria-label={muted ? 'Unmute' : 'Mute'}
      >
        {muted ? '🔇' : volume > 0.5 ? '🔊' : volume > 0 ? '🔉' : '🔈'}
      </button>

      {/* Volume Slider */}
      <div className="flex items-center gap-2">
        <input
          type="range"
          min="0"
          max="1"
          step="0.1"
          value={volume}
          onChange={handleVolumeChange}
          disabled={muted}
          className="w-24 h-2 bg-white/20 rounded-lg appearance-none cursor-pointer
                     disabled:opacity-50 disabled:cursor-not-allowed
                     [&::-webkit-slider-thumb]:appearance-none
                     [&::-webkit-slider-thumb]:w-4
                     [&::-webkit-slider-thumb]:h-4
                     [&::-webkit-slider-thumb]:rounded-full
                     [&::-webkit-slider-thumb]:bg-white
                     [&::-webkit-slider-thumb]:cursor-pointer
                     [&::-webkit-slider-thumb]:hover:scale-110
                     [&::-webkit-slider-thumb]:transition-transform
                     [&::-moz-range-thumb]:w-4
                     [&::-moz-range-thumb]:h-4
                     [&::-moz-range-thumb]:rounded-full
                     [&::-moz-range-thumb]:bg-white
                     [&::-moz-range-thumb]:border-0
                     [&::-moz-range-thumb]:cursor-pointer
                     [&::-moz-range-thumb]:hover:scale-110
                     [&::-moz-range-thumb]:transition-transform"
          aria-label="Volume"
        />
        <span className="text-sm font-medium min-w-[3ch] text-right">
          {Math.round(volume * 100)}%
        </span>
      </div>
    </div>
  );
}
