Retired 2026-07-13: these scripts pushed `site/`/`info/` to Hostinger over
FTP/FTPS. Replaced by a single Vercel project (see root `vercel.json`) that
deploys automatically from `main` after a PR is reviewed and merged.
Hostinger's only remaining job is DNS, pointed at Vercel. Kept for
reference only — not wired into any live pipeline.
