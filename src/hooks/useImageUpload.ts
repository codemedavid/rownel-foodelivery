import { useState } from 'react';
import { uploadToImageKit, deleteFromImageKit } from '../lib/imagekit';
import { compressImage } from '../lib/imageCompression';

const MENU_IMAGE_FOLDER = 'menu-items';
const COMPRESSION_MAX_WIDTH = 1200;
const COMPRESSION_QUALITY = 0.8;

const PROGRESS_AFTER_COMPRESSION = 40;
const PROGRESS_COMPLETE = 100;
const PROGRESS_RESET_DELAY_MS = 1000;

export const useImageUpload = () => {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const uploadImage = async (file: File): Promise<string> => {
    setUploading(true);
    setUploadProgress(0);

    try {
      const compressedFile = await compressImage(
        file,
        COMPRESSION_MAX_WIDTH,
        COMPRESSION_QUALITY
      );
      setUploadProgress(PROGRESS_AFTER_COMPRESSION);

      const { url } = await uploadToImageKit(compressedFile, { folder: MENU_IMAGE_FOLDER });
      setUploadProgress(PROGRESS_COMPLETE);

      return url;
    } finally {
      setUploading(false);
      setTimeout(() => setUploadProgress(0), PROGRESS_RESET_DELAY_MS);
    }
  };

  /**
   * Best-effort removal from storage. A failure here must not block the caller
   * from unlinking the image, otherwise the UI is stuck on a broken reference.
   */
  const deleteImage = async (imageUrl: string): Promise<void> => {
    try {
      await deleteFromImageKit(imageUrl);
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
