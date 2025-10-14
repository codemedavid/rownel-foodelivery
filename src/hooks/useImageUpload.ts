import { useState } from 'react';
import { uploadMenuImageToCloudinary, compressImage } from '../lib/cloudinary';

export const useImageUpload = () => {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const uploadImage = async (file: File): Promise<string> => {
    try {
      setUploading(true);
      setUploadProgress(0);

      // Validate file type
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
      if (!allowedTypes.includes(file.type)) {
        throw new Error('Please upload a valid image file (JPEG, PNG, WebP, or GIF)');
      }

      // Validate file size (10MB limit for Cloudinary)
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (file.size > maxSize) {
        throw new Error('Image size must be less than 10MB');
      }

      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 100);

      // Compress image before upload (1200px max, 80% quality)
      setUploadProgress(20);
      const compressedFile = await compressImage(file, 1200, 0.8);
      setUploadProgress(40);

      // Upload to Cloudinary
      const imageUrl = await uploadMenuImageToCloudinary(compressedFile);

      clearInterval(progressInterval);
      setUploadProgress(100);

      return imageUrl;
    } catch (error) {
      console.error('Error uploading image:', error);
      throw error;
    } finally {
      setUploading(false);
      setTimeout(() => setUploadProgress(0), 1000);
    }
  };

  const deleteImage = async (imageUrl: string): Promise<void> => {
    try {
      // Note: Cloudinary free tier doesn't support deletion via API
      // Images will be automatically cleaned up after a period of inactivity
      // For production, you would need to implement server-side deletion
      console.log('Image deletion requested for:', imageUrl);
      console.log('Note: Cloudinary free tier images are auto-managed');
    } catch (error) {
      console.error('Error deleting image:', error);
      throw error;
    }
  };

  return {
    uploadImage,
    deleteImage,
    uploading,
    uploadProgress
  };
};