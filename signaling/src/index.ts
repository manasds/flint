import { Lobby } from "./lobby";
import { networkKey } from "./lobby-logic";
import { Room } from "./room";

export { Lobby, Room };

/** Room ids are hex, so this path can never collide with a room. */
const LOBBY_PATH = "_lobby";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Flint signaling server is running.", {
        status: 200,
        headers: { "content-type": "text/plain" },
      });
    }

    const roomId = new URL(request.url).pathname.replace(/^\/+/, "");
    if (!roomId) {
      return new Response("Missing room ID in URL path.", { status: 400 });
    }

    if (roomId === LOBBY_PATH) {
      const key = networkKey(request.headers.get("CF-Connecting-IP"));
      if (!key) return new Response("Unknown client address.", { status: 400 });
      return env.LOBBIES.getByName(key).fetch(request);
    }

    return env.ROOMS.getByName(roomId).fetch(request);
  },
} satisfies ExportedHandler<Env>;
