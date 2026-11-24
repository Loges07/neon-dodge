# neon-dodge

A neon arcade reaction game built with HTML, CSS, and JavaScript.

Survive the grid. Graze the danger. Chase the multiplier.

## Play

No build step and no dependencies. Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
```

Then visit <http://localhost:8000>. It also works as-is on GitHub Pages.

## Controls

| Action | Desktop | Touch |
| --- | --- | --- |
| Move | Mouse, WASD or arrow keys | Drag anywhere (relative, like a trackpad) |
| Dash (brief invincibility) | Click, Space or Shift | DASH button, double-tap, or a second finger |
| Pause | P or Esc | Pause button |
| Toggle music | M | Pause menu |

## How it works

- **Survive**: points tick up every second, scaled by your multiplier.
- **Graze**: pass close to a hazard without touching it. Every 3 grazes in a row raises your multiplier, up to x10. If you stop grazing, the chain decays.
- **Levels**: every 20 seconds the level rises, hazards speed up, and new hazard types appear.

### Hazards

| Hazard | Unlocks | Behaviour |
| --- | --- | --- |
| Drifter | Level 1 | Squares and triangles flying straight across the screen |
| Seeker | Level 2 | Homing arrow that turns toward you, then burns out |
| Laser | Level 2 | Flashes a warning line, then fires a beam. Crossing pairs from level 7 |
| Bouncer | Level 3 | Hexagon that ricochets off the walls 3 times |
| Burster | Level 3 | Slow orb with a fuse that explodes into a ring of shrapnel |
| Shock ring | Level 4 | Expanding ring. Slip through the gap or dash through it |
| Wall | Level 5 | A line of dots sweeping across the screen with one opening |

### Pickups

| Pickup | Effect |
| --- | --- |
| Shard (green) | Bonus points × multiplier |
| Shield (cyan) | Absorbs one hit and blasts away nearby hazards |
| Slow-mo (purple) | Slows every hazard for about 5 seconds |
| Nova (yellow) | Destroys everything on screen for points |

## Features

- Procedural synthwave soundtrack and sound effects, all synthesized with the Web Audio API (no audio files). The music gets busier as levels rise.
- Particles, shockwaves, screen shake and glow, with automatic quality reduction on slow devices.
- Best score and settings (sound, music, screen shake) saved in `localStorage`.
- Responsive for desktop and mobile, including safe-area insets for notched phones.
- Respects `prefers-reduced-motion` (screen shake is off by default).
- Pauses automatically when the tab loses focus.

## Project structure

```
index.html      Page shell: canvas, HUD, menu, pause and game-over screens
css/style.css   Neon styling for the HUD and overlays
js/sound.js     Web Audio synth: sound effects and the music sequencer
js/game.js      Game engine: loop, input, player, hazards, pickups, scoring, rendering
```

## License

MIT
