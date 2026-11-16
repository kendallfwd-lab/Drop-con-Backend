import { useCallback, useEffect, useRef, useState } from 'react';

const initialState = { direction: 'none', isVisible: true };

export default function useScrollDirection({
  disabled = false,
  hideThreshold = 14,
  showThreshold = 5,
  topOffset = 12,
} = {}) {
  const [state, setState] = useState(initialState);
  const lastScrollY = useRef(0);
  const accumulatedDistance = useRef(0);
  const lastDirection = useRef('none');
  const frameId = useRef(null);

  const show = useCallback(() => {
    accumulatedDistance.current = 0;
    lastDirection.current = 'up';
    setState((current) => current.isVisible && current.direction === 'up'
      ? current
      : { direction: 'up', isVisible: true });
  }, []);

  useEffect(() => {
    lastScrollY.current = Math.max(window.scrollY || 0, 0);
    accumulatedDistance.current = 0;

    if (disabled) {
      show();
      return undefined;
    }

    const updateDirection = () => {
      frameId.current = null;
      const currentScrollY = Math.max(window.scrollY || 0, 0);
      const delta = currentScrollY - lastScrollY.current;
      lastScrollY.current = currentScrollY;

      if (currentScrollY <= topOffset) {
        show();
        return;
      }

      if (Math.abs(delta) < 1) return;

      const nextDirection = delta > 0 ? 'down' : 'up';
      if (nextDirection !== lastDirection.current) {
        lastDirection.current = nextDirection;
        accumulatedDistance.current = 0;
      }

      accumulatedDistance.current += Math.abs(delta);
      const threshold = nextDirection === 'down' ? hideThreshold : showThreshold;
      if (accumulatedDistance.current < threshold) return;

      accumulatedDistance.current = 0;
      setState((current) => {
        const isVisible = nextDirection === 'up';
        return current.direction === nextDirection && current.isVisible === isVisible
          ? current
          : { direction: nextDirection, isVisible };
      });
    };

    const onScroll = () => {
      if (frameId.current !== null) return;
      frameId.current = window.requestAnimationFrame(updateDirection);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frameId.current !== null) window.cancelAnimationFrame(frameId.current);
      frameId.current = null;
    };
  }, [disabled, hideThreshold, show, showThreshold, topOffset]);

  return { ...state, show };
}
