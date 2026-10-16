# The visual system

How lunarasociety.com looks and moves, where each part lives, and the rules that hold it together. `tools/verify-visual.mjs` checks the rules in CI.

## Materials (`lunara-materials.css`)

Every shell and OS page links this file before its own CSS. It holds every token: colour, light, elevation, radius, focus and motion.

| Material | Token prefix | Used for |
|---|---|---|
| Obsidian | `--m-obsidian*` | The ground: near-black, never `#000` |
| Brushed titanium | `--m-titanium*`, `--m-brush` | Hairlines, rails, secondary text |
| Champagne gold | `--m-gold*`, `--m-gold-foil` | The seal, primary actions, focus |
| Smoked glass | `--m-glass*` | Anything that floats: navigation, panels, dialogs |
| Crystal | `--m-crystal*` | A check that has passed, a valid signature |
| Ceramic | `--m-ceramic*` | Paper: documents and certificates |
| Light | `--m-sheen`, `--m-edge` | A specular sheen and an edge light that follow the pointer |

Motion uses three speeds (`--t-fast`, `--t-base`, `--t-slow`), plus `--t-cine` for cinematic moments, and three curves (`--ease-out`, `--ease-in-out`, `--ease-press`). Under reduced motion every duration is zero. The OS palette (`lunara-os.css`) takes its gold, its state colours and its easing from these tokens.

The file also sets these for every page:

- **Focus:** one gold focus ring.
- **Selection:** gold-tinted text selection.
- **Scrollbars:** obsidian scrollbars.
- **Press:** controls press in slightly when clicked.
- **Emblem:** emblem images are always round, so any glow or shadow follows the coin and not its square box.
- **`.m-loading`:** a loading state for real requests only.

## The pointer field (`lunara-field.js`)

One `pointermove` listener with one inertia. Everything that follows the pointer reads from it:

- the environment light;
- the moon's libration;
- the hero planes;
- the instrument rack.

It publishes:

- `--px` and `--py` on `<html>`;
- `LunaraField.on(fn)`;
- `--mx` and `--my` on any element marked `[data-light]`.

A script that loads before the field can queue a subscriber with `(window.__lxField = window.__lxField || []).push(fn)`.

On touch screens and under reduced motion the field stays at rest. The loop runs only while something is still settling.

## The engine (`lunara-engine.js`, loaded by the shell)

- **Environment:** a WebGL backdrop of obsidian and a moonlight key from the upper right that leans with the pointer. Slow smoke shows only where the light falls. It is dithered, so the dark gradients do not band. There are no stars and no particles.
- **Reveal:** panels settle into place and a single sheen crosses each one once. Section labels are drawn on from the left.
- **Material:** panels turn up to 3° toward the pointer, with a specular light and an edge light. A panel inside a parent that already turns in 3D gets the light but not a second turn.
- **Veil:** leaving a page lowers obsidian on a gold hairline, and each page opens on the same veil lifting (`lunara-shell.css`). It shows no text, because arriving on a page is not a security check. The page locks (`lunara-locks.js`) may play instead, and they say they are a scene, not a check.
- **Stamp:** `LunaraFX.stamp` stamps a real verdict. Its ink particles are a reaction to a verdict, not decoration.

## The intro (`index.html`, `lunara-intro.css`, `lunara-intro.js`)

| Stage | Name | What happens |
|---|---|---|
| A | Void | Obsidian, then a point of light |
| B | Signal | The point draws out into a gold line, which folds into a ring |
| C | Artifact | Sparks spiral onto the ring and the official emblem (`/lunara_emblem_512.png`, never redrawn) is forged inside it. It starts dark, then a raking light crosses its relief. Copies behind the face give it an edge. |
| D | Chamber | Blades of light rise either side and recede to a lit doorway. A polished floor reflects the emblem. |
| E | Wordmark | *Lunara Society*, then the line beneath it |
| F | Open | On Enter, a click, or after 3.6 seconds, the chamber parts down the middle. The emblem flies to its place in the navigation. |

The intro's contract:

- **How often:** at most once every twelve hours (`lx-intro-at`).
- **Never for:** crawlers, headless browsers or links to a `#section`.
- **Controls:**
  - `?intro=1` replays it and `?nointro` skips it;
  - Skip and Escape leave at once;
  - focus stays inside the dialog.
- **Reduced motion:** shows the composed scene, still, and fades out.
- **Without WebGL:** the same light is drawn in gradients.
- **Sound:** off unless the visitor has switched it on (`lx-sound = 1`).
- **Status read-out:** none. The old one claimed checks it had not made.

## Rules (enforced by `tools/verify-visual.mjs`)

1. No particles, stars or embers as a background. Particles appear only when something is being made or decided: the intro's forge and opening, the registry's shield swarm, the verdict stamp.
2. Sound is off until the visitor switches it on.
3. No "access granted" on navigation, and no register row lit up as though someone had just queried it.
4. The intro keeps its contract (above).
5. Every shell and OS page links `lunara-materials.css` before its own styles.

## Email (`emails/lunara-letter.mjs`)

Outgoing letters use the same materials, adapted for email:

- **Layout:** an ivory letter on an obsidian frame, edged in champagne gold. It is not white text on black: dark ink on paper reads well in every client, and the frame keeps it recognisably Lunara.
- **Header:** a serif headline on obsidian, plus an optional dated mark such as "2 December 2026 · 47 days".
- **Findings panel:** for real data only, such as a passport result with grade, score and fixes.
- **Button:** a gold call-to-action.
- **Footer:** small print, including why the reader received the email and how to stop further emails.

How it is built:

- Tables for layout, every style inline, and a `bgcolor` under every gradient.
- Web-safe fonts sit behind the brand fonts.
- A 600px column that narrows on phones.
- Images are hosted on lunarasociety.com.
- Every message has a plain-text twin.

Usage:

```
node emails/lunara-letter.mjs spec.json out.html   # writes out.html and out.txt
```

Subjects stay plain ASCII. The August outreach arrived with garbled dashes in every subject line, and a reply address that did not exist.
