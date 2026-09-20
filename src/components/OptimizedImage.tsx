import React, { useState, useEffect, type ImgHTMLAttributes, type ReactNode } from 'react';
import { buildRenderedImageUrl } from '../lib/imageRendering';
import type { ImageTransform } from '../lib/imagekit';

const DEFAULT_QUALITY = 80;

type PassThroughProps = Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  'src' | 'srcSet' | 'alt' | 'width' | 'height' | 'loading'
>;

interface OptimizedImageProps extends PassThroughProps {
  src?: string | null;
  alt: string;
  /** Rendered width in CSS pixels — drives the CDN resize. */
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
 * Images on R2 resize through Cloudflare Image Transformations and images still
 * on ImageKit resize through ImageKit, both format-negotiated at the CDN with a
 * 2x source for high-density screens. Images stored elsewhere (legacy Cloudinary
 * uploads, pasted URLs) render as-is.
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

  const optimizedSrc = buildRenderedImageUrl(src, { width, height, crop, quality });
  const retinaSrc = buildRenderedImageUrl(src, {
    width: width * 2,
    height: height ? height * 2 : undefined,
    crop,
    quality,
  });

  // Identical URLs mean the source is on neither CDN — a srcSet would add
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
