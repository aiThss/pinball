"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";

export interface UseLiquidGlassOptions {
  hoverScale?: number;
  pressedScale?: number;
  stiffness?: number;
  dampingRatio?: number;
  releaseDampingRatio?: number;
  hoverGlowAlpha?: number;
  pressedGlowAlpha?: number;
  disabled?: boolean;
}

export interface LiquidGlassController {
  setTargetTx: (tx: number, immediate?: boolean) => void;
  triggerHover: (clientX?: number, clientY?: number) => void;
  triggerPress: (clientX?: number, clientY?: number) => void;
  triggerRelease: (keepHover?: boolean) => void;
  injectVelocity: (vx: number, vy?: number) => void;
  destroy: () => void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function stepSpring(
  current: number,
  velocity: number,
  target: number,
  stiffness: number,
  dampingRatio: number,
  dt: number,
): [number, number] {
  const omega = Math.sqrt(stiffness);
  const damping = 2 * dampingRatio * omega;
  const displacement = current - target;
  const acceleration = -stiffness * displacement - damping * velocity;
  const nextVelocity = velocity + acceleration * dt;
  const nextValue = current + nextVelocity * dt;
  return [nextValue, nextVelocity];
}

const MIN_TOUCH_HOLD_MS = 175;

export function attachLiquidGlassPhysics(
  element: HTMLElement,
  options: UseLiquidGlassOptions = {},
  bindDomEvents = true,
): LiquidGlassController {
  const hoverScale = options.hoverScale ?? 1.05;
  const pressedScale = options.pressedScale ?? 1.12;
  const stiffness = options.stiffness ?? 280;
  const activeDampingRatio = options.dampingRatio ?? 0.55;
  const releaseDampingRatio = options.releaseDampingRatio ?? 0.5;
  const hoverGlowAlpha = options.hoverGlowAlpha ?? 0.16;
  const pressedGlowAlpha = options.pressedGlowAlpha ?? 0.26;

  let currentScale = 1;
  let velocityScale = 0;
  let targetScale = 1;

  let currentGlow = 0;
  let velocityGlow = 0;
  let targetGlow = 0;

  let currentPress = 0;
  let velocityPress = 0;
  let targetPress = 0;

  let currentTx = 0;
  let velocityTx = 0;
  let targetTx = 0;

  // Smoothed pointer velocity (px/ms) for Squash & Stretch
  let vx = 0;
  let vy = 0;

  let prevX: number | null = null;
  let prevY: number | null = null;
  let prevEventTime = 0;

  let isHovered = false;
  let isPressed = false;
  let isTouchActive = false;
  let pressStartTime = 0;
  let releaseTimer: number | null = null;
  let currentDamping = activeDampingRatio;
  let rafId: number | null = null;
  let lastFrameTime = 0;

  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const clearReleaseTimer = () => {
    if (releaseTimer !== null && typeof window !== "undefined") {
      window.clearTimeout(releaseTimer);
      releaseTimer = null;
    }
  };

  const writeCssVars = () => {
    const stretchFactorX = 1 - clamp(vx * 0.015, -0.18, 0.18);
    const stretchFactorY = 1 - clamp(vy * 0.008, -0.15, 0.15);
    const scaleX = currentScale / stretchFactorX;
    const scaleY = currentScale * stretchFactorY;

    element.style.setProperty("--scale", currentScale.toFixed(4));
    element.style.setProperty("--scale-x", scaleX.toFixed(4));
    element.style.setProperty("--scale-y", scaleY.toFixed(4));
    element.style.setProperty("--glow-alpha", clamp(currentGlow, 0, 1).toFixed(4));
    element.style.setProperty("--press", clamp(currentPress, 0, 1).toFixed(4));
    element.style.setProperty("--tx", `${currentTx.toFixed(2)}px`);
  };

  const isSettled = () =>
    Math.abs(currentScale - targetScale) < 0.0005 &&
    Math.abs(velocityScale) < 0.002 &&
    Math.abs(currentGlow - targetGlow) < 0.001 &&
    Math.abs(velocityGlow) < 0.002 &&
    Math.abs(currentPress - targetPress) < 0.001 &&
    Math.abs(velocityPress) < 0.002 &&
    Math.abs(currentTx - targetTx) < 0.05 &&
    Math.abs(velocityTx) < 0.05 &&
    Math.abs(vx) < 0.01 &&
    Math.abs(vy) < 0.01;

  const tick = (now: number) => {
    const rawDt = lastFrameTime ? (now - lastFrameTime) / 1000 : 1 / 60;
    const dt = clamp(rawDt, 0.001, 0.032);
    lastFrameTime = now;

    if (prefersReducedMotion) {
      currentScale = targetScale;
      currentGlow = targetGlow;
      currentPress = targetPress;
      currentTx = targetTx;
      vx = 0;
      vy = 0;
      writeCssVars();
      rafId = null;
      lastFrameTime = 0;
      return;
    }

    [currentScale, velocityScale] = stepSpring(
      currentScale,
      velocityScale,
      targetScale,
      stiffness,
      currentDamping,
      dt,
    );

    [currentGlow, velocityGlow] = stepSpring(
      currentGlow,
      velocityGlow,
      targetGlow,
      stiffness,
      currentDamping,
      dt,
    );

    [currentPress, velocityPress] = stepSpring(
      currentPress,
      velocityPress,
      targetPress,
      stiffness,
      currentDamping,
      dt,
    );

    const prevTx = currentTx;
    [currentTx, velocityTx] = stepSpring(
      currentTx,
      velocityTx,
      targetTx,
      stiffness,
      currentDamping,
      dt,
    );

    // Blend spring translation velocity into horizontal squash & stretch if sliding
    const springVx = ((currentTx - prevTx) / (dt * 1000)) * 0.65;
    if (Math.abs(springVx) > Math.abs(vx)) {
      vx = springVx;
    }

    // Exponentially decay pointer velocity back to rest
    const decay = Math.exp(-14 * dt);
    vx *= decay;
    vy *= decay;

    writeCssVars();

    if (isSettled()) {
      currentScale = targetScale;
      velocityScale = 0;
      currentGlow = targetGlow;
      velocityGlow = 0;
      currentPress = targetPress;
      velocityPress = 0;
      currentTx = targetTx;
      velocityTx = 0;
      vx = 0;
      vy = 0;
      writeCssVars();
      rafId = null;
      lastFrameTime = 0;
      return;
    }

    rafId = window.requestAnimationFrame(tick);
  };

  const ensureLoop = () => {
    if (typeof window === "undefined") return;
    if (rafId === null) {
      lastFrameTime = performance.now();
      rafId = window.requestAnimationFrame(tick);
    }
  };

  const updatePointerCoords = (clientX: number, clientY: number) => {
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const scaleApprox = currentScale > 0.01 ? currentScale : 1;
    const localX = clamp((clientX - rect.left) / scaleApprox, 0, rect.width / scaleApprox);
    const localY = clamp((clientY - rect.top) / scaleApprox, 0, rect.height / scaleApprox);
    const minDim = Math.min(rect.width, rect.height) / scaleApprox;

    element.style.setProperty("--touch-x", `${localX.toFixed(1)}px`);
    element.style.setProperty("--touch-y", `${localY.toFixed(1)}px`);
    element.style.setProperty("--min-dim", `${minDim.toFixed(1)}px`);

    const now = performance.now();
    if (prevX !== null && prevY !== null && prevEventTime > 0) {
      const dtMs = Math.max(now - prevEventTime, 8);
      const rawVx = (localX - prevX) / dtMs;
      const rawVy = (localY - prevY) / dtMs;
      vx = vx * 0.35 + rawVx * 0.65;
      vy = vy * 0.35 + rawVy * 0.65;
    }

    prevX = localX;
    prevY = localY;
    prevEventTime = now;
  };

  const isDelegatedToChild = (target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) return false;
    const closestSurface = target.closest<HTMLElement>("[data-liquid-surface='true']");
    return Boolean(closestSurface && closestSurface !== element && element.contains(closestSurface));
  };

