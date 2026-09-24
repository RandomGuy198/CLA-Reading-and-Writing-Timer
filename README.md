# Reading Timer

A single-page countdown timer with custom milestone alerts, built for IELTS/ exam
reading practice. No build step, no dependencies — plain HTML, CSS, and JavaScript.

## Features

- **Accurate countdown** — based on clock time, not tick counting, so a throttled
  background tab cannot make it drift. Pauses and resumes exactly where you left off.
- **Custom milestones** — add any "time remaining" alerts you want, e.g. `05:00`,
  `01:00`. Milestones never stop the timer — it keeps running to `00:00`.
- **Loud chime + spoken alerts** — each alert plays a loud two-tone chime, then a
  spoken English phrase ("5 minutes left", "1 minute left", "Time's up") generated
  with Microsoft Edge TTS, Turkish male voice `tr-TR-AhmetNeural`. Bundled MP3s in
  `audio/` (1–60 minutes, 1–59 seconds, time-out), so no server or API is needed.
  Milestones at odd values without a clip fall back to chime + banner.
- **Desktop notifications** — click **Enable desktop alerts** once; the browser then
  shows a system notification for every alert too.
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

1. Create a new GitHub repository (for example `reading-timer`).
2. Copy `index.html`, `style.css`, and `app.js` into the repository root.
3. Push:

   ```bash
   git init
   git add .
   git commit -m "Reading timer"
   git branch -M main
   git remote add origin https://github.com/<your-username>/reading-timer.git
   git push -u origin main
   ```

4. On GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a
   branch → Branch: `main` / `(root)` → Save.**
5. Your app is live at `https://<your-username>.github.io/reading-timer/`

Tip: if you name the repository `<your-username>.github.io`, the app lives at the
root address `https://<your-username>.github.io/` instead.

## Notes on alerts

- Click **Enable desktop alerts** once so the browser grants notification permission.
  Without it, you still get the chime, the on-page banner, and the tab-title change.
- Browsers throttle timers in background tabs. The countdown stays exact, but an
  alert that comes due while the tab is hidden fires the moment the tab becomes
  visible again. For an exam simulation, keep the timer tab open and visible
  (minimized is fine on desktop; on mobile, keep the browser open).
