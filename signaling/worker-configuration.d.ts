import type { Lobby } from "./src/lobby";
import type { Room } from "./src/room";

declare global {
  interface Env {
    ROOMS: DurableObjectNamespace<Room>;
    LOBBIES: DurableObjectNamespace<Lobby>;
  }
}

export {};
