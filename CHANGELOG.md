# Changelog

All notable changes to Neon Dodge are recorded here.

## [1.0.0] - 2026-11-24

First playable release.

### Added

- Canvas game loop with a glowing player orb, motion trail and screen-edge clamping.
- Controls for mouse, keyboard (WASD and arrow keys) and touch (relative drag and an on-screen dash button).
- Dash with a cooldown and brief invincibility.
- Seven hazard types that unlock as levels rise: drifters (level 1), seekers and lasers (level 2), bouncers and bursters (level 3), shock rings (level 4) and walls (level 5). Crossing laser pairs appear from level 7.
- A level-up every 20 seconds, with faster hazards and a banner naming the new threats.
- Graze scoring: passing close to hazards builds a chain, and every 3 grazes raises the multiplier, up to x10. The chain decays when you stop grazing.
- Pickups: shard (bonus points), shield (absorbs one hit), slow-mo (slows hazards) and nova (clears the screen).
- A soundtrack and sound effects synthesized with the Web Audio API. The music gets busier as levels rise.
- Particles, shockwaves, screen shake and glow, with automatic quality reduction on slow devices.
- Main menu with instructions, pause screen, and a game-over screen with stats and a rank.
- Best score and settings (sound, music, screen shake) saved in the browser.
- Responsive layout for desktop and mobile, support for reduced-motion preferences, and auto-pause when the tab loses focus.
- README instructions for playing the game on your own computer.
