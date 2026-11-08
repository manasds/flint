import type { Room } from "./src/room";

declare global {
  interface Env {
    ROOMS: DurableObjectNamespace<Room>;
  }
}

export {};
