const mockPlay = jest.fn();
const mockSeekTo = jest.fn().mockResolvedValue(undefined);
const mockSetAudioMode = jest.fn().mockResolvedValue(undefined);
const mockCreatePlayer = jest.fn(() => ({ play: mockPlay, seekTo: mockSeekTo, volume: 1 }));

jest.mock('expo-audio', () => ({
  createAudioPlayer: (...args: unknown[]) => mockCreatePlayer(...(args as [])),
  setAudioModeAsync: (...args: unknown[]) => mockSetAudioMode(...(args as [])),
}));
jest.mock('../../assets/sounds/new-order.mp3', () => 'new-order.mp3', { virtual: true });

import { playNewOrderSound } from './sounds';

describe('playNewOrderSound', () => {
  it('creates one player, allows silent-mode playback, and replays from the start', async () => {
    await playNewOrderSound();
    await playNewOrderSound();
    expect(mockSetAudioMode).toHaveBeenCalledWith({ playsInSilentMode: true });
    expect(mockCreatePlayer).toHaveBeenCalledTimes(1);
    expect(mockSeekTo).toHaveBeenCalledWith(0);
    expect(mockPlay).toHaveBeenCalledTimes(2);
  });
});