  const activatePress = (clientX?: number, clientY?: number, isTouch = false) => {
    clearReleaseTimer();
    isPressed = true;
    isHovered = true;
    pressStartTime = performance.now();
    if (typeof clientX === "number" && typeof clientY === "number") {
      updatePointerCoords(clientX, clientY);
    }
    currentDamping = activeDampingRatio;
    targetScale = pressedScale;
    targetGlow = pressedGlowAlpha;
    targetPress = 1;
    if (isTouch) {
      // Give mobile touch an immediate spring impulse so quick taps visibly pop
      velocityScale = Math.max(velocityScale, (pressedScale - currentScale) * 10);
      velocityGlow = Math.max(velocityGlow, (pressedGlowAlpha - currentGlow) * 12);
    }
    ensureLoop();
  };

  const performRelease = (keepHover: boolean) => {
    isPressed = false;
    isTouchActive = false;
    currentDamping = releaseDampingRatio;
    if (keepHover) {
      targetScale = hoverScale;
      targetGlow = hoverGlowAlpha;
      targetPress = 0;
    } else {
      isHovered = false;
      targetScale = 1;
      targetGlow = 0;
      targetPress = 0;
      prevX = null;
      prevY = null;
    }
    ensureLoop();
  };

  const scheduleRelease = (keepHover: boolean, isTouch = false) => {
    clearReleaseTimer();
    if (!isTouch) {
      performRelease(keepHover);
      return;
    }
    const elapsed = performance.now() - pressStartTime;
    const remaining = MIN_TOUCH_HOLD_MS - elapsed;
    if (remaining > 16 && typeof window !== "undefined") {
      releaseTimer = window.setTimeout(() => {
        releaseTimer = null;
        performRelease(false);
      }, remaining);
    } else {
      performRelease(false);
    }
  };

