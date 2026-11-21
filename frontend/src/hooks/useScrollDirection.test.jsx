import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useScrollDirection from './useScrollDirection.js';

function ScrollState({ disabled = false }) {
  const { direction, isVisible } = useScrollDirection({ disabled });
  return <output>{`${direction}:${isVisible ? 'visible' : 'hidden'}`}</output>;
}

describe('useScrollDirection', () => {
  let animationFrame;

  beforeEach(() => {
    Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value: 0 });
    animationFrame = null;
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback) => {
      animationFrame = callback;
      return 1;
    }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  const scrollTo = (position) => {
    act(() => {
      window.scrollY = position;
      window.dispatchEvent(new Event('scroll'));
      const callback = animationFrame;
      animationFrame = null;
      callback?.();
    });
  };

  const touchAt = (type, clientY) => {
    act(() => {
      const event = new Event(type);
      Object.defineProperty(event, 'touches', {
        value: type === 'touchend' ? [] : [{ clientY }],
      });
      window.dispatchEvent(event);
    });
  };

  it('hides while scrolling down and returns after a short upward movement', () => {
    render(<ScrollState />);
    expect(screen.getByText('none:visible')).toBeInTheDocument();

    scrollTo(20);
    expect(screen.getByText('down:hidden')).toBeInTheDocument();

    scrollTo(16);
    expect(screen.getByText('down:hidden')).toBeInTheDocument();
    scrollTo(14);
    expect(screen.getByText('up:visible')).toBeInTheDocument();
  });

  it('stays visible at the top and while interactions lock it', () => {
    const { rerender } = render(<ScrollState />);
    scrollTo(30);
    expect(screen.getByText('down:hidden')).toBeInTheDocument();

    rerender(<ScrollState disabled />);
    expect(screen.getByText('up:visible')).toBeInTheDocument();

    rerender(<ScrollState />);
    scrollTo(0);
    expect(screen.getByText('up:visible')).toBeInTheDocument();
  });

  it('reacts immediately to mobile touch gestures', () => {
    render(<ScrollState />);
    window.scrollY = 120;

    touchAt('touchstart', 240);
    touchAt('touchmove', 220);
    expect(screen.getByText('down:hidden')).toBeInTheDocument();

    touchAt('touchstart', 220);
    touchAt('touchmove', 226);
    expect(screen.getByText('up:visible')).toBeInTheDocument();
    touchAt('touchend');
  });
});
