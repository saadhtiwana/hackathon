# Relay launch video

40 second launch film, built with Remotion. Not part of the app build.

```bash
cd video
npm ci
npm run shots     # captures the live app into public/shots (needs SHOTS_EMAIL and SEED_PASSWORD, see scripts/shoot.mjs)
npm run render    # writes out/relay-launch-1920x1080.mp4 and out/relay-launch-1080x1080.mp4
npm run studio    # preview and scrub
```

- Music: drop a track at `public/music.mp3` and it is mixed in with a fade in and out. Without it the render is silent.
- Screenshots are git-ignored because they show real workspace data. Missing ones render as a neutral placeholder frame.
- Scene timing lives in `src/Launch.tsx`; each scene is one file in `src/scenes`.
