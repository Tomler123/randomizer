# 3-Group Randomizer

A small classroom web app:

1. Presenter creates a room.
2. A QR code appears.
3. Students scan it and enter their names.
4. The presenter sees names appear live.
5. Presenter clicks **Randomize into 3 groups**.
6. Every student's phone immediately shows Group 1, 2, or 3.
7. Group sizes differ by at most one student.

The randomizer uses a Fisher-Yates-style shuffle driven by `crypto.getRandomValues()` and then distributes shuffled students round-robin across the three groups.

## What you need

- A free Firebase project.
- GitHub Pages, Netlify, Vercel, or any static web host.
- No custom backend server.

## 1. Create a Firebase project

Open the Firebase Console and create a new project.

Then add a **Web App** to the project.

Firebase will show a configuration object similar to:

```js
const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  databaseURL: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};
```

Paste those values into `app.js` where the placeholder `firebaseConfig` is located.

Important: `databaseURL` must be present.

## 2. Enable Anonymous Authentication

Firebase Console:

**Authentication -> Sign-in method -> Anonymous -> Enable**

Students do not create accounts or passwords. Firebase silently gives each browser a temporary anonymous identity.

## 3. Create Realtime Database

Firebase Console:

**Realtime Database -> Create Database**

Choose a nearby region.

After the database is created:

**Realtime Database -> Rules**

Replace the rules with the contents of `firebase-rules.json`, then click **Publish**.

Do not leave your database in public/test mode.

## 4. Test locally

Because this project uses JavaScript modules, serve it over HTTP rather than double-clicking `index.html`.

If Python is installed:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

For phones on the same network, local hosting can work with your computer's LAN IP, but for a classroom/presentation the easiest option is GitHub Pages.

## 5. Deploy with GitHub Pages

1. Create a GitHub repository.
2. Add `index.html`, `style.css`, and `app.js` to the repository root.
3. Push to GitHub.
4. Repository -> **Settings -> Pages**.
5. Under **Build and deployment**, choose **Deploy from a branch**.
6. Select your main branch and `/ (root)`.
7. Save.
8. Open the generated `https://...github.io/.../` URL.

Firebase Authentication may require the deployed hostname to be authorized:

**Firebase Console -> Authentication -> Settings -> Authorized domains**

Add your GitHub Pages hostname if it is not already allowed.

## Presentation workflow

Before class:

1. Open the deployed website on your laptop.
2. Click **Create presenter room**.
3. Put the browser on the projector.
4. Students scan the displayed QR.
5. Wait until the participant count matches the class.
6. Click **Randomize into 3 groups**.

Example sizes:

- 30 students -> 10 / 10 / 10
- 31 students -> 11 / 10 / 10
- 32 students -> 11 / 11 / 10

The presenter can click **Randomize again** if needed.

## Important practical note

Firebase applies anti-abuse limits to anonymous account creation, including limits related to many anonymous sign-ins from the same IP in a short period. For an ordinary class this will often be fine, but test the real setup before presentation day, especially if a large class will all use the same school Wi-Fi.

If you expect a very large audience, replace anonymous Firebase Auth with a small server-side room API or a managed attendee system.

## Files

- `index.html` - UI
- `style.css` - styling
- `app.js` - room creation, live joining, QR generation, balanced randomization
- `firebase-rules.json` - Realtime Database security rules
