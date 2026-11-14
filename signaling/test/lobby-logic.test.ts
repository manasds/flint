import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isRoomId, networkKey, parseDevice } from "../src/lobby-logic";

describe("networkKey", () => {
  it("groups IPv4 by full address", () => {
    assert.equal(networkKey("203.0.113.7"), "v4:203.0.113.7");
    assert.equal(networkKey("::ffff:203.0.113.7"), "v4:203.0.113.7");
  });

  it("groups IPv6 by /64 prefix", () => {
    const a = networkKey("2001:db8:abcd:12:1111:2222:3333:4444");
    const b = networkKey("2001:0db8:abcd:0012::99");
    assert.equal(a, "v6:2001:db8:abcd:12");
    assert.equal(a, b);
    assert.notEqual(a, networkKey("2001:db8:abcd:13::1"));
    assert.equal(networkKey("2001:db8::1"), "v6:2001:db8:0:0");
  });

  it("puts private and loopback addresses on one local network", () => {
    assert.equal(networkKey("192.168.1.5"), "local");
    assert.equal(networkKey("172.21.131.224"), "local");
    assert.equal(networkKey("127.0.0.1"), "local");
    assert.equal(networkKey("::1"), "local");
    assert.equal(networkKey("172.32.0.1"), "v4:172.32.0.1");
  });

  it("rejects junk", () => {
    assert.equal(networkKey(null), null);
    assert.equal(networkKey("hello"), null);
    assert.equal(networkKey("1:2:3"), null);
  });
});

describe("parseDevice", () => {
  it("accepts and trims a valid device", () => {
    assert.deepEqual(parseDevice({ id: "abcdef123456", name: "  My   Mac ", kind: "desktop" }), {
      id: "abcdef123456",
      name: "My Mac",
      kind: "desktop",
    });
  });

  it("defaults unknown kinds and caps names", () => {
    const d = parseDevice({ id: "abcdef123456", name: "x".repeat(100), kind: "toaster" });
    assert.equal(d?.kind, "desktop");
    assert.equal(d?.name.length, 40);
  });

  it("rejects bad ids and empty names", () => {
    assert.equal(parseDevice({ id: "short", name: "Mac", kind: "desktop" }), null);
    assert.equal(parseDevice({ id: "abcdef123456", name: "   ", kind: "desktop" }), null);
    assert.equal(parseDevice(null), null);
  });
});

describe("isRoomId", () => {
  it("accepts hex room ids only", () => {
    assert.equal(isRoomId("a1b2c3d4e5"), true);
    assert.equal(isRoomId("../x"), false);
    assert.equal(isRoomId(42), false);
  });
});
