"use client";

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type TouchEvent as ReactTouchEvent,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLiquidGlass } from "@/hooks/useLiquidGlass";
import styles from "./LiquidGlass.module.css";

export interface LiquidGlassTabItem {
  id: string;
  label: string;
  icon: ReactNode;
  href?: string;
  onClick?: () => void;
  tone?: "blue" | "green" | "orange" | "neutral";
}

export interface LiquidGlassTabBarProps {
  items: LiquidGlassTabItem[];
  activeId?: string;
  defaultActiveId?: string;
  onActiveChange?: (id: string) => void;
  ariaLabel?: string;
  className?: string;
  theme?: "light" | "dark";
}

const BLOB_HOVER_SCALE = 1.22;
const BLOB_PRESSED_SCALE = 76 / 56; // 1.3571428 -> expands 56px blob to ~76px, overflowing 64px bar

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export default function LiquidGlassTabBar({
  items,
  activeId,
  defaultActiveId,
  onActiveChange,
  ariaLabel = "Thanh điều hướng Liquid Glass",
  className = "",
  theme = "light",
}: LiquidGlassTabBarProps) {
  const router = useRouter();
  const [internalActiveId, setInternalActiveId] = useState<string>(
    activeId ?? defaultActiveId ?? items[0]?.id ?? "",
  );
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  const resolvedActiveId = activeId ?? internalActiveId;
  const activeIndex = Math.max(
    0,
    items.findIndex((item) => item.id === resolvedActiveId),
  );
  const displayedIndex = previewIndex ?? activeIndex;

  const trackRef = useRef<HTMLDivElement | null>(null);
  const isPointerDownRef = useRef(false);
  const isTouchActiveRef = useRef(false);
  const touchStartXRef = useRef(0);
  const touchLastXRef = useRef(0);
  const latestPreviewIndexRef = useRef<number | null>(null);

  // Layer 1: 64px background glass pill
  const {
    ref: pillRef,
    surfaceStyle: pillSurfaceStyle,
    glowStyle: pillGlowStyle,
    triggerHover: triggerPillHover,
    triggerPress: triggerPillPress,
    triggerRelease: triggerPillRelease,
  } = useLiquidGlass<HTMLDivElement>({
    hoverScale: 1.02,
    pressedScale: 1.04,
    stiffness: 280,
    dampingRatio: 0.55,
    releaseDampingRatio: 0.5,
  });

  // Layer 2: 56px Frosted Sliding Blob (bulges to 1.22 on hover and 76/56 = 1.357 on press)
  const {
    ref: blobRef,
    surfaceStyle: blobSurfaceStyle,
    glowStyle: blobGlowStyle,
    setTargetTx: setBlobTargetTx,
    triggerHover: triggerBlobHover,
    triggerPress: triggerBlobPress,
    triggerRelease: triggerBlobRelease,
  } = useLiquidGlass<HTMLDivElement>({
    hoverScale: BLOB_HOVER_SCALE,
    pressedScale: BLOB_PRESSED_SCALE,
    stiffness: 280,
    dampingRatio: 0.55,
    releaseDampingRatio: 0.5,
  });

  const getSlotMetrics = useCallback(() => {
    const track = trackRef.current;
    if (!track || items.length === 0) return { trackWidth: 0, slotWidth: 0, left: 0 };
    const rect = track.getBoundingClientRect();
    const trackWidth = rect.width;
    const slotWidth = trackWidth / items.length;
    return { trackWidth, slotWidth, left: rect.left };
  }, [items.length]);

  const snapBlobToIndex = useCallback(
    (index: number, immediate = false) => {
      const { slotWidth } = getSlotMetrics();
      if (slotWidth <= 0) return;
      const targetX = index * slotWidth;
      setBlobTargetTx(targetX, immediate);
    },
    [getSlotMetrics, setBlobTargetTx],
  );

  useEffect(() => {
    snapBlobToIndex(activeIndex, false);
  }, [activeIndex, snapBlobToIndex]);

  useEffect(() => {
    const handleResize = () => {
      snapBlobToIndex(previewIndex ?? activeIndex, true);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [activeIndex, previewIndex, snapBlobToIndex]);

  const updateBlobFromPointer = useCallback(
    (clientX: number, clientY: number, isPressing = false) => {
      const { trackWidth, slotWidth, left } = getSlotMetrics();
      if (slotWidth <= 0 || items.length === 0) return;

      const localX = clamp(clientX - left, 0, trackWidth);
      const nearestIndex = clamp(Math.floor(localX / slotWidth), 0, items.length - 1);
      latestPreviewIndexRef.current = nearestIndex;
      setPreviewIndex(nearestIndex);

      const slotCenter = (nearestIndex + 0.5) * slotWidth;
      const deltaFromCenter = localX - slotCenter;
      const magneticOffset = clamp(deltaFromCenter * 0.28, -slotWidth * 0.22, slotWidth * 0.22);
      const targetX = nearestIndex * slotWidth + magneticOffset;

      setBlobTargetTx(targetX, false);
      if (isPressing) {
        triggerPillPress(clientX, clientY);
        triggerBlobPress(clientX, clientY);
      } else {
        triggerPillHover(clientX, clientY);
        triggerBlobHover(clientX, clientY);
      }
    },
    [
      getSlotMetrics,
      items.length,
      setBlobTargetTx,
      triggerBlobHover,
      triggerBlobPress,
      triggerPillHover,
      triggerPillPress,
    ],
  );

  // Mouse / Pen Pointer handlers
  const handlePointerEnter = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType === "touch" || isTouchActiveRef.current) return;
    updateBlobFromPointer(event.clientX, event.clientY, isPointerDownRef.current);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType === "touch" || isTouchActiveRef.current) return;
    updateBlobFromPointer(event.clientX, event.clientY, isPointerDownRef.current);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType === "touch" || isTouchActiveRef.current) return;
    isPointerDownRef.current = true;
    updateBlobFromPointer(event.clientX, event.clientY, true);
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType === "touch" || isTouchActiveRef.current) return;
    const wasDown = isPointerDownRef.current;
    isPointerDownRef.current = false;

    const keepHover = event.pointerType === "mouse";
    triggerPillRelease(keepHover);
    triggerBlobRelease(keepHover);

    const targetIdx = latestPreviewIndexRef.current ?? previewIndex;
    if (wasDown && targetIdx !== null) {
      const selected = items[targetIdx];
      if (selected) {
        setInternalActiveId(selected.id);
        onActiveChange?.(selected.id);
        snapBlobToIndex(targetIdx, false);
      }
    } else {
      snapBlobToIndex(targetIdx ?? activeIndex, false);
    }
  };

  const handlePointerLeave = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType === "touch" || isTouchActiveRef.current) return;
    isPointerDownRef.current = false;
    latestPreviewIndexRef.current = null;
    setPreviewIndex(null);
    triggerPillRelease(false);
    triggerBlobRelease(false);
    snapBlobToIndex(activeIndex, false);
  };

  // Mobile Touch / Drag handlers
  const handleTouchStart = (event: ReactTouchEvent<HTMLElement>) => {
    const touch = event.touches[0];
    if (!touch) return;
    isTouchActiveRef.current = true;
    isPointerDownRef.current = true;
    touchStartXRef.current = touch.clientX;
    touchLastXRef.current = touch.clientX;
    updateBlobFromPointer(touch.clientX, touch.clientY, true);
  };

  const handleTouchMove = (event: ReactTouchEvent<HTMLElement>) => {
    const touch = event.touches[0];
    if (!touch) return;
    touchLastXRef.current = touch.clientX;
    updateBlobFromPointer(touch.clientX, touch.clientY, true);
  };

  const handleTouchEnd = () => {
    if (!isTouchActiveRef.current) return;
    isTouchActiveRef.current = false;
    isPointerDownRef.current = false;

    const targetIdx = latestPreviewIndexRef.current ?? activeIndex;
    const draggedDistance = Math.abs(touchLastXRef.current - touchStartXRef.current);
    const selected = items[targetIdx];

    if (selected) {
      setInternalActiveId(selected.id);
      onActiveChange?.(selected.id);
      snapBlobToIndex(targetIdx, false);

      // If the user dragged their finger across tabs and released, trigger the tab action
      if (draggedDistance > 14) {
        if (selected.onClick) {
          selected.onClick();
        } else if (selected.href) {
          router.push(selected.href);
        }
      }
    }

    latestPreviewIndexRef.current = null;
    setPreviewIndex(null);
    triggerPillRelease(false);
    triggerBlobRelease(false);
  };

  const handleItemActivate = (item: LiquidGlassTabItem, index: number) => {
    setInternalActiveId(item.id);
    latestPreviewIndexRef.current = null;
    setPreviewIndex(null);
    onActiveChange?.(item.id);
    snapBlobToIndex(index, false);
    item.onClick?.();
  };

  const activeTone = items[displayedIndex]?.tone ?? "blue";

  return (
    <nav
      aria-label={ariaLabel}
      className={`${styles.tabBarRoot} ${className}`}
      data-liquid-theme={theme}
      onPointerEnter={handlePointerEnter}
      onPointerMove={handlePointerMove}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      {/* Layer 1: 64px Background Glass Pill (hoverScale: 1.02, pressedScale: 1.04) */}
      <div
        ref={pillRef}
        className={styles.tabBarPillLayer}
        style={pillSurfaceStyle}
        aria-hidden="true"
      >
        <div
          className="pointer-events-none absolute inset-0 rounded-[inherit]"
          style={pillGlowStyle}
        />
      </div>

      {/* Layer 2: 56px Frosted Sliding Blob in overflow:visible container (pressedScale: 76/56 = 1.357 -> ~76px) */}
      <div ref={trackRef} className={styles.tabBarBlobTrack} aria-hidden="true">
        <div
          ref={blobRef}
          className={`${styles.tabBarSlidingBlob} ${styles[`blobTone_${activeTone}`] ?? ""}`}
          style={
            {
              ...blobSurfaceStyle,
              width: `calc(100% / ${Math.max(1, items.length)})`,
            } as CSSProperties
          }
        >
          <div
            className="pointer-events-none absolute inset-0 rounded-[inherit]"
            style={blobGlowStyle}
          />
        </div>
      </div>

      {/* Layer 3: Sharp Icons + Text at z-10 (never blurred by Layer 2, receives 100% of clicks) */}
      <div
        className={styles.tabBarItemsLayer}
        style={{
          gridTemplateColumns: `repeat(${Math.max(1, items.length)}, minmax(0, 1fr))`,
        }}
      >
        {items.map((item, index) => {
          const isSelected = index === displayedIndex;
          const toneClass = item.tone ? styles[`itemTone_${item.tone}`] : "";
          const itemClassName = `${styles.tabBarItem} ${toneClass} ${
            isSelected ? styles.tabBarItemActive : ""
          }`;

          if (item.href) {
            return (
              <Link
                key={item.id}
                href={item.href}
                className={itemClassName}
                onClick={() => handleItemActivate(item, index)}
              >
                <span className={styles.tabBarItemIcon} aria-hidden="true">
                  {item.icon}
                </span>
                <span className={styles.tabBarItemLabel}>{item.label}</span>
              </Link>
            );
          }

          return (
            <button
              key={item.id}
              type="button"
              className={itemClassName}
              onClick={() => handleItemActivate(item, index)}
            >
              <span className={styles.tabBarItemIcon} aria-hidden="true">
                {item.icon}
              </span>
              <span className={styles.tabBarItemLabel}>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
