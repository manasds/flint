import type { DeviceKind } from "./types";
import { randomId } from "./protocol";

const NAME_KEY = "flint:device-name";

/** Best-effort OS, browser and form factor from the user agent. */
function sniff(): { os: string; browser: string; kind: DeviceKind } {
  const ua = navigator.userAgent;
  const touchMac = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1; // iPadOS
  const os = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua) || touchMac
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Mac OS X|Macintosh/.test(ua)
          ? "Mac"
          : /Windows/.test(ua)
            ? "Windows"
            : /CrOS/.test(ua)
              ? "ChromeOS"
              : /Linux/.test(ua)
                ? "Linux"
                : "Device";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Firefox\/|FxiOS/.test(ua)
      ? "Firefox"
      : /OPR\//.test(ua)
        ? "Opera"
        : /Chrome\/|CriOS/.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Browser";
  const kind: DeviceKind =
    os === "iPad" || (os === "Android" && !/Mobile/.test(ua))
      ? "tablet"
      : os === "iPhone" || os === "Android"
        ? "phone"
        : "desktop";
  return { os, browser, kind };
}

export function deviceKind(): DeviceKind {
  return sniff().kind;
}

export function defaultDeviceName(): string {
  const { os, browser } = sniff();
  return `${browser} on ${os}`;
}

export function loadDeviceName(): string {
  try {
    const saved = localStorage.getItem(NAME_KEY)?.trim();
    if (saved) return saved.slice(0, 40);
  } catch {
    // Storage blocked: fall through.
  }
  return defaultDeviceName();
}

export function saveDeviceName(name: string) {
  try {
    if (name === defaultDeviceName()) localStorage.removeItem(NAME_KEY);
    else localStorage.setItem(NAME_KEY, name);
  } catch {
    // Not persisted; the name still applies for this tab.
  }
}

/** Per-tab id: two tabs in one browser are two separate targets. */
export function newDeviceId(): string {
  return randomId(16);
}
