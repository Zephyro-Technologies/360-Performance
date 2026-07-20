import React, { useState } from 'react'

// Renders a clean placeholder (not raw alt text) when the image is missing or fails
// to load. The placeholder fills the container via the passed className (e.g.
// size-full), so an empty image still occupies its box — keeping aspect ratios and
// any absolutely-positioned overlays in place.
export function ImageWithFallback(props: React.ImgHTMLAttributes<HTMLImageElement>) {
  const [didError, setDidError] = useState(false)

  const { src, alt, style, className, ...rest } = props

  if (didError || !src) {
    return (
      <div
        role="img"
        aria-label={typeof alt === 'string' && alt ? alt : 'No image available'}
        className={`flex items-center justify-center bg-zinc-100 text-zinc-300 ${className ?? ''}`}
        style={style}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden className="size-12 max-h-[40%] max-w-[40%]">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <path d="m21 15-5-5L5 21" />
        </svg>
      </div>
    )
  }

  return <img src={src} alt={alt} className={className} style={style} {...rest} onError={() => setDidError(true)} />
}
