# Research Workspace Notes

- `research/outputs/` stores raw capture artifacts from live-site investigation, including network payloads and signed download URLs.
- These raw files are intentionally ignored by Git to avoid committing temporary credentials, signatures, or third-party secrets.
- Regenerate local artifacts with the scripts in this folder when needed instead of checking raw captures into version control.
- Keep durable conclusions in checked-in files such as `site-analysis.md`, audits, and design token summaries.
