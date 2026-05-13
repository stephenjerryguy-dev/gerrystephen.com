# Working From GitHub Codespaces

This repository is ready to open in GitHub Codespaces.

## Open the project

1. Go to the repository on GitHub.
2. Select **Code**.
3. Select the **Codespaces** tab.
4. Select **Create codespace on main**.

The Codespace installs a static preview server automatically and forwards port `4173`.

## Daily workflow

- Make edits inside the Codespace.
- Use the preview on port `4173` to check the site.
- Commit and push changes from the Codespace.
- Keep secrets in GitHub Codespaces secrets or Vercel environment variables, not in files.

## Security notes

- Keep the repository private unless it intentionally needs to be public.
- Require two-factor authentication on the GitHub account.
- Store API keys, deployment tokens, and passwords as GitHub/Vercel secrets.
- Rotate credentials if you suspect account or project access was exposed.
- Review collaborators and deploy tokens periodically.
