# LabLink

Browser-based control panel for lab instruments.

LabLink is a prototype for the FAU Engineering Design capstone project "Web Control of Lab Instruments" (Team 10). The capstone goal is to retrofit older, non-networked lab equipment (an ECP Inverted Pendulum Model 505 and a Feedback Twin Rotor MIMO System) so students can run them from a web browser. This app is the software side of that idea: it lets a user register, log in, keep an inventory of instruments, send control commands to a selected instrument, see the command history, and record experiment results. Every action is stored in a Supabase Postgres database.

Built for the ED2 AI Hootcamp assignment, using AI tooling (Claude) to generate the code.

**Deployed app:** https://ed2-project.netlify.app/

**Demo video:** (add unlisted YouTube link here)

## What it does

- Register a new account, log in, and log out (Supabase Auth, email and password)
- Add, edit, and delete instruments (name, model, location, status, notes)
- Open an instrument's control panel: set a setpoint and motor voltage with sliders and send Start, Stop, Send setpoint, Send voltage, and Emergency stop commands
- Every command is written to a command log table and shown in a live history; Start and Stop also update the instrument's status
- Record experiment runs (title, setpoint, duration, observations) against an instrument and delete them later
- Row Level Security means each user only ever sees and edits their own instruments, commands, and experiments

In the real capstone system the "send command" step will forward to a Raspberry Pi and ESP32 attached to the hardware. In this prototype the command is stored in the database and reflected in the UI, which is enough to prove out the auth, data model, and interface.

## Technologies

- HTML, CSS, and plain JavaScript (no framework, no build step)
- Supabase: Postgres database, Auth, and the auto-generated REST API, accessed through `supabase-js` v2 from a CDN
- Netlify for static hosting
- Git and GitHub for version control

## Project structure

```
index.html            Single page shell that loads the app
css/style.css         Styling
js/config.js          Supabase project URL and publishable key
js/app.js             All app logic: auth screens, dashboard, CRUD, control panel
supabase/schema.sql   Database tables, indexes, and Row Level Security policies
netlify.toml          Netlify publish settings
```

### Database tables

| Table | Purpose |
| --- | --- |
| `instruments` | One row per piece of equipment: name, model, location, status, notes |
| `experiments` | A recorded run on an instrument: title, setpoint, duration, result |
| `command_log` | Every control command sent to an instrument, with value and timestamp |

All three tables have a `user_id` column tied to `auth.users`, and RLS policies restrict every read and write to the row's owner. Deleting an instrument cascades to its experiments and commands.

## Setup

### 1. Supabase

1. Create a free project at supabase.com.
2. Open the SQL editor, paste the contents of `supabase/schema.sql`, and run it.
3. In Project Settings > API, copy the Project URL and the publishable (anon) key.
4. Put those two values into `js/config.js`.

Optional: under Authentication > Providers > Email you can turn off "Confirm email" so new accounts can log in immediately without a confirmation link. This is convenient for demos.

The publishable key is safe to ship in the front end. It only grants the permissions defined by the RLS policies, and nothing in the database is readable without a logged-in session.

### 2. Run locally

There is nothing to install. Serve the folder with any static server so the browser allows the Supabase requests, for example:

```
npx serve .
```

or open `index.html` through VS Code's Live Server extension.

### 3. Deploy to Netlify

1. Push the repository to GitHub.
2. In Netlify, choose "Add new site" > "Import an existing project" and pick this repo.
3. Leave the build command empty and set the publish directory to `.` (already set in `netlify.toml`).
4. Deploy. The live site for this project is https://ed2-project.netlify.app/.

## How to use

1. Register with an email and password, then log in.
2. Add an instrument using the form on the left. It appears in the list on the right.
3. Click Open on an instrument to bring up its control panel.
4. Move the sliders and press a command button. Each command shows up in the command log immediately.
5. Fill in the experiment form to save a run. Records appear in the Experiments table.
6. Use Edit and Delete in the instrument list to update or remove equipment.
7. Log out from the top of the dashboard.

## Author

Victor Borden, Computer Engineering, Florida Atlantic University
