# Mom's DIY Helper

A guide plus a chat helper for the jobs around Mom's house. The helper is the home page (`/`). The guide lives at `/guide`.

## 1. Put it on GitHub with GitHub Desktop

1. Unzip `moms-diy-helper.zip`. You get a folder named `moms-diy-helper` that is already a Git repository on branch `main`, with no commits yet.
2. In GitHub Desktop choose **File → Add local repository**, pick the `moms-diy-helper` folder, and click **Add repository**.
3. In the bottom-left, type the Summary `Initial commit` and click **Commit to main**.
4. Click **Publish repository**. Keep **Keep this code private** ticked, then click **Publish repository**.
5. On GitHub, open the repository's **Settings → Advanced Security** and turn on **Secret Protection** (secret scanning and push protection), if your plan shows it.

## 2. Deploy on Vercel

1. In Vercel, click **Add New → Project** and import the `moms-diy-helper` repository. Leave the framework as **Other** and the build settings blank.
2. Before deploying, open **Environment Variables** and add `ANTHROPIC_API_KEY` for **Production** only. Get the key from the Claude Console, in a workspace made just for this project with a monthly spend limit.
3. Click **Deploy**.
4. Add the rate-limit rule under **Firewall → Configure → New Rule** (exact field values are in the setup notes that came with this repository).
5. Any time you change an environment variable, redeploy so the change takes effect.

The guide works as soon as it deploys. The helper chat answers only once `ANTHROPIC_API_KEY` is set; until then it shows "The helper isn't available right now."

## What's in here

| Path | What it does |
| --- | --- |
| `index.html`, `assets/js/engine.js`, `assets/css/engine.css` | The helper (home page): chat, top match, shortlist, project details |
| `guide/index.html`, `assets/js/guide.js`, `assets/css/guide.css` | The guide, built from `data/gub.json` |
| `guide/folding-door.html`, `assets/css/howto.css`, `assets/js/howto.js` | Illustrated, printable step-by-step for putting up Mom's folding door, at `/guide/folding-door` |
| `data/gub.json` | All guide content. Edit it to add or change a job; both pages use it |
| `api/chat.js` | Server function that holds the API key and talks to Claude |
| `assets/js/prefs.js` | Text-size and theme buttons, shared by both pages |
| `vercel.json` | Security headers, and bundles `data/` with the chat function |

### Adding a job to the guide

Add an entry to `data/gub.json` with `id`, `group` (`now` or `past`), `kind`, `title`, `summary`, `tags`, `details` and `body`. Body blocks are `h`, `p`, `steps`, `list`, `note`, `warn` and `link` (a button to another page on this site; `href` must start with `/`). The helper reads the same file, so it learns the new job on the next deploy.

## What works, and what doesn't

Works now:
- The guide, with text sizes and light/dark themes.
- The helper's conversation (once the key is set). It asks one question at a time when something's unclear, then gives a plan, a next step and ranked matches.
- Voice input in Chrome, Edge and Safari.
- Downloading the plan as a text file.

The chat stays in the browser tab and clears when the tab closes.

Not included (each would need a bigger build): saved history across visits, accounts, sending email or texts, buying or booking anything, live store prices, and photo upload. The helper can't change router settings for you; it explains how.

## Security

- The API key lives only in Vercel's environment variables and is read inside `api/chat.js`. It is never sent to the browser.
- `/api/chat` accepts POST with JSON only, rejects bodies over 32 KB, caps message count and length, forwards only user and assistant turns, and decides the model, `max_tokens` (16000), effort and system prompt itself.
- Requests from other websites are refused (403). This blocks other sites, not scripts, so the rate limit and the spend cap are still needed.
- An in-code limiter allows 20 requests per visitor per 10 minutes. It resets when Vercel restarts the function, so the Firewall rule is the dependable limit.
- Every page sends a strict Content-Security-Policy: scripts only from this site (plus the theme script, allowed by its hash), styles and fonts only from this site and Google Fonts.
- No analytics, trackers or third-party scripts.
- If you edit the small theme script in the `<head>` of either page, update its `sha256-` hash in `vercel.json`, or the theme won't restore.

## Local testing

Install the Vercel CLI, copy `.env.example` to `.env.local`, fill in a low-limit test key, then run `vercel dev`. Never commit `.env.local`.

## Model

The helper uses `claude-sonnet-5-5` with `output_config.effort` set to `medium`. To use a different model, set `ANTHROPIC_MODEL` in Vercel and redeploy.
