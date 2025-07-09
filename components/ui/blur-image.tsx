import { useState } from 'react';
import NextImage, { ImageProps } from 'next/image';

interface BlurImageProps extends Omit<ImageProps, 'placeholder'> {
  className?: string;
}

export default function BlurImage({ src, alt, width, height, className = '', ...props }: BlurImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);

  return (
    <div className={`relative w-full h-full ${className}`} style={{ minHeight: height, minWidth: width }}>
      <NextImage
        src={src}
        alt={alt}
        width={width}
        height={height}
        className={`transition-all duration-1000 ease-out ${isLoaded ? 'blur-none' : 'blur-lg'} object-cover w-full h-full`}
        onLoadingComplete={() => setIsLoaded(true)}
        {...props}
      />
    </div>
  );
} 