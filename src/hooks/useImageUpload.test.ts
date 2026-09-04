import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const uploadToStorageMock = vi.fn();
const deleteFromStorageMock = vi.fn();
const compressImageMock = vi.fn();

vi.mock('../lib/storage', () => ({
  uploadToStorage: (...args: unknown[]) => uploadToStorageMock(...args),
  deleteFromStorage: (...args: unknown[]) => deleteFromStorageMock(...args),
}));

vi.mock('../lib/imageCompression', () => ({
  compressImage: (...args: unknown[]) => compressImageMock(...args),
}));

import { useImageUpload } from './useImageUpload';

const STORAGE_URL = 'https://apbmremibgwoyrddjhcg.supabase.co/storage/v1/object/public/menu-images/menu-items/burger_xyz.jpg';

const makeFile = ({ type = 'image/jpeg', name = 'photo.jpg' } = {}): File =>
  new File(['x'], name, { type });

beforeEach(() => {
  uploadToStorageMock.mockReset();
  deleteFromStorageMock.mockReset();
  compressImageMock.mockReset();
  compressImageMock.mockImplementation(async (file: File) => file);
});

describe('useImageUpload', () => {
  it('compresses the file and returns the ImageKit URL on success', async () => {
    // Arrange
    const compressed = makeFile({ name: 'compressed.jpg' });
    compressImageMock.mockResolvedValue(compressed);
    uploadToStorageMock.mockResolvedValue({ url: STORAGE_URL, fileId: 'file-1' });
    const { result } = renderHook(() => useImageUpload());

    // Act
    let url = '';
    await act(async () => {
      url = await result.current.uploadImage(makeFile());
    });

    // Assert
    expect(compressImageMock).toHaveBeenCalledWith(expect.any(File), 1200, 0.8);
    expect(uploadToStorageMock).toHaveBeenCalledWith(compressed, {
      folder: 'menu-items',
    });
    expect(url).toBe(STORAGE_URL);
  });

  it('reports uploading state while the upload is in flight', async () => {
    // Arrange
    let resolveUpload: (value: { url: string }) => void = () => {};
    uploadToStorageMock.mockReturnValue(
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
      resolveUpload({ url: STORAGE_URL });
      await pending;
    });
    await waitFor(() => expect(result.current.uploading).toBe(false));
  });

  it('propagates the upload error and clears the uploading state', async () => {
    // Arrange
    uploadToStorageMock.mockRejectedValue(new Error('Invalid signature'));
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
    deleteFromStorageMock.mockResolvedValue(true);
    const { result } = renderHook(() => useImageUpload());

    // Act
    await act(async () => {
      await result.current.deleteImage(STORAGE_URL);
    });

    // Assert
    expect(deleteFromStorageMock).toHaveBeenCalledWith(STORAGE_URL);
  });

  it('does not reject when deleting an image that cannot be removed', async () => {
    // Arrange
    deleteFromStorageMock.mockRejectedValue(new Error('Forbidden'));
    const { result } = renderHook(() => useImageUpload());

    // Act / Assert — removing the reference from the UI must still succeed
    await act(async () => {
      await expect(result.current.deleteImage(STORAGE_URL)).resolves.toBeUndefined();
    });
  });
});
