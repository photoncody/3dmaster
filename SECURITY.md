# Security Policy

## Supported versions

Security fixes are applied to the latest code on `main` and to the newest published container image tag when applicable.

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Report privately via GitHub Security Advisories:

https://github.com/photoncody/3dmaster/security/advisories/new

Include:

- A short description of the issue and its impact
- Steps to reproduce (or a proof of concept)
- Affected version, commit, or image tag if known

You should receive an acknowledgment within a few days. Please give reasonable time for a fix before any public disclosure.

## Self-hosting guidance

- Prefer `AUTH_ENABLED=true` with a strong `AUTH_SECRET` (at least 32 random characters) and a strong bootstrap password when the instance is reachable beyond a trusted local network
- Put the app behind HTTPS (Caddy, Traefik, nginx, or similar) when exposed beyond localhost
- Set `TRUST_PROXY=true` only when a reverse proxy you control sets `X-Forwarded-For` / `X-Real-IP`
- Keep uploads and the SQLite database on a persistent volume outside the web root (`DATA_DIR` / `/data`)
