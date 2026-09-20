import { useState } from 'react';
import { deleteImageFromStorage, uploadImageToStorage } from '../lib/storageClient';
import type { StorageScope } from '../lib/storageClient';
import { compressImage } from '../lib/imageCompression';

const COMPRESSION_MAX_WIDTH = 1200;
const COMPRESSION_QUALITY = 0.8;

const PROGRESS_AFTER_COMPRESSION = 40;
const PROGRESS_COMPLETE = 100;
const PROGRESS_RESET_DELAY_MS = 1000;

export const useImageUpload = () => {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  /**
   * Compress, then store through `/api/storage`.
   *
   * `scope` decides both the bucket and the object key, so it is required: the
   * category fixes the prefix and visibility, and its context ids (merchantId,
   * orderId, riderId) scope the object to the record it belongs to. Compression
   * runs first so the size declared to the grant is the size actually uploaded.
   */
  const uploadImage = async (file: File, scope: StorageScope): Promise<string> => {
    setUploading(true);
    setUploadProgress(0);

    try {
      const compressedFile = await compressImage(
        file,
        COMPRESSION_MAX_WIDTH,
        COMPRESSION_QUALITY
      );
      setUploadProgress(PROGRESS_AFTER_COMPRESSION);

      const { publicUrl } = await uploadImageToStorage(compressedFile, scope);
      if (!publicUrl) {
        // Every caller of this hook renders the result straight into an <img>.
        // A private category has no such URL and needs `requestDownloadUrl`.
        throw new Error('This image category cannot be displayed by URL');
      }
      setUploadProgress(PROGRESS_COMPLETE);

      return publicUrl;
    } finally {
      setUploading(false);
      setTimeout(() => setUploadProgress(0), PROGRESS_RESET_DELAY_MS);
    }
  };

  /**
   * Best-effort removal from storage. A failure here must not block the caller
   * from unlinking the image, otherwise the UI is stuck on a broken reference.
   */
  const deleteImage = async (imageUrl: string, scope: StorageScope): Promise<void> => {
    try {
      await deleteImageFromStorage(imageUrl, scope);
    } catch {
      // Intentionally swallowed: storage cleanup is not worth failing the edit.
    }
  };

  return {
    uploadImage,
    deleteImage,
    uploading,
    uploadProgress,
  };
};