  const onPointerEnter = (e: PointerEvent) => {
    if (options.disabled || e.pointerType === "touch") return;
    if (isDelegatedToChild(e.target)) return;
    clearReleaseTimer();
    isHovered = true;
    prevX = null;
    prevY = null;
    prevEventTime = performance.now();
    updatePointerCoords(e.clientX, e.clientY);

    currentDamping = activeDampingRatio;
    if (!isPressed) {
      targetScale = hoverScale;
      targetGlow = hoverGlowAlpha;
      targetPress = 0;
    }
    ensureLoop();
  };

  const onPointerMove = (e: PointerEvent) => {
    if (options.disabled || e.pointerType === "touch") return;
    if (isDelegatedToChild(e.target)) {
      if (isHovered && !isPressed) {
        performRelease(false);
      }
      return;
    }
    isHovered = true;
    updatePointerCoords(e.clientX, e.clientY);

    currentDamping = activeDampingRatio;
    if (isPressed) {
      targetScale = pressedScale;
      targetGlow = pressedGlowAlpha;
      targetPress = 1;
    } else {
      targetScale = hoverScale;
      targetGlow = hoverGlowAlpha;
      targetPress = 0;
    }
    ensureLoop();
  };

  const onPointerDown = (e: PointerEvent) => {
    if (options.disabled || e.pointerType === "touch") return;
    if (isDelegatedToChild(e.target)) return;
    activatePress(e.clientX, e.clientY, false);
  };

  const onPointerUp = (e: PointerEvent) => {
    if (options.disabled || e.pointerType === "touch") return;
    scheduleRelease(e.pointerType === "mouse" && isHovered, false);
  };

  const onPointerLeave = (e: PointerEvent) => {
    if (options.disabled || e.pointerType === "touch" || isTouchActive) return;
    scheduleRelease(false, false);
  };

  // Dedicated mobile Touch handlers (immune to mobile browser pointercancel during finger drag/tap)
  const onTouchStart = (e: TouchEvent) => {
    if (options.disabled) return;
    if (isDelegatedToChild(e.target)) return;
    const touch = e.touches[0];
    if (!touch) return;
    isTouchActive = true;
    prevX = null;
    prevY = null;
    prevEventTime = performance.now();
    activatePress(touch.clientX, touch.clientY, true);
  };

