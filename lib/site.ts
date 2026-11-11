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
 * Keep answers true to the code: one file per link, the receiver assembles
 * the file in memory, STUN only (no TURN relay), one receiver per link.
 */
export const FAQ: { question: string; answer: string }[] = [
  {
    question: "Is there a file size limit?",
    answer:
      "Flint doesn't set a size limit. The practical limit is the receiving device: the browser holds the incoming file in memory until it's ready to save, so very large files need a device with enough free memory, and both tabs have to stay open until the transfer finishes.",
  },
  {
    question: "Do both devices need to be online at the same time?",
    answer:
      "Yes. Nothing is stored on a server, so the file can only travel while both browsers are connected. Keep the sender's tab open until the receiver has the file; closing it ends the link.",
  },
  {
    question: "Does it work on mobile?",
    answer:
      "Yes, in modern mobile browsers that support WebRTC, such as Chrome and Safari. Scan the QR code with your phone to open the link. Keep the tab in the foreground during the transfer, because mobile browsers may pause background tabs.",
  },
  {
    question: "Do I need an account?",
    answer:
      "No. There is no signup and no login. Pick a file, share the link, and the transfer starts when the other person opens it.",
  },
  {
    question: "Can several people download from the same link?",
    answer:
      "No. Each link connects one sender to one receiver. Once someone has joined, anyone else who opens the link is turned away. To send the file to another person, share it again to get a new link.",
  },
  {
    question: "Why won't my devices connect?",
    answer:
      "Flint uses a public STUN server to find a direct route between the two browsers and doesn't run a TURN relay. Some strict corporate or mobile-carrier networks block direct connections; if that happens, try a different network, such as home Wi-Fi.",
  },
];
