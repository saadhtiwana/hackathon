# Relay launch video

40 second launch film, built with Remotion. Not part of the app build.

```bash
cd video
npm ci
npm run shots     # captures the live app into public/shots (needs SHOTS_EMAIL and SEED_PASSWORD, see scripts/shoot.mjs)
npm run render    # writes out/relay-launch-2160x2160-v3.mp4, -1080x1080-v3.mp4 and -1920x1080-v3.mp4
node scripts/waveform.mjs out/relay-launch-2160x2160-v3.mp4 out/audio-v3.png   # check the mix
npm run studio    # preview and scrub
```

- Sound: no music bed. `scripts/sounds.mjs` synthesises the interface sounds and three short accents (logo, Paid, closing) into `public/audio`; files with the same names in `public/sfx` take priority. The cue sheet is in `src/Launch.tsx`, and the mix is normalised to about -16 LUFS, under -1 dBTP.
- Screenshots are git-ignored because they show real workspace data. Missing ones render as a neutral placeholder frame.
- Scene timing lives in `src/Launch.tsx`; each scene is one file in `src/scenes`.
