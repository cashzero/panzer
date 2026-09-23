# M10 GMC rendered landmark verification

Fixed cameras; pixels in the 1200 × 1800 OnWar drawing (164 px/m side/front/rear, 160 px/m plan).
Acceptance tolerance: 12 px (73 mm side, 75 mm plan), for game-scale proportions.
"Before" is generator pass 0, the first draft built from the same measurements.

| Landmark | Reference | Before | After | Final error |
|---|---:|---:|---:|---:|
| Side: front fender tip | 191 | 190.06 | 190.06 | 0.94 |
| Side: sponson front | 300 | 294.04 | 294.04 | 5.96 |
| Side: glacis/roof junction | 414.7 | 413.76 | 413.76 | 0.94 |
| Side: hull roof | 335 | 334.95 | 334.95 | 0.05 |
| Side: sloped side lower edge | 417.5 | 417.44 | 417.44 | 0.06 |
| Side: sponson lower edge | 448.5 | 447.78 | 447.78 | 0.72 |
| Side: roof rear corner | 1123 | 1123.06 | 1120.60 | 2.40 |
| Side: hull rear | 1168 | 1168.00 | 1168.00 | 0.00 |
| Side: turret top front corner | 534 | 534.96 | 534.96 | 0.96 |
| Side: turret top | 207.5 | 207.52 | 207.52 | 0.02 |
| Side: turret lower edge | 320.5 | 321.01 | 321.01 | 0.51 |
| Side: counterweight top rear corner | 846 | 846.06 | 846.06 | 0.06 |
| Side: counterweight beak | 897 | 897.07 | 897.07 | 0.07 |
| Side: beak height | 267 | 271.97 | 268.20 | 1.20 |
| Side: gun shield face | 420 | 417.04 | 417.04 | 2.96 |
| Side: gun axis | 269.5 | 269.51 | 269.51 | 0.01 |
| Side: muzzle | 48 | 48.04 | 48.04 | 0.04 |
| Side: sprocket centre X | 265.5 | 265.50 | 265.50 | 0.00 |
| Side: sprocket centre Y | 494 | 495.01 | 495.01 | 1.01 |
| Side: idler centre X | 1078 | 1077.96 | 1077.96 | 0.04 |
| Side: idler centre Y | 506 | 506.00 | 506.00 | 0.00 |
| Side: front bogie | 413.75 | 414.25 | 414.25 | 0.50 |
| Side: middle bogie | 653.75 | 653.86 | 653.86 | 0.11 |
| Side: rear bogie | 893 | 893.46 | 893.46 | 0.46 |
| Side: foremost road wheel | 344 | 344.72 | 344.72 | 0.72 |
| Side: rearmost road wheel | 963.5 | 963.00 | 963.00 | 0.50 |
| Side: road wheel centre height | 565 | 565.04 | 565.04 | 0.04 |
| Side: track front | 202 | 203.55 | 203.55 | 1.55 |
| Side: track rear | 1140 | 1139.79 | 1139.79 | 0.21 |
| Plan: hull outer width | 492 | 488.00 | 488.00 | 4.00 |
| Plan: roof width | 361 | 360.00 | 360.00 | 1.00 |
| Plan: turret maximum width | 368 | 372.80 | 372.80 | 4.80 |
| Plan: turret ring centre | 639.6 | 639.64 | 639.64 | 0.04 |
| Plan: counterweight apex | 877.4 | 876.92 | 876.92 | 0.48 |
| Plan: gun shield face | 400 | 408.60 | 408.60 | 8.60 |
| Plan: gun shield width | 190 | 190.40 | 187.20 | 2.80 |
| Plan: fender front | 185 | 187.16 | 187.16 | 2.16 |
| Plan: roof front edge | 402 | 405.40 | 405.40 | 3.40 |
| Plan: roof rear edge | 1091 | 1097.40 | 1095.00 | 4.00 |
| Plan: hull rear | 1141 | 1141.24 | 1141.24 | 0.24 |
| Plan: muzzle | 50 | 48.60 | 48.60 | 1.40 |
| Front: hull maximum width | 496 | 500.20 | 500.20 | 4.20 |
| Front: track outside span | 413 | 414.76 | 414.76 | 1.76 |
| Front: turret lower width | 381 | 382.12 | 382.12 | 1.12 |
| Front: turret top width | 298 | 303.40 | 299.14 | 1.14 |
| Front: gun shield width | 189 | 195.16 | 191.88 | 2.88 |
| Front: differential housing width | 258 | 257.48 | 257.48 | 0.52 |
| Front: gun axis | 1404 | 1400.51 | 1400.51 | 3.49 |
| Front: roof front edge | 1467 | 1465.95 | 1465.95 | 1.05 |
| Front: sloped side lower edge | 1547 | 1548.44 | 1548.44 | 1.44 |
| Rear: track outside span | 411 | 414.76 | 414.76 | 3.76 |
| Rear: turret top width | 300 | 303.40 | 299.14 | 0.86 |
| Rear: turret lower width | 388 | 382.12 | 382.12 | 5.88 |

53/53 pass. Mean error: 1.78 → 1.57 px. Maximum final error: 8.60 px.

Reported but not accepted (cross-view conflict in the drawing, see README):

| Landmark | Reference | Before | After | Difference |
|---|---:|---:|---:|---:|
| Front: turret top (conflicts with side view) | 1357 | 1338.52 | 1338.52 | 18.48 |
| Rear: turret top (conflicts with side view) | 1364 | 1338.52 | 1338.52 | 25.48 |

Schema, circular 508 mm wheels, wheel/track contact, hull joints, turret clearance, rear fittings
inside the track envelope and muzzle/spawn alignment pass. Armour coverage is checked separately
by `node --import tsx --test --test-isolation=none src/tanks/m10/armor.test.ts`.
