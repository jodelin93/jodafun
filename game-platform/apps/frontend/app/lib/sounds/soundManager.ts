/**
 * Sound Manager for Joda Memory Game
 * Handles all game sound effects with volume control and mute functionality
 */

type SoundType = 'flip' | 'match' | 'mismatch' | 'win' | 'turnChange' | 'myTurn';

class SoundManager {
  private audioContext: AudioContext | null = null;
  private volume: number = 0.7; // Default volume (0.0 to 1.0)
  private muted: boolean = false;
  private sounds: Map<SoundType, AudioBuffer | null> = new Map();
  private initialized: boolean = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.initializeAudioContext();
    }
  }

  private initializeAudioContext() {
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.initialized = true;
    } catch (error) {
      console.warn('Web Audio API not supported:', error);
    }
  }

  /**
   * Generate procedural sound effects using Web Audio API
   * These are placeholder sounds - you can replace them with actual sound files
   */
  private async generateSound(type: SoundType): Promise<AudioBuffer | null> {
    if (!this.audioContext) return null;

    const sampleRate = this.audioContext.sampleRate;
    let duration = 0.2;
    let buffer: AudioBuffer;

    switch (type) {
      case 'flip':
        // Quick ascending tone for card flip
        duration = 0.15;
        buffer = this.audioContext.createBuffer(1, sampleRate * duration, sampleRate);
        const flipData = buffer.getChannelData(0);
        for (let i = 0; i < buffer.length; i++) {
          const t = i / sampleRate;
          const freq = 400 + (t * 200); // Ascending from 400Hz to 600Hz
          flipData[i] = Math.sin(2 * Math.PI * freq * t) * Math.exp(-t * 8) * 0.3;
        }
        break;

      case 'match':
        // Pleasant ascending chime for successful match
        duration = 0.4;
        buffer = this.audioContext.createBuffer(1, sampleRate * duration, sampleRate);
        const matchData = buffer.getChannelData(0);
        for (let i = 0; i < buffer.length; i++) {
          const t = i / sampleRate;
          // Two harmonious frequencies
          const freq1 = 523.25; // C5
          const freq2 = 659.25; // E5
          matchData[i] = (
            Math.sin(2 * Math.PI * freq1 * t) * 0.4 +
            Math.sin(2 * Math.PI * freq2 * t) * 0.3
          ) * Math.exp(-t * 4);
        }
        break;

      case 'mismatch':
        // Short descending tone for mismatch
        duration = 0.25;
        buffer = this.audioContext.createBuffer(1, sampleRate * duration, sampleRate);
        const mismatchData = buffer.getChannelData(0);
        for (let i = 0; i < buffer.length; i++) {
          const t = i / sampleRate;
          const freq = 300 - (t * 150); // Descending from 300Hz to 150Hz
          mismatchData[i] = Math.sin(2 * Math.PI * freq * t) * Math.exp(-t * 10) * 0.2;
        }
        break;

      case 'win':
        // Victorious ascending scale
        duration = 0.8;
        buffer = this.audioContext.createBuffer(1, sampleRate * duration, sampleRate);
        const winData = buffer.getChannelData(0);
        const notes = [523.25, 587.33, 659.25, 783.99]; // C-D-E-G scale
        for (let i = 0; i < buffer.length; i++) {
          const t = i / sampleRate;
          const noteIndex = Math.floor(t / 0.2) % notes.length;
          const freq = notes[noteIndex] || 523.25;
          winData[i] = Math.sin(2 * Math.PI * freq * t) * Math.exp(-t * 2) * 0.4;
        }
        break;

      case 'turnChange':
        // Gentle notification tone
        duration = 0.3;
        buffer = this.audioContext.createBuffer(1, sampleRate * duration, sampleRate);
        const turnData = buffer.getChannelData(0);
        for (let i = 0; i < buffer.length; i++) {
          const t = i / sampleRate;
          const freq = 440; // A4
          turnData[i] = Math.sin(2 * Math.PI * freq * t) * Math.exp(-t * 6) * 0.15;
        }
        break;

      case 'myTurn':
        // Attention-grabbing upward chime for "your turn"
        duration = 0.5;
        buffer = this.audioContext.createBuffer(1, sampleRate * duration, sampleRate);
        const myTurnData = buffer.getChannelData(0);
        const myTurnNotes = [523.25, 659.25, 783.99]; // C-E-G chord progression
        for (let i = 0; i < buffer.length; i++) {
          const t = i / sampleRate;
          const noteIndex = Math.floor(t / 0.15);
          if (noteIndex < myTurnNotes.length) {
            const freq = myTurnNotes[noteIndex] || 523.25;
            myTurnData[i] = Math.sin(2 * Math.PI * freq * t) * Math.exp(-t * 3) * 0.3;
          }
        }
        break;

      default:
        return null;
    }

    return buffer;
  }

  /**
   * Load a sound file from URL
   * Use this to load actual sound files instead of generated ones
   */
  async loadSound(type: SoundType, url: string): Promise<void> {
    if (!this.audioContext) {
      console.warn('Audio context not initialized');
      return;
    }

    try {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      this.sounds.set(type, audioBuffer);
    } catch (error) {
      console.error(`Failed to load sound ${type}:`, error);
      // Fall back to generated sound
      const generatedSound = await this.generateSound(type);
      this.sounds.set(type, generatedSound);
    }
  }

  /**
   * Initialize all sounds
   */
  async initializeSounds(): Promise<void> {
    if (!this.initialized) return;

    // Generate procedural sounds as fallbacks
    // You can replace these with actual sound file URLs
    const soundTypes: SoundType[] = ['flip', 'match', 'mismatch', 'win', 'turnChange', 'myTurn'];

    for (const type of soundTypes) {
      const buffer = await this.generateSound(type);
      this.sounds.set(type, buffer);
    }
  }

  /**
   * Initialize the sound manager (alias for initializeSounds)
   */
  async init(): Promise<void> {
    return this.initializeSounds();
  }

  /**
   * Play a sound effect
   */
  play(type: SoundType): void {
    if (!this.audioContext || this.muted || !this.initialized) return;

    // Resume audio context if it's suspended (browser autoplay policy)
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    const buffer = this.sounds.get(type);
    if (!buffer) {
      console.warn(`Sound ${type} not loaded`);
      return;
    }

    try {
      const source = this.audioContext.createBufferSource();
      const gainNode = this.audioContext.createGain();

      source.buffer = buffer;
      gainNode.gain.value = this.volume;

      source.connect(gainNode);
      gainNode.connect(this.audioContext.destination);

      source.start(0);
    } catch (error) {
      console.error(`Error playing sound ${type}:`, error);
    }
  }

  /**
   * Set volume (0.0 to 1.0)
   */
  setVolume(value: number): void {
    this.volume = Math.max(0, Math.min(1, value));
  }

  /**
   * Get current volume
   */
  getVolume(): number {
    return this.volume;
  }

  /**
   * Toggle mute
   */
  toggleMute(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }

  /**
   * Set mute state
   */
  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  /**
   * Get mute state
   */
  isMuted(): boolean {
    return this.muted;
  }

  /**
   * Get initialization state
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}

// Singleton instance
let soundManagerInstance: SoundManager | null = null;

export const getSoundManager = (): SoundManager => {
  if (!soundManagerInstance) {
    soundManagerInstance = new SoundManager();
  }
  return soundManagerInstance;
};

export default getSoundManager;
