# Joda Memory Sound Effects

This directory contains sound effects for the Joda Memory game.

## Current Implementation

The game currently uses procedurally generated sounds using the Web Audio API. These are placeholder sounds that work immediately without any downloads.

## Upgrade to Professional Sounds

To use higher quality sound effects, download sound files from the following free resources and place them in this directory:

### Recommended Free Sound Libraries

#### 1. **Pixabay** (Recommended - No Attribution Required)
- URL: https://pixabay.com/sound-effects/search/card-flip/
- License: Pixabay License (similar to CC0)
- What to download:
  - `flip.mp3` or `flip.wav` - Card flip sound
  - `match.mp3` or `match.wav` - Success/match sound
  - `mismatch.mp3` or `mismatch.wav` - Wrong match sound
  - `win.mp3` or `win.wav` - Game completion sound
  - `turn.mp3` or `turn.wav` - Turn change notification

#### 2. **Zapsplat** (Free with Attribution)
- URL: https://www.zapsplat.com/sound-effect-packs/playing-cards/
- License: Standard License (requires "ZapSplat" credit)
- Features: 85 professional playing card sound effects (mp3 and wav)

#### 3. **Freesound** (Various CC Licenses)
- URL: https://freesound.org/
- License: Various Creative Commons licenses
- Search for: "card flip", "success chime", "game win"

#### 4. **Kenney** (CC0 - Public Domain)
- URL: https://kenney.nl/assets/digital-audio
- License: CC0 (Public Domain)
- Free game audio assets

## Sound File Naming Convention

Place downloaded sound files in this directory with the following names:

- `flip.mp3` or `flip.wav` - Card flip/turn sound
- `match.mp3` or `match.wav` - Successful match sound
- `mismatch.mp3` or `mismatch.wav` - Failed match sound
- `win.mp3` or `win.wav` - Game win/completion sound
- `turnChange.mp3` or `turnChange.wav` - Turn change notification

## How to Use Downloaded Sounds

Once you've downloaded sound files:

1. Place them in this `/public/sounds/` directory
2. Update the sound manager to load them (see `app/lib/sounds/soundManager.ts`)
3. Use the `loadSound()` method in soundManager:

```typescript
const soundManager = getSoundManager();

// Load actual sound files
await soundManager.loadSound('flip', '/sounds/flip.mp3');
await soundManager.loadSound('match', '/sounds/match.mp3');
await soundManager.loadSound('mismatch', '/sounds/mismatch.mp3');
await soundManager.loadSound('win', '/sounds/win.mp3');
await soundManager.loadSound('turnChange', '/sounds/turnChange.mp3');
```

## Supported Formats

- **MP3**: Widely supported, smaller file size
- **WAV**: Uncompressed, higher quality, larger file size
- **OGG**: Good compression, good quality, well supported

## License Compliance

When using sounds from attribution-required sources:

1. **ZapSplat**: Add "Sound effects from ZapSplat.com" to your credits
2. **Freesound**: Check individual sound licenses and provide attribution as required
3. **Pixabay & Kenney**: No attribution required (but appreciated)

## Current Status

✅ Sound manager implemented with Web Audio API
✅ Procedural fallback sounds working
⏳ Professional sound files (optional upgrade)
