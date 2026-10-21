# Runbook 000: Pre-Flight Setup — Accounts, GitHub, Environment & Cloudflare `cf` CLI

> **Audience:** Team Lead & Junior Developers
> **When to Read:** **Before** starting [Milestone 1 (`docs/plans/milestone-1-foundation-and-db.md`)](file:///Users/sramzzs4d/Projects-sramzz/swimming/docs/plans/milestone-1-foundation-and-db.md).

---

## 1. TL;DR: What Do Juniors Actually Need on Day 1?

We designed **AlleZwembaden.nl** so a junior developer can complete **100% of local coding and TDD testing (Milestones 1 through 5) with ZERO paid accounts and ZERO credit cards**.

| Service / Tool | Needed for Local Coding & Tests? | Needed for Staging / Prod Deploy? | Cost / API Key Status |
| :--- | :--- | :--- | :--- |
| **Git & GitHub Account** | **YES** (clone, branch, PR) | **YES** (GitHub Actions CI/CD) | Free (Collaborator access to repo) |
| **Node.js `>= 22.18.0` & `pnpm`** | **YES** (`cf` CLI requires Node 22.18+) | **YES** | Free local install |
| **Cloudflare `cf` CLI** | **YES** (`pnpm add -g cf`) | **YES** (`cf deploy`, `cf d1`) | Free CLI (`cloudflare.config.ts`) |
| **Cloudflare Account** | **NO** for unit/integration tests (uses local SQLite); **YES** for `cf d1` / `cf deploy` | **YES** (1 shared team account) | Free Workers/Pages/D1 tier (€0.00) |
| **Cloudflare Turnstile** | **Uses Official Dummy Test Keys** in `.env.example` | **YES** (provisioned via `cf`) | Free (Unlimited widgets) |
| **Maps (PDOK / OpenFreeMap / Google Embed)** | **NO API key needed** | **NO API key needed** | 100% Free & Keyless |
| **Dutch Open APIs (Rijksoverheid / RWS / KNMI)** | **NO API key needed** (mocked in Vitest, public JSON in CLI) | **NO API key needed** | 100% Free Public APIs |
| **Webhook Alerts (`ntfy.sh` / Discord / Slack)** | Optional (`ntfy.sh` needs no signup!) | **YES** (`ALERT_WEBHOOK_URL`) | Free (`https://ntfy.sh/ any-topic`) |

---

## 2. Installing & Using the New Cloudflare `cf` CLI

**Important Rule:** For everything Cloudflare-related (D1 databases, Workers/Pages, Turnstile, DNS, deployments), we use Cloudflare's new unified, agent-friendly **`cf` CLI** and typed **`cloudflare.config.ts`** (not legacy ad-hoc `wrangler.toml` workflows).

### Step 2.1: Install Node 22.18+ and the `cf` CLI
The `cf` CLI requires **Node.js `>= 22.18.0`** (Bun is not supported for `cloudflare.config.ts`).

```bash
# 1. Verify Node.js version is >= 22.18.0
node -v

# 2. Enable pnpm via Corepack
corepack enable
corepack prepare pnpm@latest --activate

# 3. Install the new Cloudflare `cf` CLI globally
pnpm add --global cf

# 4. Verify `cf` is installed (Note: if `cf` conflicts with another binary on your OS, use `cloudflare`)
cf --version
```

### Step 2.2: How Juniors Discover Any `cf` Command (`cf cli search`)
You never have to guess Cloudflare CLI flags. The `cf` CLI has a built-in natural-language search engine that works **offline without credentials**:

```bash
# Find how to create a D1 database
cf cli search "create a new D1 database"

# Find how to execute SQL against D1
cf cli search "execute sql query on D1"

# Find how to manage Turnstile widgets
cf cli search "create turnstile widget"

# List DNS zones or Workers
cf cli search "list zones"
```

### Step 2.3: Authenticate with the Team Cloudflare Account
*(Only needed when provisioning cloud D1 resources or running `cf deploy`)*:

```bash
# Opens browser SSO to log in
cf auth login

# Or if working inside a remote SSH / headless container:
cf auth login --no-browser

# Verify which Cloudflare account you are connected to:
cf auth whoami
```

### Step 2.4: Core `cf` Commands Used in This Project

```bash
# Start local Vite/Cloudflare development server reading cloudflare.config.ts
cf dev

# Build the production bundle
cf build

# Deploy to Cloudflare
cf deploy

# Create or list the D1 SQLite database in Cloudflare
cf d1 create allezwembaden-db
cf d1 list
```

---

## 3. Local Environment Variables (`.env.example` $\rightarrow$ `.env`)

When a junior clones the repo, they copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Here is what goes inside `.env.example` (already safe to commit because it uses Cloudflare's official Turnstile dummy keys and a local SQLite file):

```dotenv
# 1. Local SQLite Database Path (mirrors Cloudflare D1 locally for Vitest & CLI)
LOCAL_SQLITE_PATH="./.data/allezwembaden-local.sqlite"

# 2. Cloudflare Turnstile Keys
# Official Cloudflare Always-Pass Dummy Keys for localhost & automated tests:
# Docs: https://developers.cloudflare.com/turnstile/troubleshooting/testing/
PUBLIC_TURNSTILE_SITE_KEY="1x00000000000000000000AA"
TURNSTILE_SECRET_KEY="1x0000000000000000000000000000000AA"

# 3. Webhook Alert Endpoint (Quarantine Gate & Scraper Anomalies)
# Zero-signup option for local testing: open https://ntfy.sh/allezwembaden-dev-test in your browser!
ALERT_WEBHOOK_URL="https://ntfy.sh/allezwembaden-dev-test"

# 4. Headless Browser CDP Endpoint (Optional — only for Milestone 5 Step 2 escalation)
# Start Lightpanda (`lightpanda serve --port 9222`) or Obscura locally when needed
BROWSER_CDP_URL="http://127.0.0.1:9222"
```

---

## 4. GitHub Workflow & Branching Rules for Juniors

To prevent juniors from breaking `main` or overwriting each other's work:

1. **Never push directly to `main`.**
2. **One Branch per Milestone Task (or Milestone):**
   - Branch naming convention: `feat/m1-t1-workspace`, `feat/m1-t2-logger`, `feat/m2-t1-schedule-fsm`, etc.
3. **Update the Plan Checkboxes in Your Commit:**
   - When you finish a task and meet every item in its **Definition of Done (`✅ DoD`)**, change `- [ ]` to `- [x]` in both `docs/plans/milestone-X-*.md` and `docs/plans/000-master-implementation-plan.md` and include that markdown update in your Git commit.
4. **Pull Request Checklist:**
   - Before requesting review from a Senior/Lead, run:
     ```bash
     pnpm test
     pnpm build
     ```
   - Paste the terminal output of `pnpm test` into your Pull Request description.

---

## 5. Team Lead One-Time Cloud Provisioning Checklist

As the Project Owner / Lead, you only need to do these 4 steps **once** when ready to put the site live on Cloudflare:

- [ ] **1. Create/Select Cloudflare Account (Free Plan):** Log in via `cf auth login`.
- [ ] **2. Provision Production D1 Database:**
  ```bash
  cf d1 create allezwembaden-db
  ```
  Copy the returned `database_id` into `cloudflare.config.ts`.
- [ ] **3. Provision Turnstile Widget:**
  Use `cf cli search "create turnstile widget"` (or Cloudflare Dashboard $\rightarrow$ Turnstile $\rightarrow$ Add Widget for `allezwembaden.nl`, Managed mode) and set `PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` in Cloudflare environment secrets.
- [ ] **4. Set GitHub Actions Secrets (for auto-deploy on merge to `main`):**
  - `CLOUDFLARE_API_TOKEN`
  - `CLOUDFLARE_ACCOUNT_ID`
  - `ALERT_WEBHOOK_URL` (your production Telegram / Discord / Slack / ntfy channel)
