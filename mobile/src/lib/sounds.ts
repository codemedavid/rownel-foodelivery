import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

/** Same clip the web dashboard plays (public/sounds/new-order.mp3). */
export const NEW_ORDER_SOUND = require('../../assets/sounds/new-order.mp3');
/** Bundled via the expo-notifications plugin for push/local notification sound. */
export const NEW_ORDER_NOTIFICATION_SOUND = 'new-order.wav';

const VOLUME = 0.9;

let player: AudioPlayer | null = null;
let isAudioModeReady = false;

const ensurePlayer = async (): Promise<AudioPlayer> => {
  if (!isAudioModeReady) {
    // Staff need to hear new orders even with the ringer switch off.
    await setAudioModeAsync({ playsInSilentMode: true });
    isAudioModeReady = true;
  }
  if (!player) {
    player = createAudioPlayer(NEW_ORDER_SOUND);
    player.volume = VOLUME;
  }
  return player;
};

/** Plays the new-order ring once. Never throws; audio is best-effort. */
export const playNewOrderSound = async (): Promise<void> => {
  try {
    const p = await ensurePlayer();
    await p.seekTo(0);
    p.play();
  } catch (err) {
    if (__DEV__) console.warn('New order sound failed:', err);
  }
};
