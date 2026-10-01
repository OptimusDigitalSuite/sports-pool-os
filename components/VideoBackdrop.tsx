'use client';

import { useReducedMotion } from '@/lib/ui/useReducedMotion';

export type BackdropIntensity = 'full' | 'wash' | 'bright';

/**
 * The stadium behind everything. Three intensities per DESIGN.md §5:
 *
 * - `full`   — landing and standings. Video plays, moderate scrim.
 * - `wash`   — behind the pick list. Heavily blurred and darkened to a stadium
 *              wash so sixteen rows of data stay the brightest thing on screen.
 * - `bright` — the payout screen. Video returns, lighter vignette, for the win.
 *
 * The video filter and the scrim gradient for each intensity live in
 * app/globals.css, keyed off `data-intensity` — see the "Video scrim" rules
 * there, transcribed from DESIGN.md §5 and mixed from `--bg-scrim` (never a
 * hardcoded colour). This component only ever sets that attribute.
 *
 * The poster frame carries first paint and stands in whenever the video is
 * suppressed, so nothing is ever lost but ambience. Footage is royalty-free
 * stock — never broadcast footage, never a logo (see public/backdrop/README.md).
 */
export function VideoBackdrop({ intensity = 'full' }: { intensity?: BackdropIntensity }) {
  const reduced = useReducedMotion();

  return (
    <div
      data-video-bg
      data-intensity={intensity}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      <img
        src="/backdrop/stadium-poster.jpg"
        alt=""
        role="presentation"
        className="backdrop-plate absolute inset-0 h-full w-full object-cover"
      />
      {!reduced && (
        <video
          className="backdrop-plate absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-[var(--duration-cinematic)] ease-[var(--ease-out-standard)] data-[ready=true]:opacity-100"
          poster="/backdrop/stadium-poster.jpg"
          autoPlay
          muted
          loop
          playsInline
          tabIndex={-1}
          // Must load at least enough to play — "none" is what left this
          // video permanently stuck at readyState 0 with nothing to ever
          // trigger onCanPlayThrough below.
          preload="metadata"
          onCanPlayThrough={(event) => {
            // Playback itself is requested by the `autoPlay` attribute —
            // this handler is purely the opacity fade-in cue for once the
            // video is actually ready to be shown over the poster, not a
            // trigger for playback.
            event.currentTarget.dataset.ready = 'true';
          }}
        >
          <source src="/backdrop/stadium.av1.mp4" type="video/mp4; codecs=av01.0.05M.08" />
          <source src="/backdrop/stadium.h264.mp4" type="video/mp4" />
        </video>
      )}
      <div className="backdrop-scrim absolute inset-0" />
    </div>
  );
}
