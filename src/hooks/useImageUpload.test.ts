import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const uploadToImageKitMock = vi.fn();
const deleteFromImageKitMock = vi.fn();
const compressImageMock = vi.fn();

vi.mock('../lib/imagekit', () => ({
  uploadToImageKit: (...args: unknown[]) => uploadToImageKitMock(...args),
  deleteFromImageKit: (...args: unknown[]) => deleteFromImageKitMock(...args),
}));

vi.mock('../lib/imageCompression', () => ({
  compressImage: (...args: unknown[]) => compressImageMock(...args),
}));

import { useImageUpload } from './useImageUpload';

const IK_URL = 'https://ik.imagekit.io/hvqkkhesl/menu-items/burger_xyz.jpg';

const makeFile = ({ type = 'image/jpeg', name = 'photo.jpg' } = {}): File =>
  new File(['x'], name, { type });

beforeEach(() => {
  uploadToImageKitMock.mockReset();
  deleteFromImageKitMock.mockReset();
  compressImageMock.mockReset();
  compressImageMock.mockImplementation(async (file: File) => file);
});

describe('useImageUpload', () => {
  it('compresses the file and returns the ImageKit URL on success', async () => {
    // Arrange
    const compressed = makeFile({ name: 'compressed.jpg' });
    compressImageMock.mockResolvedValue(compressed);
    uploadToImageKitMock.mockResolvedValue({ url: IK_URL, fileId: 'file-1' });
    const { result } = renderHook(() => useImageUpload());

    // Act
    let url = '';
    await act(async () => {
      url = await result.current.uploadImage(makeFile());
    });

    // Assert
    expect(compressImageMock).toHaveBeenCalledWith(expect.any(File), 1200, 0.8);
    expect(uploadToImageKitMock).toHaveBeenCalledWith(compressed, {
      folder: 'menu-items',
    });
    expect(url).toBe(IK_URL);
  });

  it('reports uploading state while the upload is in flight', async () => {
    // Arrange
    let resolveUpload: (value: { url: string }) => void = () => {};
    uploadToImageKitMock.mockReturnValue(
      new Promise((resolve) => {
        resolveUpload = resolve;
      })
    );
    const { result } = renderHook(() => useImageUpload());

    // Act
    let pending: Promise<string> = Promise.resolve('');
    await act(async () => {
      pending = result.current.uploadImage(makeFile());
    });

    // Assert
    expect(result.current.uploading).toBe(true);

    await act(async () => {
      resolveUpload({ url: IK_URL });
      await pending;
    });
    await waitFor(() => expect(result.current.uploading).toBe(false));
  });

  it('propagates the upload error and clears the uploading state', async () => {
    // Arrange
    uploadToImageKitMock.mockRejectedValue(new Error('Invalid signature'));
    const { result } = renderHook(() => useImageUpload());

    // Act / Assert
    await act(async () => {
      await expect(result.current.uploadImage(makeFile())).rejects.toThrow(
        'Invalid signature'
      );
    });
    await waitFor(() => expect(result.current.uploading).toBe(false));
  });

  it('deletes a stored image through ImageKit', async () => {
    // Arrange
    deleteFromImageKitMock.mockResolvedValue(true);
    const { result } = renderHook(() => useImageUpload());

    // Act
    await act(async () => {
      await result.current.deleteImage(IK_URL);
    });

    // Assert
    expect(deleteFromImageKitMock).toHaveBeenCalledWith(IK_URL);
  });

  it('does not reject when deleting an image that cannot be removed', async () => {
    // Arrange
    deleteFromImageKitMock.mockRejectedValue(new Error('Forbidden'));
    const { result } = renderHook(() => useImageUpload());

    // Act / Assert — removing the reference from the UI must still succeed
    await act(async () => {
      await expect(result.current.deleteImage(IK_URL)).resolves.toBeUndefined();
    });
  });
});
