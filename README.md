# api.bondarewicz.com

The API behind [bondarewicz.com](https://bondarewicz.com). It has two parts:

- **The site agent** (`/v1/agent/*`): answers visitors' questions about Łukasz from a fixed profile, records conversations, captures leads and notifies him.
- **A small playground API**: UUIDs, haiku names, base64 helpers, HTTP verb/status echoes, an in-memory key-value store, file upload, replay queue, configurable delay, IP, user agent, weather, QR codes and a visit counter.

Interactive Swagger docs for the public endpoints live at the API root: [api.bondarewicz.com/v1](https://api.bondarewicz.com/v1/) (locally [localhost:8080/v1](http://localhost:8080/v1/)).

[![Run in Postman](https://run.pstmn.io/button.svg)](https://app.getpostman.com/run-collection/2c19f5b3298aa50db70d)

## Run locally

Needs Node 20+ and Redis. For the free local model, [Ollama](https://ollama.com) with `gemma4` pulled.

```sh
npm install
cp .env.example .env   # then fill in what you need, see "Configuration"
node server.js         # http://localhost:8080/v1
```

A safe setup for trying changes (free local model, nothing billed, no notifications sent):

```sh
AGENT_PROVIDER=ollama LEAD_WEBHOOK_URL= NOTIFY_EMAIL= RESEND_API_KEY= node server.js
```

The site (`bondarewicz/com`) talks to `http://localhost:8080/v1` when run with `npm run dev`.

## Deploy

Railway deploys `master` automatically (project `bondarewicz-api`, services `bondarewicz-api` and `Redis`), behind Cloudflare at `api.bondarewicz.com`. Configuration lives in the service's **Variables**. A push takes about 90 seconds to go live.

## The site agent

### How a question is answered

```
POST /v1/agent/chat  { conversationId, meta, messages: [{ role, content }] }
  ├─ Cloudflare-only gate (CF_ORIGIN_SECRET) and site-only CORS
  ├─ visitor paused?          → canned reply, no model call
  ├─ per-visitor and daily caps (Redis)
  ├─ kill switch / AGENT_ENABLED / budget reservation / concurrency slot
  ├─ model: Claude (production) or Ollama (local), structured JSON output
  ├─ intent check: off-topic or abusive replies are short, never ask for contact,
  │  and repeated ones pause the visitor for an hour
  ├─ conversation recorded with IP, location, network, browser, referrer
  └─ contact details typed in chat become a lead → notification
← { answer, ask, fit, followups, offer_contact, intent, contact_saved, remaining }
```

### Where the agent is defined

| File | What it holds |
|---|---|
| `agent/agent.json` | Models per provider, Claude prices (for budget tracking) and every limit |
| `agent/system.md` | Behaviour and rules: grounding, tone, what never to share or invent |
| `agent/profile.json` | Everything the agent knows: positioning, availability, roles, projects, experience, approved facts. The agent never names employers or dates (those are on LinkedIn): `agent/index.js` strips them from experience before building the prompt. The site copies only the capabilities and links with `npm run sync-profile` |
| `agent/schema.js` | The structured reply every provider must return |
| `agent/index.js` | Builds the prompt (system.md + profile + today's date and conversation state), picks the provider, enforces post-processing (no em dashes, visitor-side follow-ups, fit reports only for job descriptions) |
| `agent/providers/` | Claude (`@anthropic-ai/sdk`) and Ollama |
| `agent/guard.js` | Rate limits, budget reservation, concurrency slots, strikes and pauses, kill switch, visitor IP |
| `agent/store.js` | Conversation log in Redis (bound to the IP that started it) |
| `agent/lead.js`, `agent/notify.js` | Leads and notifications (ntfy push + Resend email) |
| `agent/admin.js` | Admin pages and kill switch |

Edit those files and push to `master` to change the agent. If you change `profile.json`, copy it to the site repo too.

### Endpoints

| Endpoint | Purpose |
|---|---|
| `POST /v1/agent/chat` | Ask the agent (see above) |
| `POST /v1/agent/lead` | Contact form: `{ conversationId, name, email, note }` |
| `GET /v1/agent/profile` | The public profile (no email address) |
| `GET /v1/agent/admin` | Conversations, leads, today's spend, kill switch. Basic auth: any username, password `ADMIN_PASSWORD` |
| `GET /v1/agent/admin/c/:id` | One conversation with visitor details |
| `POST /v1/agent/admin/killswitch` | Turns the agent off or on (admin page form, token and same-origin protected) |

### Cost and abuse controls

| Control | Default | Where |
|---|---|---|
| Questions per visitor | 20 per hour | `perIpPerHour` |
| Questions, whole site | 500 per day | `globalPerDay` |
| Claude spend | $0.50 per day, reserved before each call | `AGENT_DAILY_BUDGET_USD` / `dailyBudgetUsd` |
| Concurrent Claude calls | 4 | `maxConcurrentCalls` |
| Output per answer | 700 tokens | `maxOutputTokens` |
| Abuse | 2 abusive or 4 off-topic messages pause a visitor for an hour | `agent/index.js` |
| Leads | 5 per visitor per hour, 100 per day | `leadsPerIpPerHour`, `leadsPerDay` |
| Notifications | 60 pushes, 25 emails per day | `NOTIFY_PUSHES_PER_DAY`, `NOTIFY_EMAILS_PER_DAY` |

The limits without a variable live in `agent/agent.json`. On top of these, set a monthly spend limit on the Anthropic workspace that owns the key.

### Turning the agent off

1. Admin page → **Turn agent off**. Instant: no model calls; visitors are told the assistant is resting and can still leave their details.
2. Railway variable `AGENT_ENABLED=false` (after a redeploy).
3. Last resort: revoke the key in the Anthropic Console.

### Redis keys

All agent keys are defined in `agent/keys.js`, in three groups:

| Prefix | What | Kept |
|---|---|---|
| `agent:data:` | `conversation:{id}`, `conversations` (index), `leads`, `killswitch` | 180 days or until deleted |
| `agent:stats:` | `spend:{date}`, `chats:{date}`, `leads:{date}`, `pushes:{date}`, `emails:{date}` | 2 days |
| `agent:limit:` | per-visitor counters (`chat`, `lead`, `notified`, `admin-fail` by hour), `strike:*`, `paused:*`, `inflight` | an hour or less |

`visits:count` belongs to the playground.

## Configuration

| Variable | Purpose |
|---|---|
| `PORT` | HTTP port (Railway sets it) |
| `REDIS_URL` | Redis connection (required) |
| `AGENT_PROVIDER` | `anthropic` in production; anything else uses Ollama |
| `ANTHROPIC_API_KEY` | Claude API key |
| `ANTHROPIC_MODEL` | Overrides the model in `agent.json` (default `claude-haiku-4-5`) |
| `OLLAMA_URL`, `OLLAMA_MODEL` | Local model (defaults `http://localhost:11434`, `gemma4`) |
| `AGENT_FALLBACK` | `ollama` to fall back to Ollama when Claude's budget is spent; otherwise the agent rests |
| `AGENT_ENABLED` | `false` turns the agent off |
| `AGENT_DAILY_BUDGET_USD` | Daily Claude budget (default `0.5`) |
| `AGENT_RETENTION_DAYS` | How long conversations are kept (default `180`) |
| `ADMIN_PASSWORD` | Admin page password; without it the admin is off |
| `ADMIN_TZ` | Timezone for admin times (default `Europe/Warsaw`) |
| `CF_ORIGIN_SECRET` | Must match the `x-origin-secret` header a Cloudflare Transform Rule adds; agent routes then reject requests that bypass Cloudflare. Add the Cloudflare rule first, then this variable |
| `LEAD_WEBHOOK_URL` | Push notifications: an ntfy.sh topic URL, or a Slack/Discord webhook |
| `RESEND_API_KEY`, `NOTIFY_EMAIL`, `NOTIFY_FROM` | Lead emails via Resend (`NOTIFY_FROM` must be on a verified domain) |
| `NOTIFY_PUSHES_PER_DAY`, `NOTIFY_EMAILS_PER_DAY` | Notification caps |
| `PUBLIC_API_URL` | Base used for admin links in notifications (default `https://api.bondarewicz.com/v1`) |
| `API_HOSTNAME`, `GITHUB_TOKEN` | Playground: base URL in some responses; token for the `/version` GitHub lookup |

## Data and privacy

Conversations (with IP, approximate location, network, browser and referrer) are stored in Redis for `AGENT_RETENTION_DAYS` and visible only on the admin page; the site tells visitors that conversations are saved. Leads are kept until deleted. The agent never sees or shares an email address for Łukasz.

## Playground notes

Rate limited to 1000 requests per hour per IP. `/anythings/:id` and `/replay` are in-memory and don't survive a restart.
