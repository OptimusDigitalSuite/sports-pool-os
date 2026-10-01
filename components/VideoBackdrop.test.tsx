import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { VideoBackdrop } from '@/components/VideoBackdrop';

afterEach(cleanup);

function mockMatchMedia(reduced: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduced && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

describe('VideoBackdrop', () => {
  it('renders a poster image immediately so first paint never waits on video', () => {
    mockMatchMedia(false);
    render(<VideoBackdrop intensity="full" />);
    const poster = screen.getByRole('presentation', { hidden: true });
    expect(poster).toBeInTheDocument();
  });

  it('marks itself decorative and hidden from assistive tech', () => {
    mockMatchMedia(false);
    const { container } = render(<VideoBackdrop intensity="full" />);
    expect(container.querySelector('[data-video-bg]')).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders no video element at all under prefers-reduced-motion', () => {
    mockMatchMedia(true);
    const { container } = render(<VideoBackdrop intensity="full" />);
    expect(container.querySelector('video')).toBeNull();
  });

  it('applies the heavier wash treatment behind the pick list', () => {
    mockMatchMedia(false);
    const { container } = render(<VideoBackdrop intensity="wash" />);
    expect(container.querySelector('[data-intensity="wash"]')).toBeInTheDocument();
  });

  it('is always muted, looping, inline, and never a tab stop', () => {
    mockMatchMedia(false);
    const { container } = render(<VideoBackdrop intensity="full" />);
    const video = container.querySelector('video')!;
    expect((video as HTMLVideoElement).muted).toBe(true);
    expect(video).toHaveAttribute('loop');
    expect(video).toHaveAttribute('playsinline');
    expect(video).toHaveAttribute('tabindex', '-1');
  });

  // Regression coverage for a video that could never play at all:
  // `preload="none"` plus no `autoPlay` plus a `.play()` call gated behind
  // `onCanPlayThrough` meant nothing ever initiated the load that event
  // depends on, so `readyState` stayed 0 forever and the poster stood in
  // permanently — invisible today only because the source clips don't exist
  // yet. `autoPlay` is what actually requests playback; preload must not be
  // "none" or nothing ever loads far enough to play.
  it('requests autoplay and does not defer loading past metadata, so it can actually play', () => {
    mockMatchMedia(false);
    const { container } = render(<VideoBackdrop intensity="full" />);
    const video = container.querySelector('video')! as HTMLVideoElement;
    expect(video.autoplay).toBe(true);
    expect(video.getAttribute('preload')).not.toBe('none');
  });
});
