# The moon on the homepage

Two maps, both from NASA's CGI Moon Kit (Scientific Visualization Studio,
visualization id 4720), which is in the public domain:

| File | Source | What it is |
|---|---|---|
| `lroc-color-2k.jpg` | `lroc_color_poles_2k.tif` | Lunar Reconnaissance Orbiter Camera colour mosaic, 2048 × 1024, equirectangular, longitude 0 at the centre |
| `lola-height-1k.jpg` | `ldem_3_8bit.jpg` | Lunar Orbiter Laser Altimeter elevation, 8-bit, used only to light the relief along the terminator |

Credit: NASA's Scientific Visualization Studio; LRO LROC WAC colour
mosaic (NASA/GSFC/Arizona State University); LOLA elevation (NASA/GSFC).

Nothing about the drawing is illustrative. `lunara-moon.js` lights the
sphere from the phase angle computed by `LunaraPhase` in
`lunara-shell.js`, at the moment the page is read, the same rule every
date on this site follows.
