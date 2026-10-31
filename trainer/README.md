# Soccer Trainer

A handheld companion for the soccer game. Huxley picks a player in the game, sends him to
the trainer, and makes him better two ways:

- **Mini games on the device.** Penalties, Tilt Dribble, Keepy-Uppy and Tackle Time.
- **Real life.** The trainer counts steps and running time in a pocket, and Huxley logs
  real practice sessions and the drills from a weekly plan.

Back in the game, **Sync** brings the player home with every point he earned.

Everything on the device is made up: no real clubs, players or brands.

## What you need

- An **M5Stack CoreS3** (ESP32-S3, 2" touch screen, built-in battery and motion sensor).
  This is the device in the photo.
- A USB-C cable that carries data, not just charge.
- A computer with **Chrome** or **Edge** for the web installer (or VS Code with PlatformIO
  if you want to change the code).
- Home Wi-Fi that both the trainer and the game computer use. 2.4 GHz is needed; most home
  routers provide it.

## Putting the firmware on the CoreS3

You only need to do this once, and again whenever the trainer code changes.

### Easiest: the web installer (Chrome or Edge)

1. Open the game's website and add `/flasher/` to the address
   (for example `https://your-domain/flasher/`), in **Chrome** or **Edge** on a Mac or PC.
   Safari and iPads can't talk to USB devices.
2. Plug the CoreS3 in with a USB-C cable that carries data.
3. Click **INSTALL**, pick the CoreS3 from the list, and wait about a minute.
4. Tick **Erase** only on the very first install. When updating, leave it unticked so the
   player, training history and Wi-Fi settings stay on the trainer.

If the CoreS3 doesn't show up, hold its **reset button** (the small one on the side) for
about 3 seconds until the green light comes on, then click INSTALL again.

The installer files live in `public/flasher/` in the game. After changing the firmware,
rebuild them with `trainer/firmware/tools/build-web-installer.sh` (needs git, curl and
python3; it fetches the ESP32 toolchain from GitHub), commit, and redeploy the game.

### With VS Code and PlatformIO (for working on the code)

1. Install **VS Code** from <https://code.visualstudio.com>.
2. In VS Code open **Extensions** (the four-squares icon), search for **PlatformIO IDE** and
   install it. Wait for it to finish setting up (the first time takes a few minutes).
3. **File > Open Folder...** and choose `trainer/firmware` inside this project.
   PlatformIO notices `platformio.ini` and downloads the ESP32 tools and libraries. The
   first time this takes 5 to 10 minutes.
4. Plug the CoreS3 into the computer with the USB-C cable.
5. Click the **arrow (Upload)** in the blue status bar at the bottom of VS Code, or press
   `Ctrl+Alt+U` (`Cmd+Alt+U` on a Mac). PlatformIO builds the firmware and copies it over.
6. The trainer restarts and shows **"No player yet"**.

If the upload can't find the device, use the reset-button trick above.

From a terminal the same steps are `cd trainer/firmware && pio run -t upload`.

## First-time Wi-Fi setup

1. On the trainer tap **LINK** (or **MORE > WI-FI SETUP**).
2. It says *No Wi-Fi saved yet*. Tap **SET UP WI-FI**.
3. On a phone, join the Wi-Fi network **Soccer-Trainer**, or scan the QR code on the
   trainer. A setup page should open by itself. If it doesn't, browse to `192.168.4.1`.
4. Pick your home network, type the password, and optionally the coach's name, then tap
   **Save and connect**. Switch the phone back to your home Wi-Fi.
5. The trainer joins the network and shows **Linked!**

If it can't join (wrong password, too far from the router) it says so and offers
**TRY AGAIN**, **SET UP** and **FORGET WI-FI**.

To save battery, Wi-Fi is only on while the **LINK** screen is open. It switches off after
10 minutes without any requests.

## Sending a player and syncing him back

The game and the trainer must be on the same Wi-Fi.

1. On the trainer tap **LINK** and wait for **Linked!**
2. In the game, open the **Trainer** menu and press **SEND** next to a player.
   The browser jumps to the trainer's page, the player appears on the trainer, and after a
   few seconds the browser goes back to the game.
3. When a *different* player is already training, the trainer asks **"Swap?"**. Tap **YES**
   to swap. The old player's progress is kept on the trainer, so if he's sent again later
   he carries on where he left off.
4. To bring training back, open **LINK** on the trainer, then press **Sync** in the game's
   Trainer menu. The game gets the player's earned points.

The game reaches the trainer at `http://soccer-trainer.local`. If that name doesn't work
on your network (common on some Windows PCs and Android phones), type the IP address shown
on the trainer's LINK screen into the Trainer menu's address box instead.

The game sends the computer's clock along with the player, which is how the trainer learns
the date (for daily step counts, streaks and the plan). Opening the parent dashboard also
sets it.

## How training works

All the numbers below are in `firmware/src/core/rules.cpp` (top of the file), so they are
easy to change.

**Stats.** Each player has PAC, SHO, PAS and DEF. Every point costs XP, and higher stats
cost more: `40 + 3 x (stat - 40)` XP. A 60 needs 100 XP for the next point, a 90 needs 190.
Overall (OVR) follows from the stats, weighted by position (forwards gain most from SHO and
PAC, defenders from DEF).

**Moving (PAC).**
- 1 XP per 200 steps, up to 25,000 steps a day.
- 3 XP per minute of running, up to 90 minutes a day.

**Logged training.** Tap **LOG**, choose what you did and for how long. Per 10 minutes:

| Activity      | XP                   |
|---------------|----------------------|
| Shooting      | 30 SHO               |
| Passing       | 30 PAS               |
| Dribbling     | 15 PAC + 15 PAS      |
| Defending     | 30 DEF               |
| Fitness       | 30 PAC               |
| Goalkeeping   | 25 DEF + 5 PAS       |
| Team practice | 8 of each            |
| Match         | 10 of each           |

Up to 180 logged minutes a day earn XP.

**The plan.** **PLAN** shows today's drills from the weekly program. Tapping **I DID IT**
logs the drill with **+50% XP**. The default plan suits the player's position (rest on
Wednesday and Sunday, match on Saturday). Parents can change it from the dashboard.

