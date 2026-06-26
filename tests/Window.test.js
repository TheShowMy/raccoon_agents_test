// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/svelte';
import Window from '../src/lib/macos/Window.svelte';
import * as windowsStore from '../src/lib/stores/windows.js';

/* ===================================================================
   Window — accessibility & interaction
   =================================================================== */
const baseWin = {
  id: 'win-test-1',
  appId: 'unknown',
  title: 'Test Window',
  x: 10,
  y: 20,
  width: 400,
  height: 300,
  zIndex: 100,
  minimized: false,
  maximized: false,
};

describe('Window — accessibility', () => {
  it('renders resize handles as semantic buttons with aria-labels', () => {
    const { container } = render(Window, { props: { win: baseWin } });
    const handles = container.querySelectorAll('.window__resize-handle');
    expect(handles.length).toBe(3);
    handles.forEach((handle) => {
      expect(handle.tagName).toBe('BUTTON');
      expect(handle.getAttribute('type')).toBe('button');
      expect(handle.getAttribute('aria-label')).toBeTruthy();
    });
  });

  it('renders title bar as keyboard-focusable button', () => {
    const { container } = render(Window, { props: { win: baseWin } });
    const titlebar = container.querySelector('.window__titlebar');
    expect(titlebar.getAttribute('role')).toBe('button');
    expect(titlebar.getAttribute('tabindex')).toBe('0');
    expect(titlebar.getAttribute('aria-label')).toBeTruthy();
  });

  it('applies minimized class and preserves resize handles for assistive tech', () => {
    const { container } = render(Window, {
      props: { win: { ...baseWin, minimized: true } },
    });
    const winEl = container.querySelector('.window');
    expect(winEl.classList.contains('window--minimized')).toBe(true);
    const handles = container.querySelectorAll('.window__resize-handle');
    expect(handles.length).toBe(3);
    handles.forEach((handle) => {
      expect(handle.tagName).toBe('BUTTON');
    });
  });
});

describe('Window — keyboard interaction', () => {
  let moveSpy;
  let resizeSpy;

  beforeEach(() => {
    moveSpy = vi.spyOn(windowsStore, 'moveWindow');
    resizeSpy = vi.spyOn(windowsStore, 'resizeWindow');
  });

  afterEach(() => {
    moveSpy.mockRestore();
    resizeSpy.mockRestore();
  });

  it('moves window when arrow keys are pressed on title bar', async () => {
    const { container } = render(Window, { props: { win: baseWin } });
    const titlebar = container.querySelector('.window__titlebar');

    titlebar.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(moveSpy).toHaveBeenCalledWith(baseWin.id, baseWin.x + 20, baseWin.y);

    titlebar.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(moveSpy).toHaveBeenCalledWith(baseWin.id, baseWin.x, baseWin.y + 20);
  });

  it('resizes window when arrow keys are pressed on resize handle', async () => {
    const { container } = render(Window, { props: { win: baseWin } });
    const handle = container.querySelector('.window__resize-handle--corner');

    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(resizeSpy).toHaveBeenCalledWith(baseWin.id, baseWin.width + 20, baseWin.height);

    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(resizeSpy).toHaveBeenCalledWith(baseWin.id, baseWin.width, baseWin.height - 20);
  });

  it('does not move or resize when window is minimized', async () => {
    const { container } = render(Window, {
      props: { win: { ...baseWin, minimized: true } },
    });
    const titlebar = container.querySelector('.window__titlebar');
    const handle = container.querySelector('.window__resize-handle');

    titlebar.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

    expect(moveSpy).not.toHaveBeenCalled();
    expect(resizeSpy).not.toHaveBeenCalled();
  });
});
