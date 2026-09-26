# StuG III Ausf. G rendered landmark verification

Fixed cameras; pixels in the 1200 × 2100 OnWar scan of the Doyle drawing (152 px/m side views, 156.4 plan, 155 front/rear).
Acceptance tolerance: 12 px (79 mm side), for game-scale proportions.
"Before" is generator pass 0, the first draft built from the same measurements.

| Landmark | Reference | Before | After | Final error |
|---|---:|---:|---:|---:|
| Side: muzzle | 86 | 86.07 | 86.07 | 0.07 |
| Side: gun axis | 294 | 294.02 | 294.02 | 0.02 |
| Side: Saukopf front | 355 | 354.96 | 354.96 | 0.04 |
| Side: Saukopf top | 237 | 237.02 | 237.02 | 0.02 |
| Side: casemate roof | 226 | 225.92 | 225.92 | 0.08 |
| Side: roof front edge | 505 | 504.98 | 504.98 | 0.02 |
| Side: roof rear edge | 797 | 796.98 | 796.98 | 0.02 |
| Side: driver plate top | 462 | 461.97 | 461.97 | 0.03 |
| Side: hull top (fender line) | 330 | 330.04 | 330.04 | 0.04 |
| Side: hull rear | 1100 | 1099.76 | 1099.76 | 0.24 |
| Side: engine deck | 272 | 274.56 | 274.56 | 2.56 |
| Side: sprocket centre X | 357.5 | 357.54 | 357.54 | 0.04 |
| Side: sprocket centre Y | 425 | 425.04 | 425.04 | 0.04 |
| Side: idler centre X | 1020 | 1019.96 | 1019.96 | 0.04 |
| Side: idler centre Y | 413 | 413.03 | 413.03 | 0.03 |
| Side: first road wheel | 480 | 480.06 | 480.06 | 0.06 |
| Side: fourth road wheel | 745 | 744.99 | 744.99 | 0.01 |
| Side: last road wheel | 922 | 922.07 | 922.07 | 0.07 |
| Side: road wheel centre height | 483 | 482.95 | 482.95 | 0.05 |
| Side: road wheel top | 444 | 443.89 | 443.89 | 0.11 |
| Side: middle return roller | 695 | 694.98 | 694.98 | 0.02 |
| Side: track front | 276 | 277.03 | 277.03 | 1.03 |
| Side: track top over the middle return roller | 352 | 351.32 | 351.32 | 0.68 |
| Skirts: front edge | 402 | 402.75 | 402.75 | 0.75 |
| Skirts: first joint | 556 | 555.20 | 555.20 | 0.80 |
| Skirts: second joint | 710.5 | 710.24 | 710.24 | 0.26 |
| Skirts: rear edge | 1020 | 1019.26 | 1019.26 | 0.74 |
| Skirts: top | 679 | 679.01 | 679.01 | 0.01 |
| Skirts: bottom | 874 | 874.02 | 874.02 | 0.02 |
| Plan: muzzle | 72 | 72.00 | 72.00 | 0.00 |
| Plan: gun axis (offset right) | 1288 | 1289.83 | 1289.83 | 1.83 |
| Plan: fender front | 293 | 292.79 | 292.79 | 0.21 |
| Plan: cupola centre Z | 730 | 729.98 | 729.98 | 0.02 |
| Plan: cupola centre X | 1405 | 1404.47 | 1404.47 | 0.53 |
| Plan: skirt outer width | 525 | 489.22 | 520.50 | 4.50 |
| Front: skirt outer width (splayed top) | 512 | 484.84 | 515.84 | 3.84 |
| Front: track outside span | 457.5 | 455.70 | 455.70 | 1.80 |
| Front: track width | 65 | 62.00 | 62.00 | 3.00 |
| Front: roof width | 295 | 296.05 | 296.05 | 1.05 |
| Front: roof height | 1700 | 1699.30 | 1699.30 | 0.70 |
| Front: lower hull width | 295 | 294.50 | 294.50 | 0.50 |
| Front: belly | 1956 | 1956.60 | 1956.60 | 0.60 |
| Front: gun bore X | 338.5 | 338.49 | 338.49 | 0.01 |
| Front: gun bore Y | 1769 | 1768.74 | 1768.74 | 0.26 |
| Front: Saukopf width | 95 | 94.55 | 94.55 | 0.45 |
| Rear: track outside span | 455 | 455.70 | 455.70 | 0.70 |
| Rear: lower hull width | 298 | 294.50 | 294.50 | 3.50 |
| Rear: belly | 1958 | 1957.10 | 1957.10 | 0.90 |

48/48 pass. Mean error: 1.81 → 0.67 px. Maximum final error: 4.50 px.

Reported but not accepted (cross-view conflict in the drawing, see README):

| Landmark | Reference | Before | After | Difference |
|---|---:|---:|---:|---:|


Schema, circular 514 mm wheels, wheel/track contact on the road wheels and return rollers, track
under the fenders, muzzle/spawn alignment and the traverse cradle inside the casemate pass. Armour coverage is
checked separately by `node --import tsx --test src/tanks/stug3g/armor.test.ts`.