**Mini games.** Each game costs **1 energy** and gives 5 to 30 XP to its stat, depending
on the score:

| Game         | Stat | How to play                                                  |
|--------------|------|--------------------------------------------------------------|
| Penalties    | SHO  | Tap to aim, tap for power. Corners in the green zone beat the keeper. |
| Tilt Dribble | PAC  | Tilt left and right to weave past defenders and through cone gates.  |
| Keepy-Uppy   | PAS  | Tap the ball as it drops; tap its side to steer it.          |
| Tackle Time  | DEF  | Tap attackers before they reach the box.                     |

If tilting feels backwards, turn on **MORE > TILT: FLIPPED**.

**Energy** (max 10) is what links screen time to real activity:
- Every morning it tops up to at least 3.
- +1 per 1,500 steps (up to +6 a day).
- +2 for every logged session.

**Streaks.** A day counts if Huxley walks 5,000 steps or logs any training. Each day in a
row adds +5% XP to everything, up to +25%.

## Screens

- **Home:** the player, his stats and progress bars, steps today, energy. Tap the player
  to make him celebrate.
- **PLAY:** the four mini games.
- **LOG:** record real training.
- **PLAN:** today's drills and the week.
- **MORE:** Stats (7-day steps chart and a live sensor readout), LINK, Wi-Fi setup, sound,
  brightness and tilt direction.

The screen dims after 30 seconds and switches off after a minute. Steps still count while
it's off. Wake it with a short press of the **power button** or by holding a finger on the
screen. A short press while it's on switches the screen off. Holding the power button for
6 seconds turns the whole device off, and then nothing is counted.

## Parent dashboard

While the trainer shows **Linked!**, open `http://soccer-trainer.local` (or scan the QR
code on the trainer) on any phone or computer on the same Wi-Fi. It shows:

- the current player, his stats and what he has earned since arriving,
- the last two weeks: steps, running, training minutes, games and XP,
- the **weekly plan** editor (up to three drills a day), with *Use default plan* to reset,
- the coach's name and sound settings.

## Running the tests

The rules, step counter and mini games are plain C++ and run on any computer:

```bash
make -C trainer/firmware/test                 # rules, step detector, mini games
make -C trainer/firmware/test service \
  ARDUINOJSON=trainer/firmware/.pio/libdeps/cores3/ArduinoJson/src   # JSON + player hand-off
make -C trainer/firmware/test syntax \
  LIBS=trainer/firmware/.pio/libdeps/cores3   # compile-only check of all device code
```

`service` and `syntax` use the libraries PlatformIO downloads on the first build (step 3
above).

## Known limitations

- **Compiled, but not yet run on a CoreS3.** The firmware builds cleanly for the CoreS3 with
  the ESP32 Arduino core 2.0.17 (about 17% of the app space), but nobody has watched it run
  on the device yet. If the screen stays blank or it restarts in a loop, plug it in, open the
  serial monitor (PlatformIO's plug icon, 115200 baud) and send the output.
- **The step and running thresholds were tuned on simulated data.** Use **MORE > STATS** and
  watch the sensor readout while Huxley walks and jogs with the trainer in a pocket. If
  running shows as walking (or the reverse), adjust `RUN_CADENCE` / `RUN_INTENSITY` in
  `firmware/src/core/steps.cpp`.
- **Tilt direction** couldn't be checked without the hardware. The **TILT** setting flips it.
- **Battery life** with step counting and the screen mostly off hasn't been measured.
- `soccer-trainer.local` relies on mDNS. Use the IP address if your network doesn't support it.