  const onTouchMove = (e: TouchEvent) => {
    if (options.disabled || !isTouchActive) return;
    const touch = e.touches[0];
    if (!touch) return;
    updatePointerCoords(touch.clientX, touch.clientY);
    currentDamping = activeDampingRatio;
    targetScale = pressedScale;
    targetGlow = pressedGlowAlpha;
    targetPress = 1;
    ensureLoop();
  };

  const onTouchEnd = () => {
    if (options.disabled || !isTouchActive) return;
    scheduleRelease(false, true);
  };

  // Initialize CSS variables at rest
  writeCssVars();

  if (bindDomEvents) {
    element.addEventListener("pointerenter", onPointerEnter, { passive: true });
    element.addEventListener("pointermove", onPointerMove, { passive: true });
    element.addEventListener("pointerdown", onPointerDown, { passive: true });
    element.addEventListener("pointerup", onPointerUp, { passive: true });
    element.addEventListener("pointerleave", onPointerLeave, { passive: true });
    element.addEventListener("touchstart", onTouchStart, { passive: true });
    element.addEventListener("touchmove", onTouchMove, { passive: true });
    element.addEventListener("touchend", onTouchEnd, { passive: true });
    element.addEventListener("touchcancel", onTouchEnd, { passive: true });
  }

  return {
    setTargetTx(tx: number, immediate = false) {
      targetTx = tx;
      if (immediate) {
        currentTx = tx;
        velocityTx = 0;
        writeCssVars();
      } else {
        ensureLoop();
      }
    },
    triggerHover(clientX?: number, clientY?: number) {
      clearReleaseTimer();
      isHovered = true;
      if (typeof clientX === "number" && typeof clientY === "number") {
        updatePointerCoords(clientX, clientY);
      }
      currentDamping = activeDampingRatio;
      if (isPressed) {
        targetScale = pressedScale;
        targetGlow = pressedGlowAlpha;
        targetPress = 1;
      } else {
        targetScale = hoverScale;
        targetGlow = hoverGlowAlpha;
        targetPress = 0;
      }
      ensureLoop();
    },
    triggerPress(clientX?: number, clientY?: number) {
      activatePress(clientX, clientY, true);
    },
    triggerRelease(keepHover = false) {
      scheduleRelease(keepHover, !keepHover);
    },
    injectVelocity(newVx: number, newVy = 0) {
      vx = newVx;
      vy = newVy;
      ensureLoop();
    },
    destroy() {
      clearReleaseTimer();
      if (rafId !== null && typeof window !== "undefined") {
        window.cancelAnimationFrame(rafId);
        rafId = null;
      }
      if (bindDomEvents) {
        element.removeEventListener("pointerenter", onPointerEnter);
        element.removeEventListener("pointermove", onPointerMove);
        element.removeEventListener("pointerdown", onPointerDown);
        element.removeEventListener("pointerup", onPointerUp);
        element.removeEventListener("pointerleave", onPointerLeave);
        element.removeEventListener("touchstart", onTouchStart);
        element.removeEventListener("touchmove", onTouchMove);
        element.removeEventListener("touchend", onTouchEnd);
        element.removeEventListener("touchcancel", onTouchEnd);
      }
    },
  };
}

export interface UseLiquidGlassResult<T extends HTMLElement> {
  ref: RefObject<T | null>;
  handlers: {
    onPointerEnter: (event: ReactPointerEvent<T>) => void;
    onPointerMove: (event: ReactPointerEvent<T>) => void;
    onPointerDown: (event: ReactPointerEvent<T>) => void;
    onPointerUp: (event: ReactPointerEvent<T>) => void;
    onPointerLeave: (event: ReactPointerEvent<T>) => void;
    onPointerCancel: (event: ReactPointerEvent<T>) => void;
  };
  surfaceStyle: CSSProperties;
  glowStyle: CSSProperties;
  setTargetTx: (tx: number, immediate?: boolean) => void;
  triggerHover: (clientX?: number, clientY?: number) => void;
  triggerPress: (clientX?: number, clientY?: number) => void;
  triggerRelease: (keepHover?: boolean) => void;
}

