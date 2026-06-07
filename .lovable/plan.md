Plan: Store the Hotel Sri Janakiram project brief in two places so it's always available.

Step 1 — Create docs/PROJECT_BRIEF.md
- Write the full brief verbatim from the user message into a markdown file at the repo root under `docs/PROJECT_BRIEF.md`.
- Add a front-matter header for quick scanning: app name, primary users, stack, key defaults.

Step 2 — Update mem://index.md
- Add core rules that apply to every module (e.g. responsive law, RLS, audit-log, GST inclusive, stock ledger, atomic RPCs).
- Reference the full brief file from the memory index.

No code changes, no module building, no PWA or Supabase setup yet — this is knowledge storage only.