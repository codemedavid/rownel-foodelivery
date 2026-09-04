import React, { useState, useEffect, type ImgHTMLAttributes, type ReactNode } from 'react';

type PassThroughProps = Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  'src' | 'srcSet' | 'alt' | 'width' | 'height' | 'loading'
>;

interface OptimizedImageProps extends PassThroughProps {
  src?: string | null;
  alt: string;
  /** Rendered width in CSS pixels — set as an attribute to reduce layout shift. */
  width: number;
  height?: number;
  /** Load eagerly instead of lazily — use for above-the-fold images. */
  isPriority?: boolean;
  fallback?: ReactNode;
}

/**
 * Renders a stored image, falling back to placeholder content when the
 * source is missing or fails to load.
 */
const OptimizedImage: React.FC<OptimizedImageProps> = ({
  src,
  alt,
  width,
  height,
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

  return (
    <img
      {...imgProps}
      src={src}
      alt={alt}
      width={width}
      height={height}
      className={className}
      loading={isPriority ? 'eager' : 'lazy'}
      decoding="async"
      onError={() => setHasFailed(true)}
    />
  );
};

export default OptimizedImage;
