# Backdrop assets

Royalty-free stock football footage only — Pexels, Coverr, or Mixkit under a
CC0-equivalent licence. Never NFL broadcast footage. No team logos, wordmarks,
or league branding anywhere in frame.

Required files:
- `stadium-poster.jpg` — first frame, aggressively compressed. Carries first paint.
- `stadium.av1.mp4` — the loop, AV1.
- `stadium.h264.mp4` — the same loop, H.264 fallback.

Budget: the loop must total under 2 MB. Prefer a short loop (6–10s) at a low
frame rate over a long one — it sits under a heavy scrim and nobody watches it.

Derive the palette from the actual frames once chosen, and re-check every text
layer against the scrim for AA contrast.

## What is actually in here (2026-09-03)

Source: Pexels video 8266312, "Back view of American football players" —
https://www.pexels.com/video/back-view-of-a-american-football-players-8266312/
Pexels licence: free for commercial use, no attribution required.

Two players from behind, shallow depth of field, field falling away behind
them. Chosen over every aerial candidate for one reason: **end zones are
painted with team names.** Every overhead shot of a real American football
field carries a wordmark — the two strongest candidates read COWBOYS and
PANTHERS, and cropping did not save them (the Cowboys star sits at midfield).
A field-level shot has no lettering to remove. The only mark in frame is a
`RAWLINGS` chinstrap, a manufacturer's mark rather than a team or league one,
illegible under the scrim.

Encoded 1280x720 @ 24fps, 7.0s, with the tail crossfaded 0.5s back over the
head so the `loop` attribute has no visible cut. Sizes: AV1 308 KB,
H.264 476 KB, poster 32 KB — a viewer downloads the poster plus one video,
so worst case is ~508 KB against the 2 MB budget.

Regenerate with the ffmpeg filter chain recorded in the commit that added
these files.
