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
          background: "linear-gradient(135deg, #18181b 0%, #312e81 100%)",
          color: "white",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{ width: 28, height: 28, borderRadius: 14, background: "#818cf8", display: "flex" }}
          />
          <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: -1 }}>Flint</div>
        </div>
        <div style={{ marginTop: 36, fontSize: 68, fontWeight: 700, lineHeight: 1.1, letterSpacing: -2 }}>
          Peer-to-peer file transfer in your browser
        </div>
        <div style={{ marginTop: 28, fontSize: 32, color: "#c7d2fe" }}>
          WebRTC · No signup · No uploads to a server
        </div>
        <div style={{ marginTop: "auto", fontSize: 26, color: "#a1a1aa" }}>flint.manasbuilds.me</div>
      </div>
    ),
    ogSize,
  );
}
