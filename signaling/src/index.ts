import { Room } from "./room";

export { Room };

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

    return env.ROOMS.getByName(roomId).fetch(request);
  },
} satisfies ExportedHandler<Env>;
