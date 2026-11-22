# Audiate

[Open Audiate](https://muk-labs.github.io/audiate/) to practice inner hearing.

Start a round to hear one pitch. Follow each interval silently as it appears, then sing the final note. Use **Space**, **Enter**, or the on-screen button to advance. Reveal the answer to hear it and read the full chain on a staff.

There are five levels. Finish three rounds at a level to unlock the next one. You can return to unlocked levels and choose a comfortable singing range. This browser remembers your progress and settings.

Choose **Classroom view** to fill the screen with the exercise and enlarge the cues and controls. Press **Escape** or choose **Exit classroom view** to return. Browsers without fullscreen support display the same layout inside the window.

Use **Check before reveal** to measure the pitch you imagined. Use **Check my pitch** after reveal to compare your voice to the reference, or enable **Auto-check after reveal** to have the microphone listen as soon as the tone finishes. The pitch meter shows your sung note to the left of the target when you sing flat and to the right when you sing sharp. The site processes microphone audio in your browser and saves no recordings.

## Local development

Run `python3 -m http.server 8000` from the repository root and open `http://localhost:8000`. The microphone requires HTTPS or localhost and the browser will ask for permission. The app uses native browser APIs. GitHub Pages serves the files from the root of `main`.
