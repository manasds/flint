import { ImageResponse } from "next/og";

export const ogAlt =
  "Flint: free peer-to-peer file transfer in your browser over WebRTC. No signup, no uploads.";
export const ogSize = { width: 1200, height: 630 };

/** Shared 1200×630 social card for Open Graph and Twitter. */
export function renderOgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "#0b0b0b",
          color: "#ededed",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: "transparent",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="40" height="40" viewBox="0 0 24 24" fill="#ededed">
              <path d="M13.5 2 5 13.5h6L9.5 22 19 9.5h-6.2L13.5 2Z" />
            </svg>
          </div>
          <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: -1 }}>Flint</div>
        </div>
        <div style={{ marginTop: 36, fontSize: 68, fontWeight: 700, lineHeight: 1.1, letterSpacing: -2 }}>
          Peer-to-peer file transfer in your browser
        </div>
        <div style={{ marginTop: 28, fontSize: 32, color: "#a0a0a0" }}>
          WebRTC · No signup · No uploads to a server
        </div>
        <div style={{ marginTop: "auto", fontSize: 26, color: "#6b6b6b" }}>flint.manasbuilds.me</div>
      </div>
    ),
    ogSize,
  );
}
