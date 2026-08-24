# Flint signaling (Cloudflare Workers)

WebSocket relay for Flint's 2-seat WebRTC rooms. File bytes never pass through this service — it only forwards join / offer / answer / ICE messages between one sender and one receiver per room.

Each room is a **Durable Object** named by `roomId`. WebSockets use the [hibernation API](https://developers.cloudflare.com/durable-objects/best-practices/websockets/) (`ctx.acceptWebSocket`) so idle rooms can sleep without dropping connections. Seat assignments (`sender` / `receiver`) are stored with `serializeAttachment` and survive hibernation.

## Local development

```bash
cd signaling
pnpm install
pnpm dev
```

`wrangler dev` serves the Worker locally (default `http://127.0.0.1:8787`). WebSocket clients connect to:

```text
ws://127.0.0.1:8787/<roomId>
```

Point the Next.js app at it:

```bash
# repo root
NEXT_PUBLIC_SIGNALING_URL=ws://127.0.0.1:8787 pnpm dev
```

If `NEXT_PUBLIC_SIGNALING_URL` is unset, the frontend falls back to the legacy Railway host for now. Set the env var for local Worker development.

## Deploy

```bash
cd signaling
pnpm install
pnpm deploy
```

After the first deploy, note the `*.workers.dev` URL from the Wrangler output and set it on your Next.js host:

```bash
NEXT_PUBLIC_SIGNALING_URL=wss://flint-signaling.<your-subdomain>.workers.dev
```

Clients connect to `${NEXT_PUBLIC_SIGNALING_URL}/${roomId}`.

**Cutover:** once traffic is on Workers, drain and decommission the Railway signaling service.

**Deploys drop all Durable Object WebSockets** (same as restarting the Railway Node process). Clients must reconnect.

## Scripts

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Local Worker + Durable Objects via Wrangler |
| `pnpm deploy` | Deploy to Cloudflare (requires `wrangler login`) |
| `pnpm typecheck` | TypeScript check |
| `pnpm test` | Unit tests for room seat logic |
| `pnpm validate` | `typecheck` + `test` |

## Protocol

Message types live in [`types.ts`](./types.ts). Behavior matches the previous Node server in `index.ts` (removed):

- Two seats per room: `sender` and `receiver`
- `{ type: "join", roomId, role }` on connect; `{ type: "error", message: "Role taken" }` if the seat is full
- `peer-joined` goes only to the other seat
- `offer` / `answer` / `ice-candidate` relay to the other seat
- `peer-left` on disconnect; empty rooms hibernate until the next join
