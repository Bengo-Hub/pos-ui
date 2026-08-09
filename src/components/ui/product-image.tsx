"use client";

import Image from "next/image";
import { ImageOff } from "lucide-react";
import { useEffect, useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { resolveMediaUrl } from "@/lib/screensaver";
import { cn } from "@/lib/utils";

interface ProductImageProps {
  /** Raw (possibly relative/empty) image URL from pos-api's catalog sync. */
  src?: string | null | undefined;
  alt: string;
  className?: string;
  fallbackClassName?: string;
  fill?: boolean;
  width?: number;
  height?: number;
  sizes?: string;
  priority?: boolean;
  loading?: "eager" | "lazy";
}

/**
 * Single choke point for rendering a catalog item thumbnail in pos-ui — mirrors
 * ordering-frontend's ImageWithFallback (`shared feedback_ui_architecture_uniformity`
 * convention: same skeleton-while-loading + never-block-the-card behavior across
 * both storefronts). Card rendering never waits on this: the item name/price/add
 * button all mount immediately regardless of image state.
 */
export function ProductImage({
  src,
  alt,
  className,
  fallbackClassName,
  fill,
  width,
  height,
  sizes,
  priority,
  loading,
}: ProductImageProps) {
  // pos-api's catalog sync already passes through inventory-api's fully-resolved
  // absolute URL in the common case; resolveMediaUrl only kicks in for the rare
  // relative `/media/...` value (defensive, mirrors the screensaver convention).
  const resolved = src ? resolveMediaUrl(src) : undefined;
  const [loadError, setLoadError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  useEffect(() => {
    setLoadError(false);
    setIsLoaded(false);
  }, [resolved]);

  if (!resolved || loadError) {
    return (
      <div
        className={cn(
          fill && "absolute inset-0",
          "flex items-center justify-center bg-muted",
          !fill && "size-full",
          fallbackClassName,
        )}
        style={!fill && width && height ? { width, height } : undefined}
      >
        <ImageOff className="size-1/3 text-muted-foreground/50" aria-hidden />
      </div>
    );
  }

  const imageProps = {
    src: resolved,
    alt,
    onLoad: () => setIsLoaded(true),
    onError: () => setLoadError(true),
    className: cn(className, "transition-opacity duration-300", isLoaded ? "opacity-100" : "opacity-0"),
    ...(sizes ? { sizes } : {}),
    ...(priority ? { priority } : {}),
    ...(loading ? { loading } : {}),
  };

  if (fill) {
    return (
      <div className="absolute inset-0">
        {!isLoaded && <Skeleton className={cn("absolute inset-0 rounded-none", className)} />}
        <Image {...imageProps} fill />
      </div>
    );
  }

  return (
    <div className="relative inline-block" style={width && height ? { width, height } : undefined}>
      {!isLoaded && <Skeleton className={cn("absolute inset-0 rounded-none", className)} />}
      <Image {...imageProps} width={width ?? 64} height={height ?? 64} />
    </div>
  );
}
