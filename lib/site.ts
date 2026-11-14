export const SITE_URL = "https://flint.manasbuilds.me";
export const SITE_NAME = "Flint";
export const SITE_TITLE = "Flint – Free Peer-to-Peer File Transfer in Your Browser (WebRTC)";
export const SITE_DESCRIPTION =
  "Send files directly between browsers over WebRTC. No signup, no uploads to a server – drag, drop and share a link or QR code.";

export const AUTHOR = {
  name: "Manas Dubey",
  url: "https://www.manasbuilds.me",
  projectUrl: "https://www.manasbuilds.me/projects/flint",
};

/**
 * Single source for the visible FAQ and the FAQPage JSON-LD.
 * Keep answers true to the code: receivers write to disk (folder / OPFS,
 * memory only as a fallback), resume after drops while both tabs stay open,
 * STUN only by default (no TURN relay), one receiver per link.
 */
export const FAQ: { question: string; answer: string }[] = [
  {
    question: "Is there a file size limit?",
    answer:
      "Flint doesn't set one. Files are written to disk as they arrive: Chrome and Edge can save straight into a folder you pick, and other browsers stream into the browser's own storage first. Free disk space on the receiving device is the practical limit; very old browsers fall back to memory.",
  },
  {
    question: "Do both devices need to be online at the same time?",
    answer:
      "Yes. Nothing is stored on a server, so keep the sender's tab open until it shows Delivered. If the connection drops briefly, Flint reconnects and resumes where it stopped, as long as both tabs stay open.",
  },
  {
    question: "Can I send several files or a whole folder?",
    answer:
      "Yes. Drop several files or a folder and everything goes over one link. The receiver sees every file name and size and chooses to accept or decline before anything downloads.",
  },
  {
    question: "Does it work on mobile?",
    answer:
      "Yes, in modern mobile browsers with WebRTC support, such as Chrome and Safari. Scan the QR code to open the link, and keep the tab in the foreground, since mobile browsers may pause background tabs.",
  },
  {
    question: "Can I send to my other device without a link or QR code?",
    answer:
      "Yes, if both are on the same network. Open Flint on both devices and each shows the other under Send to a nearby device. Flint finds them by their shared public internet address, so devices on a VPN or using different connections (for example Wi-Fi and mobile data) won't see each other; use the link instead. Anyone else behind the same address, like on shared office Wi-Fi, can also see your device name, and nothing downloads until you accept.",
  },
  {
    question: "Can several people download from the same link?",
    answer:
      "No. Each link connects one sender to one receiver. Once someone has joined, anyone else who opens the link is turned away. To send to another person, create a new link.",
  },
  {
    question: "Why won't my devices connect?",
    answer:
      "Flint finds a direct route using a public STUN server and doesn't run a TURN relay, so networks that block direct connections, like some corporate or mobile-carrier networks, may fail. Try another network, such as home Wi-Fi.",
  },
];
