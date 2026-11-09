import React from "react";

/**
 * Hidden SVG displacement + specular lighting lens filter that emulates iOS 26 `lens()`
 * refraction along the edges of Liquid Glass pills and cards.
 *
 * Red channel encodes X-axis edge refraction; Green channel encodes Y-axis edge refraction.
 * Neutral gray (128, 128) in the center preserves legibility while edges bend light.
 */
const LENS_DISPLACEMENT_MAP_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256" preserveAspectRatio="none">
    <defs>
      <linearGradient id="rx" x1="0%" y1="50%" x2="100%" y2="50%">
        <stop offset="0%" stop-color="rgb(235, 128, 128)" />
        <stop offset="18%" stop-color="rgb(128, 128, 128)" />
        <stop offset="82%" stop-color="rgb(128, 128, 128)" />
        <stop offset="100%" stop-color="rgb(20, 128, 128)" />
      </linearGradient>
      <linearGradient id="gy" x1="50%" y1="0%" x2="50%" y2="100%">
        <stop offset="0%" stop-color="rgb(128, 235, 128)" />
        <stop offset="22%" stop-color="rgb(128, 128, 128)" />
        <stop offset="78%" stop-color="rgb(128, 128, 128)" />
        <stop offset="100%" stop-color="rgb(128, 20, 128)" />
      </linearGradient>
      <radialGradient id="dome" cx="50%" cy="50%" r="54%">
        <stop offset="0%" stop-color="rgb(128, 128, 255)" stop-opacity="1" />
        <stop offset="72%" stop-color="rgb(128, 128, 220)" stop-opacity="0.92" />
        <stop offset="100%" stop-color="rgb(128, 128, 60)" stop-opacity="0.25" />
      </radialGradient>
    </defs>
    <rect width="256" height="256" fill="rgb(128, 128, 128)" />
    <rect width="256" height="256" fill="url(#rx)" style="mix-blend-mode: hard-light" />
    <rect width="256" height="256" fill="url(#gy)" style="mix-blend-mode: hard-light" />
    <rect x="8" y="8" width="240" height="240" rx="64" fill="url(#dome)" style="mix-blend-mode: overlay" />
  </svg>`,
)}`;

export default function LiquidGlassSvgFilter() {
  return (
    <svg
      width="0"
      height="0"
      className="fixed pointer-events-none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <filter
          id="liquid-glass-lens"
          x="-15%"
          y="-15%"
          width="130%"
          height="130%"
          colorInterpolationFilters="sRGB"
        >
          <feImage
            href={LENS_DISPLACEMENT_MAP_SVG}
            x="0"
            y="0"
            width="100%"
            height="100%"
            preserveAspectRatio="none"
            result="lensMapRaw"
          />
          <feGaussianBlur in="lensMapRaw" stdDeviation="6" result="lensMap" />

          {/* Edge refraction lens displacement */}
          <feDisplacementMap
            in="SourceGraphic"
            in2="lensMap"
            scale="18"
            xChannelSelector="R"
            yChannelSelector="G"
            result="refractedGraphic"
          />

          {/* 45-degree rim specular highlight */}
          <feSpecularLighting
            in="lensMap"
            surfaceScale="2.6"
            specularConstant="0.65"
            specularExponent="32"
            lightingColor="#ffffff"
            result="specularLight"
          >
            <feDistantLight azimuth="225" elevation="45" />
          </feSpecularLighting>

          <feComposite
            in="specularLight"
            in2="SourceAlpha"
            operator="in"
            result="specularRim"
          />

          <feComposite
            in="refractedGraphic"
            in2="specularRim"
            operator="arithmetic"
            k1="0"
            k2="1"
            k3="0.28"
            k4="0"
            result="liquidGlassOutput"
          />
        </filter>
      </defs>
    </svg>
  );
}
