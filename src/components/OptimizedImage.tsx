import React, { useState, useEffect, type ImgHTMLAttributes, type ReactNode } from 'react';
import { buildImageKitUrl, type ImageTransform } from '../lib/imagekit';

const DEFAULT_QUALITY = 80;

type PassThroughProps = Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  'src' | 'srcSet' | 'alt' | 'width' | 'height' | 'loading'
>;

interface OptimizedImageProps extends PassThroughProps {
  src?: string | null;
  alt: string;
  /** Rendered width in CSS pixels — drives the ImageKit resize. */
  width: number;
  height?: number;
  crop?: ImageTransform['crop'];
  quality?: number;
  /** Load eagerly instead of lazily — use for above-the-fold images. */
  isPriority?: boolean;
  fallback?: ReactNode;
}

/**
 * Renders an image at the size it is actually displayed.
 *
 * ImageKit-hosted images are resized and format-negotiated at the CDN, with a
 * 2x source for high-density screens. Images stored elsewhere (legacy
 * Cloudinary uploads, pasted URLs) render as-is.
 */
const OptimizedImage: React.FC<OptimizedImageProps> = ({
  src,
  alt,
  width,
  height,
  crop,
  quality = DEFAULT_QUALITY,
  isPriority = false,
  fallback = null,
  className,
  ...imgProps
}) => {
  const [hasFailed, setHasFailed] = useState(false);

  // A new source deserves a fresh attempt, even if the previous one failed.
  useEffect(() => {
    setHasFailed(false);
  }, [src]);

  if (!src || hasFailed) {
    return <>{fallback}</>;
  }

  const transform: ImageTransform = { width, height, crop, quality, format: 'auto' };
  const optimizedSrc = buildImageKitUrl(src, transform);
  const retinaSrc = buildImageKitUrl(src, {
    ...transform,
    width: width * 2,
    height: height ? height * 2 : undefined,
  });

  // Identical URLs mean the source is not on ImageKit — a srcSet would add
  // nothing but a duplicate request hint.
  const srcSet = retinaSrc !== optimizedSrc ? `${optimizedSrc} 1x, ${retinaSrc} 2x` : undefined;

  return (
    <img
      {...imgProps}
      src={optimizedSrc}
      srcSet={srcSet}
      alt={alt}
      className={className}
      loading={isPriority ? 'eager' : 'lazy'}
      decoding="async"
      onError={() => setHasFailed(true)}
    />
  );
};

export default OptimizedImage;
