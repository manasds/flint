import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getOtherSocket,
  isRoleTaken,
  type SocketAttachment,
} from "../src/room-logic";

function mockSocket(role?: SocketAttachment["role"]): WebSocket {
  let attachment: SocketAttachment | null = role ? { role } : null;
  return {
    deserializeAttachment<T>() {
      return attachment as T;
    },
    serializeAttachment(value: SocketAttachment) {
      attachment = value;
    },
  } as unknown as WebSocket;
}

describe("room-logic", () => {
  it("detects when a role is already taken", () => {
    const sender = mockSocket("sender");
    assert.equal(isRoleTaken([sender], "sender"), true);
    assert.equal(isRoleTaken([sender], "receiver"), false);
  });

  it("finds the other seat in a two-party room", () => {
    const sender = mockSocket("sender");
    const receiver = mockSocket("receiver");
    const sockets = [sender, receiver];

    assert.equal(getOtherSocket(sockets, sender, "sender"), receiver);
    assert.equal(getOtherSocket(sockets, receiver, "receiver"), sender);
  });

  it("ignores unjoined sockets when checking roles", () => {
    const unjoined = mockSocket();
    assert.equal(isRoleTaken([unjoined], "sender"), false);
  });
});
