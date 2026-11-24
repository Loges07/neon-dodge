# neon-dodge

A neon arcade reaction game built with HTML, CSS, and JavaScript.

Survive the grid. Graze the danger. Chase the multiplier.

## Play on your computer

The game is a set of files that runs in your web browser. There is nothing to install and no build step.

### Option 1: Download a ZIP (no Git needed)

1. On the repository page on GitHub, click the green **Code** button, then **Download ZIP**.
2. Unzip the file.
3. Double-click `index.html` in the unzipped folder. It opens in your browser, ready to play.

### Option 2: Use Git

Download the repository:

```bash
git clone https://github.com/Loges07/neon-dodge.git
```

Go into the folder:

```bash
cd neon-dodge
```

Open the game on macOS:

```bash
open index.html
```

Or on Windows:

```bash
start index.html
```

On Linux, run `xdg-open index.html`. Double-clicking `index.html` in your file browser also works.

### Option 3: Run a local web server (optional)

```bash
python3 -m http.server 8000
```

Then visit <http://localhost:8000>. The game also works as-is on GitHub Pages.

The game loads the Orbitron font from Google Fonts. Without an internet connection it falls back to a system font and plays the same.

### Quick start

1. Click **PLAY**, or press Space or Enter.
2. Move with the mouse, WASD or the arrow keys.
3. Dash with a click, Space or Shift. You are briefly untouchable while dashing.
4. Pass close to hazards without touching them to build your multiplier, and grab the glowing pickups.
5. Press P or Esc to pause, and M to turn the music on or off.

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
