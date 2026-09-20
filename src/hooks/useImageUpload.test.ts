import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const uploadImageToStorageMock = vi.fn();
const deleteImageFromStorageMock = vi.fn();
const compressImageMock = vi.fn();

vi.mock('../lib/storageClient', () => ({
  uploadImageToStorage: (...args: unknown[]) => uploadImageToStorageMock(...args),
  deleteImageFromStorage: (...args: unknown[]) => deleteImageFromStorageMock(...args),
}));

vi.mock('../lib/imageCompression', () => ({
  compressImage: (...args: unknown[]) => compressImageMock(...args),
}));

import { useImageUpload } from './useImageUpload';

const PUBLIC_URL = 'https://images.row-nel.com/menu-items/m1/burger.jpg';
const MENU_SCOPE = { category: 'menu-item', context: { merchantId: 'm1' } } as const;

const makeFile = ({ type = 'image/jpeg', name = 'photo.jpg' } = {}): File =>
  new File(['x'], name, { type });

const stored = (publicUrl: string | undefined, objectKey = 'menu-items/m1/burger.jpg') => ({
  objectKey,
  publicUrl,
});

beforeEach(() => {
  uploadImageToStorageMock.mockReset();
  deleteImageFromStorageMock.mockReset();
  compressImageMock.mockReset();
  compressImageMock.mockImplementation(async (file: File) => file);
});

describe('useImageUpload', () => {
  it('compresses the file and returns the public URL on success', async () => {
    // Arrange
    const compressed = makeFile({ name: 'compressed.jpg' });
    compressImageMock.mockResolvedValue(compressed);
    uploadImageToStorageMock.mockResolvedValue(stored(PUBLIC_URL));
    const { result } = renderHook(() => useImageUpload());

    // Act
    let url = '';
    await act(async () => {
      url = await result.current.uploadImage(makeFile(), MENU_SCOPE);
    });

    // Assert
    expect(compressImageMock).toHaveBeenCalledWith(expect.any(File), 1200, 0.8);
    expect(url).toBe(PUBLIC_URL);
  });

  it('uploads the compressed file, so the declared size matches what is sent', async () => {
    // Arrange — the grant is signed against the size the caller declares, and
    // the handler caps it, so sending the original after compressing is wrong.
    const compressed = makeFile({ name: 'compressed.jpg' });
    compressImageMock.mockResolvedValue(compressed);
    uploadImageToStorageMock.mockResolvedValue(stored(PUBLIC_URL));
    const { result } = renderHook(() => useImageUpload());

    // Act
    await act(async () => {
      await result.current.uploadImage(makeFile(), MENU_SCOPE);
    });

    // Assert
    expect(uploadImageToStorageMock).toHaveBeenCalledWith(compressed, MENU_SCOPE);
  });

  it('passes the caller-supplied scope straight through', async () => {
    // Arrange
    const compressed = makeFile({ name: 'logo.png' });
    compressImageMock.mockResolvedValue(compressed);
    uploadImageToStorageMock.mockResolvedValue(
      stored('https://images.row-nel.com/site/logo/a.png', 'site/logo/a.png')
    );
    const { result } = renderHook(() => useImageUpload());

    // Act
    await act(async () => {
      await result.current.uploadImage(makeFile(), { category: 'site-logo' });
    });

    // Assert
    expect(uploadImageToStorageMock).toHaveBeenCalledWith(compressed, {
      category: 'site-logo',
    });
  });

  it('rejects a private category, which has no URL to render', async () => {
    // Arrange — a receipt lives in the private bucket and is reached through a
    // signed GET, so returning it from a hook whose callers render an <img> would
    // hand them an empty src.
    uploadImageToStorageMock.mockResolvedValue(stored(undefined, 'receipts/u1/o1/a.jpg'));
    const { result } = renderHook(() => useImageUpload());

    // Act / Assert
    await act(async () => {
      await expect(
        result.current.uploadImage(makeFile(), {
          category: 'receipt',
          context: { orderId: 'o1' },
        })
      ).rejects.toThrow('This image category cannot be displayed by URL');
    });
    await waitFor(() => expect(result.current.uploading).toBe(false));
  });

  it('reports uploading state while the upload is in flight', async () => {
    // Arrange
    let resolveUpload: (value: { objectKey: string; publicUrl: string }) => void = () => {};
    uploadImageToStorageMock.mockReturnValue(
      new Promise((resolve) => {
        resolveUpload = resolve;
      })
    );
    const { result } = renderHook(() => useImageUpload());

    // Act
    let pending: Promise<string> = Promise.resolve('');
    await act(async () => {
      pending = result.current.uploadImage(makeFile(), MENU_SCOPE);
    });

    // Assert
    expect(result.current.uploading).toBe(true);

    await act(async () => {
      resolveUpload(stored(PUBLIC_URL) as { objectKey: string; publicUrl: string });
      await pending;
    });
    await waitFor(() => expect(result.current.uploading).toBe(false));
  });

  it('propagates the upload error and clears the uploading state', async () => {
    // Arrange
    uploadImageToStorageMock.mockRejectedValue(
      new Error('Could not authorize the upload: Forbidden')
    );
    const { result } = renderHook(() => useImageUpload());

    // Act / Assert
    await act(async () => {
      await expect(result.current.uploadImage(makeFile(), MENU_SCOPE)).rejects.toThrow(
        'Could not authorize the upload: Forbidden'
      );
    });
    await waitFor(() => expect(result.current.uploading).toBe(false));
  });

  it('deletes a stored image through the storage API', async () => {
    // Arrange
    deleteImageFromStorageMock.mockResolvedValue(true);
    const { result } = renderHook(() => useImageUpload());

    // Act
    await act(async () => {
      await result.current.deleteImage(PUBLIC_URL, MENU_SCOPE);
    });

    // Assert
    expect(deleteImageFromStorageMock).toHaveBeenCalledWith(PUBLIC_URL, MENU_SCOPE);
  });

  it('does not reject when deleting an image that cannot be removed', async () => {
    // Arrange
    deleteImageFromStorageMock.mockRejectedValue(new Error('Forbidden'));
    const { result } = renderHook(() => useImageUpload());

    // Act / Assert — removing the reference from the UI must still succeed
    await act(async () => {
      await expect(result.current.deleteImage(PUBLIC_URL, MENU_SCOPE)).resolves.toBeUndefined();
    });
  });
});
