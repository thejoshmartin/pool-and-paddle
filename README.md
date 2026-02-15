# 🏊 Pool & Paddle — Deployment Guide

## What You're Deploying

A luxury-themed web dashboard for your Airbnb launch, featuring:
- **Dashboard** — Progress tracking across 9 categories with executive summary
- **Podcast Intel Database** — 25 curated episodes from "Thanks for Visiting," searchable by keyword, tags, category, and priority
- **Task Tracker** — 55 actionable tasks with notes, priorities, and gimmick flags

Your task progress saves automatically in the browser (persists between visits).

---

## Option A: Deploy to Vercel (Recommended — Free, 5 minutes)

This is the easiest path. Vercel hosts your site for free with a URL like `pool-and-paddle.vercel.app`.

### Prerequisites
- A free GitHub account → https://github.com/signup
- A free Vercel account → https://vercel.com/signup (sign up with your GitHub account)

### Step-by-Step

#### 1. Install Git and Node.js on your computer

**Mac:**
```bash
# Install Homebrew (if you don't have it)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Git and Node.js
brew install git node
```

**Windows:**
- Download and install Git: https://git-scm.com/download/win
- Download and install Node.js (LTS version): https://nodejs.org/

Verify both are installed:
```bash
git --version
node --version
npm --version
```

#### 2. Download and unzip the project files

Download the `pool-and-paddle` folder from this conversation. It contains:
```
pool-and-paddle/
├── index.html
├── package.json
├── vite.config.js
├── .gitignore
└── src/
    ├── main.jsx
    └── App.jsx
```

#### 3. Test locally first (optional but recommended)

Open a terminal, navigate to the project folder, and run:
```bash
cd pool-and-paddle
npm install
npm run dev
```

This starts a local server. Open http://localhost:5173 in your browser. You should see the Pool & Paddle dashboard. Press `Ctrl+C` to stop.

#### 4. Create a GitHub repository

Go to https://github.com/new and:
- Repository name: `pool-and-paddle`
- Set to **Private** (this is your personal business tool)
- Do NOT initialize with README
- Click **Create repository**

#### 5. Push your code to GitHub

In your terminal, from inside the `pool-and-paddle` folder:
```bash
git init
git add .
git commit -m "Initial commit - Pool & Paddle Command Center"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/pool-and-paddle.git
git push -u origin main
```

Replace `YOUR_USERNAME` with your actual GitHub username.

#### 6. Deploy on Vercel

1. Go to https://vercel.com/dashboard
2. Click **"Add New..."** → **"Project"**
3. Find and select your `pool-and-paddle` repository
4. Vercel auto-detects it's a Vite project. Leave all settings as defaults.
5. Click **"Deploy"**
6. Wait ~60 seconds. Done! Your site is live.

Vercel gives you a URL like `pool-and-paddle-abc123.vercel.app`. You can add a custom domain later in Vercel's settings if you want.

#### 7. Future updates

Whenever you want to make changes:
```bash
# Edit files, then:
git add .
git commit -m "Description of changes"
git push
```
Vercel automatically redeploys on every push.

---

## Option B: Deploy to Netlify (Also Free)

Nearly identical to Vercel.

1. Push code to GitHub (Steps 1-5 above)
2. Go to https://app.netlify.com
3. Click **"Add new site"** → **"Import an existing project"**
4. Connect your GitHub and select `pool-and-paddle`
5. Build settings:
   - Build command: `npm run build`
   - Publish directory: `dist`
6. Click **"Deploy site"**

---

## Option C: Simple Static Hosting (No Build Step)

If you want the absolute simplest deployment with no build tools, you can use the
artifact `.jsx` file directly in Claude.ai — it renders natively there. But for a
standalone website, Options A or B are recommended.

---

## Customizing the App

### Adding More Podcast Episodes

Open `src/App.jsx` and find the `PODCAST_DATABASE` array (near the top). Add entries following this format:

```javascript
{
  id: 26,                    // Next sequential number
  ep: 500,                   // Episode number
  title: "Episode Title",
  category: "Getting Started",  // Pick from existing categories or add new ones
  priority: "critical",      // critical | high | medium | low
  tags: ["tag1", "tag2"],    // Searchable keywords
  summary: "What the episode covers...",
  keyInsight: "One-line takeaway.",
  source: "https://thanksforvisiting.com/podcasts/500/",
  isGimmick: false           // true = flagged as deprioritize/skip
}
```

### Adding More Tasks

Find the `DEFAULT_TASKS` array and add:

```javascript
{
  id: "t56",                  // Next sequential ID
  category: "design",         // Must match a TASK_CATEGORIES id
  task: "Your task description",
  done: false,
  priority: "high",           // critical | high | medium | low
  isGimmick: false,
  notes: "",                  // Optional default note
  relatedEps: [531, 249]      // Episode numbers for reference links
}
```

### Adding New Task Categories

Find the `TASK_CATEGORIES` array and add:

```javascript
{ id: "my-category", label: "My New Category", icon: "🎯" }
```

### Resetting Task Progress

Your task progress is saved in the browser's localStorage. To reset:
- Open browser dev tools (F12)
- Go to Application → Local Storage
- Delete the `pool-paddle-tasks-v1` key
- Refresh the page

---

## Sharing With Your Wife

Since task data is stored in each browser's localStorage, you and your wife will
have **independent** task progress. This is actually useful — you can each track
your own responsibilities.

If you want **shared** task state, you'd need a backend database. Some easy options:
- **Supabase** (free tier) — add a Postgres database
- **Firebase** (free tier) — add Firestore
- **Google Sheets API** — use a shared spreadsheet as a database

This is a more advanced setup. The current version works great for individual tracking
or for reviewing together on the same computer.

---

## Troubleshooting

**"npm: command not found"**
→ Node.js isn't installed. Download from https://nodejs.org/

**"git: command not found"**
→ Git isn't installed. Download from https://git-scm.com/

**Page is blank after deploy**
→ Check that your build command is `npm run build` and publish directory is `dist`

**Fonts look wrong**
→ The app loads Google Fonts (Playfair Display + DM Sans). Make sure you have internet.

**Tasks disappeared**
→ Task data is per-browser. Clearing browser data or using a different browser/device starts fresh.

---

## Tech Stack

| What | Why |
|------|-----|
| React 18 | Component framework |
| Vite 6 | Fast build tool |
| Vanilla CSS-in-JS | No extra dependencies, everything in one file |
| localStorage | Persistent task state with zero backend |
| Google Fonts | Playfair Display (headings) + DM Sans (body) |

Total dependencies: 2 (react + react-dom). This is intentionally minimal for long-term maintainability.
