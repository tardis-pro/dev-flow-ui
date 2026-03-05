## F3 Final QA Walkthrough - 2026-03-02

### Screenshots captured
- `.sisyphus/evidence/final-qa/onboarding.png`
- `.sisyphus/evidence/final-qa/settings.png`  
- `.sisyphus/evidence/final-qa/main-board.png`

### Onboarding (/onboarding)
- PASS: 4-step wizard renders correctly (Step 1 of 4)
- PASS: Step indicators visible: Connected → Select Repos → Bootstrap → AI Keys
- PASS: Step 1 highlighted in cyan, others dimmed with connecting lines
- PASS: "GitHub Connected" card with user avatar, permissions list, CTA button
- PASS: No React error overlays or console errors

### Settings (/settings)
- PASS: 3 tabs visible: AI Keys (active/cyan), Repos, Workflow
- PASS: No double header
- PASS: "Configured AI Providers" empty state + "Add API Key" form
- PASS: Provider dropdown (Gemini), API Key input, Validate + Save buttons

### Main Board (/)
- PASS: Renders without crashing
- PASS: Full toolbar: Select repo, Add OSS Repo, Update Permissions, gear, search, + New Issue
- PASS: Status/Work Type filter pills visible
- PASS: "Sign in to GitHub" prompt (expected — no OAuth session)

### Server Console
- WARN: nextauth URL/SECRET warnings (expected in dev)
- INFO: 401 on auth-required APIs (expected — no session)
- All pages: HTTP 200
