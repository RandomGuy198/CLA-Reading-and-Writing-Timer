# Reading Timer

A single-page countdown timer with custom milestone alerts, built for IELTS/ exam
reading practice. No build step, no dependencies — plain HTML, CSS, and JavaScript.

## Features

- **Accurate countdown** — based on clock time, not tick counting, so a throttled
  background tab cannot make it drift. Pauses and resumes exactly where you left off.
- **Custom milestones** — add any "time remaining" alerts you want, e.g. `05:00`,
  `01:00`. Milestones never stop the timer — it keeps running to `00:00`.
- **Two practice presets** — `20m` and `30m` (typical IELTS Reading lengths).
  Tapping either loads that duration with the standard `05:00` and `01:00`
  milestone alerts ready; edit them afterwards if you need others.
- **Loud chime + spoken alerts** — each alert plays a loud two-tone chime, then a
  spoken English phrase ("5 minutes left", "1 minute left", "Time's up") generated
  with Microsoft Edge TTS, Turkish male voice `tr-TR-AhmetNeural`. Bundled MP3s
  next to `index.html` — `m1`–`m60`, `s1`–`s59`, `timeout` — so no server or API
  is needed.
  Milestones at odd values without a clip fall back to chime + banner.
- **Desktop notifications** — click **Enable desktop alerts** once; the browser then
  shows a system notification for every alert too.
- **Screen stays on** — while the timer runs, the Wake Lock API keeps a phone
  display awake (Chrome, Edge, Firefox 126+, Safari 16.4+; HTTPS sites like the
  one below). The lock releases on pause, reset, or time-out, and re-acquires
  when you return to the tab. Older browsers just sleep normally — the countdown
  stays exact either way.
- **Hanoi time** — the clock and the "Ends at" time always display in
  `Asia/Ho_Chi_Minh (GMT+7)`, no matter which timezone your device is set to.
- **Simple, responsive UI** — works in Chrome and Firefox on desktop and mobile,
  with light and dark mode support.
- **Remembers your settings** — duration and milestones are saved in the browser.

## Run it locally

Open `index.html` in any browser — double-clicking the file works.

Or serve the folder:

```bash
python -m http.server 8000
# then visit http://localhost:8000
```

## Deploy to GitHub Pages

1. Upload every app file to the repository root — `index.html`, `style.css`,
   `app.js`, `README.md`, and all MP3 clips (`m1`–`m60.mp3`, `s1`–`s59.mp3`,
   `timeout.mp3`). GitHub's web uploader accepts up to 100 files per batch, so
   split a larger set across commits.
2. On GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a
   branch → Branch: `main` / `(root)` → Save.**
3. The app is live at `https://<your-username>.github.io/<repo-name>/` — for this
   repository: `https://randomguy198.github.io/CLA-Reading-and-Writing-Timer/`

## Notes on alerts

- Click **Enable desktop alerts** once so the browser grants notification permission.
  Without it, you still get the chime, the on-page banner, and the tab-title change.
- Browsers throttle timers in background tabs. The countdown stays exact, but an
  alert that comes due while the tab is hidden fires the moment the tab becomes
  visible again. For an exam simulation, keep the timer tab open and visible
  (minimized is fine on desktop; on mobile, keep the browser open).
- The screen wake lock is only held while the timer is counting: it drops the
  moment you pause, reset, or the time runs out, so it never keeps the screen
  (and battery) awake after practice ends. Aggressive battery-saver modes can
  still override a wake lock — plug the phone in for long sessions if yours is
  strict about that.