/**
 * Custom React hook `useLiquidGlass({ hoverScale = 1.05, pressedScale = 1.12 })`
 * running a real-time spring physics loop (`requestAnimationFrame`, `dampingRatio = 0.55`, `stiffness = 280`)
 * that updates CSS Variables directly on the DOM ref without triggering React re-renders.
 */
export function useLiquidGlass<T extends HTMLElement = HTMLDivElement>(
  options: UseLiquidGlassOptions = {},
): UseLiquidGlassResult<T> {
  const {
    hoverScale = 1.05,
    pressedScale = 1.12,
    stiffness = 280,
    dampingRatio = 0.55,
    releaseDampingRatio = 0.5,
    hoverGlowAlpha = 0.16,
    pressedGlowAlpha = 0.26,
    disabled = false,
  } = options;

  const ref = useRef<T | null>(null);
  const controllerRef = useRef<LiquidGlassController | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const controller = attachLiquidGlassPhysics(
      el,
      {
        hoverScale,
        pressedScale,
        stiffness,
        dampingRatio,
        releaseDampingRatio,
        hoverGlowAlpha,
        pressedGlowAlpha,
        disabled,
      },
      false,
    );
    controllerRef.current = controller;

    return () => {
      controller.destroy();
      controllerRef.current = null;
    };
  }, [
    hoverScale,
    pressedScale,
    stiffness,
    dampingRatio,
    releaseDampingRatio,
    hoverGlowAlpha,
    pressedGlowAlpha,
    disabled,
  ]);

  const setTargetTx = useCallback((tx: number, immediate = false) => {
    controllerRef.current?.setTargetTx(tx, immediate);
  }, []);

  const triggerHover = useCallback((clientX?: number, clientY?: number) => {
    controllerRef.current?.triggerHover(clientX, clientY);
  }, []);

  const triggerPress = useCallback((clientX?: number, clientY?: number) => {
    controllerRef.current?.triggerPress(clientX, clientY);
  }, []);

  const triggerRelease = useCallback((keepHover = false) => {
    controllerRef.current?.triggerRelease(keepHover);
  }, []);

  const onPointerEnter = useCallback((event: ReactPointerEvent<T>) => {
    controllerRef.current?.triggerHover(event.clientX, event.clientY);
  }, []);

  const onPointerMove = useCallback((event: ReactPointerEvent<T>) => {
    controllerRef.current?.triggerHover(event.clientX, event.clientY);
  }, []);

  const onPointerDown = useCallback((event: ReactPointerEvent<T>) => {
    controllerRef.current?.triggerPress(event.clientX, event.clientY);
  }, []);

  const onPointerUp = useCallback((event: ReactPointerEvent<T>) => {
    controllerRef.current?.triggerRelease(event.pointerType === "mouse");
  }, []);

  const onPointerLeave = useCallback(() => {
    controllerRef.current?.triggerRelease(false);
  }, []);

  const onPointerCancel = useCallback(() => {
    controllerRef.current?.triggerRelease(false);
  }, []);

  const handlers = useMemo(
    () => ({
      onPointerEnter,
      onPointerMove,
      onPointerDown,
      onPointerUp,
      onPointerLeave,
      onPointerCancel,
    }),
    [onPointerEnter, onPointerMove, onPointerDown, onPointerUp, onPointerLeave, onPointerCancel],
  );

  const surfaceStyle = useMemo<CSSProperties>(
    () => ({
      transform:
        "translate3d(var(--tx, 0px), 0, 0) scale(var(--scale-x, 1), var(--scale-y, 1))",
      willChange: "transform, backdrop-filter",
    }),
    [],
  );

  const glowStyle = useMemo<CSSProperties>(
    () => ({
      background:
        "radial-gradient(circle calc(var(--min-dim, 64px) * 1.2) at var(--touch-x, 50%) var(--touch-y, 50%), rgba(255, 255, 255, var(--glow-alpha, 0)), transparent 100%)",
      mixBlendMode: "plus-lighter",
    }),
    [],
  );

  return {
    ref,
    handlers,
    surfaceStyle,
    glowStyle,
    setTargetTx,
    triggerHover,
    triggerPress,
    triggerRelease,
  };
}

export default useLiquidGlass;
