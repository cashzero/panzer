# M4A2(76)W rendered landmark verification

Fixed cameras; pixels in the 1200 × 1800 Dyer drawing, 150 px/m in every view.
Acceptance tolerance: 12 px (80 mm), for game-scale proportions.

| Landmark | Reference | Before | After | Final error |
|---|---:|---:|---:|---:|
| Side: track front | 213 | 240.50 | 209.75 | 3.25 |
| Side: front fender tip | 228 | 255.10 | 228.15 | 0.15 |
| Side: glacis at sponson lip | 298 | 293.38 | 297.75 | 0.25 |
| Side: glacis/roof junction | 410 | 413.45 | 406.25 | 3.75 |
| Side: hull roof | 266 | 265.00 | 265.75 | 0.25 |
| Side: side plate lower edge | 373.5 | 400.00 | 377.50 | 4.00 |
| Side: deck rear corner Z | 1085 | 1088.00 | 1088.00 | 3.00 |
| Side: deck rear corner Y | 332 | 328.00 | 331.75 | 0.25 |
| Side: hull rear plate | 1105 | 1098.50 | 1103.00 | 2.00 |
| Side: turret roof | 148 | 162.16 | 144.16 | 3.84 |
| Side: turret lower edge | 253 | 271.06 | 253.06 | 0.06 |
| Side: bustle rear | 877 | 879.50 | 879.50 | 2.50 |
| Side: rotor shield face | 484 | 464.75 | 483.50 | 0.50 |
| Side: gun axis | 212 | 218.92 | 212.05 | 0.05 |
| Side: muzzle | 31 | 55.25 | 30.95 | 0.05 |
| Side: thread protector height | 24 | 15.60 | 22.50 | 1.50 |
| Side: cupola centre | 718 | 723.50 | 723.50 | 5.50 |
| Side: cupola top | 112 | 130.22 | 112.22 | 0.22 |
| Side: sprocket centre Z | 272 | 312.50 | 272.00 | 0.00 |
| Side: sprocket centre Y | 451 | 454.75 | 460.75 | 9.75 |
| Side: idler centre Z | 1034.5 | 1035.50 | 1035.50 | 1.00 |
| Side: idler centre Y | 461 | 466.75 | 466.75 | 5.75 |
| Side: front bogie | 413 | 449.00 | 413.00 | 0.00 |
| Side: middle bogie | 638 | 668.00 | 638.00 | 0.00 |
| Side: rear bogie | 860 | 887.00 | 863.00 | 3.00 |
| Side: foremost road wheel | 345.5 | 387.50 | 350.75 | 5.25 |
| Side: rearmost road wheel | 924.5 | 948.50 | 925.25 | 0.75 |
| Side: road wheel centre height | 515 | 524.80 | 524.20 | 9.20 |
| Top: hull front | 212 | 216.50 | 216.50 | 4.50 |
| Top: upper hull width | 412 | 378.00 | 408.00 | 4.00 |
| Top: turret front | 493.5 | 491.00 | 491.00 | 2.50 |
| Top: bustle rear | 868.5 | 870.50 | 870.50 | 2.00 |
| Top: muzzle | 23 | 46.25 | 21.95 | 1.05 |
| Top: cupola centre Z | 706 | 714.50 | 714.50 | 8.50 |
| Top: cupola centre X | 809 | 944.50 | 815.50 | 6.50 |
| Top: loader hatch Z | 705 | 723.50 | 705.50 | 0.50 |
| Top: loader hatch X | 953 | 812.50 | 947.50 | 5.50 |
| Top: driver hatches Z | 452 | 449.00 | 449.00 | 3.00 |
| Top: co-driver hatch X | 784 | 785.50 | 785.50 | 1.50 |
| Top: driver hatch X | 970 | 974.50 | 974.50 | 4.50 |
| Top: antenna Z | 814 | 795.50 | 813.50 | 0.50 |
| Top: antenna X | 803 | 976.00 | 802.00 | 1.00 |
| Front: track outside span | 395 | 393.15 | 393.15 | 1.85 |
| Front: upper hull width | 408 | 378.00 | 408.00 | 0.00 |
| Front: turret width | 321 | 322.50 | 322.50 | 1.50 |
| Front: turret roof | 1289 | 1304.16 | 1286.16 | 2.84 |
| Front: gun axis | 1354 | 1360.92 | 1354.05 | 0.05 |
| Front: bow MG X | 234 | 404.50 | 227.50 | 6.50 |
| Front: bow MG Y | 1488 | 1485.90 | 1485.90 | 2.10 |
| Front: right headlight X | 169.5 | 152.50 | 172.00 | 2.50 |
| Front: left headlight X | 457 | 479.50 | 460.00 | 3.00 |
| Front: headlight Y | 1479.5 | 1484.25 | 1480.05 | 0.55 |
| Front: rotor shield width | 205 | 198.00 | 204.93 | 0.07 |
| Front: rotor shield height | 87 | 81.00 | 86.99 | 0.01 |
| Rear: upper hull width | 405 | 378.00 | 408.00 | 3.00 |
| Rear: turret roof | 1293.5 | 1305.16 | 1287.16 | 6.34 |

56/56 pass. Mean error: 23.83 → 2.53 px. Maximum final error: 9.75 px.

Reported but not accepted (track drawn thicker than the shared M4 running gear, see README):

| Landmark | Reference | Before | After | Difference |
|---|---:|---:|---:|---:|
| Side: track top run | 390 | 391.00 | 403.00 | 13.00 |

Schema, circular 508 mm wheels, wheel/track contact, hull joint, turret seating, right-side crew
fittings, muzzle/spawn alignment and unchanged gameplay values pass. Armour coverage is checked by
`node --import tsx --test --test-isolation=none src/tanks/sherman_a2_76/armor.test.ts`.
