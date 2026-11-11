p2p file sharing using webrtc

## Signaling

WebRTC signaling runs on [Cloudflare Workers + Durable Objects](./signaling/README.md). Set `NEXT_PUBLIC_SIGNALING_URL` to the Worker base URL (no trailing slash, no room id). Without it, the app uses the legacy Railway host until you cut over.

```bash
# local Worker + Next.js
cd signaling && pnpm install && pnpm dev
# separate terminal, repo root
NEXT_PUBLIC_SIGNALING_URL=ws://127.0.0.1:8787 pnpm dev
```

See [signaling/README.md](./signaling/README.md) for deploy and cutover notes.
