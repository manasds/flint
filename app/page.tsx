import type { Metadata } from "next";
import SendFiles from "@/components/SendFiles";
import { ChevronIcon } from "@/components/ui";
import { AUTHOR, FAQ, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";

// The root layout is shared with /r/[id]; only the landing page is canonical.
export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "Any (web browser)",
    browserRequirements: "Requires a browser with WebRTC support.",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    author: { "@type": "Person", name: AUTHOR.name, url: AUTHOR.url },
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map(({ question, answer }) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: { "@type": "Answer", text: answer },
    })),
  },
];

const STEPS = [
  {
    title: "Signaling",
    body: (
      <>
        A small signaling server passes connection details between the two browsers over a
        WebSocket: the session description (offer and answer) and network candidates. It never
        receives any of your file.
      </>
    ),
  },
  {
    title: "Finding a route",
    body: (
      <>
        Each browser asks a public STUN server for its public address, so the two devices can
        reach each other even behind home routers. Flint doesn&apos;t run a TURN relay, so
        networks that block every direct connection won&apos;t work.
      </>
    ),
  },
  {
    title: "Transfer",
    body: (
      <>
        Files stream in chunks over several data channels at once. The receiver writes them to
        disk and confirms each one, so the sender only shows &ldquo;Delivered&rdquo; once
        everything is saved.
      </>
    ),
  },
];

const FEATURES = [
  {
    title: "P2P file transfer, no signup.",
    body: "No account, no login, no email address.",
  },
  {
    title: "Send files without uploading.",
    body: "Your file goes straight to the other device and is never stored on a server.",
  },
  {
    title: "Files and folders.",
    body: "Send many files or a whole folder over one link. The receiver previews names and sizes, then accepts or declines.",
  },
  {
    title: "Share by link or QR code.",
    body: "Copy the link, or scan the QR code to move a file from your laptop to your phone.",
  },
  {
    title: "Any file type.",
    body: "Documents, photos, videos, archives: Flint sends the raw bytes, unchanged.",
  },
  {
    title: "Encrypted in transit.",
    body: "Every WebRTC data channel is encrypted with DTLS, negotiated by the two browsers.",
  },
];

export default function Home() {
  return (
    <main className="flex flex-1 flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />

      <section className="flex flex-col items-center gap-10 px-4 pt-14 pb-20 sm:px-6 sm:pt-20">
        <div className="max-w-2xl text-center">
          <h1 className="text-3xl leading-tight font-semibold tracking-tight text-balance text-fg sm:text-[2.75rem]">
            Peer-to-peer file sharing in your browser
          </h1>
          <p className="mx-auto mt-4 max-w-lg text-base text-pretty text-muted">
            Send files without uploading them anywhere. Flint uses WebRTC to move your file
            straight to the other device. Free, no signup, no size limit.
          </p>
        </div>
        <SendFiles />
      </section>

      <div className="border-t border-line">
        <article className="mx-auto w-full max-w-2xl px-4 py-16 sm:px-6 sm:py-20">
          <Section title="How WebRTC file transfer works">
            <p className="text-muted">
              Flint is a P2P file transfer tool that runs entirely in your browser. Pick files or a
              folder and Flint creates a one-time link and QR code. The other person opens it, sees
              the file names and sizes, and accepts. The two browsers then connect directly and the
              files travel between them over <strong className="font-medium text-fg">WebRTC data channels</strong>.
            </p>
            <ol className="mt-6 divide-y divide-line border-y border-line">
              {STEPS.map((step, i) => (
                <li key={step.title} className="grid gap-1 py-4 sm:grid-cols-[2.5rem_1fr]">
                  <span className="font-mono text-sm text-subtle">0{i + 1}</span>
                  <div>
                    <h3 className="font-medium text-fg">{step.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Section>

          <Section title="Features">
            <ul className="grid gap-x-10 gap-y-5 sm:grid-cols-2">
              {FEATURES.map(({ title, body }) => (
                <li key={title}>
                  <h3 className="font-medium text-fg">{title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted">{body}</p>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Is it secure?">
            <p className="leading-relaxed text-muted">
              Every WebRTC data channel is encrypted with DTLS. This is built into the WebRTC
              standard and can&apos;t be switched off, and the encryption keys are negotiated by the
              two browsers. The signaling server only relays connection setup messages; your files
              never pass through it and never sit on a server. Nothing downloads until the receiver
              accepts. Each link serves one receiver and stops working when you close the tab, so
              share it only with the person it&apos;s for.
            </p>
          </Section>

          <Section title="Frequently asked questions">
            <div className="divide-y divide-line border-y border-line">
              {FAQ.map(({ question, answer }) => (
                <details key={question} className="group">
                  <summary className="flex cursor-pointer items-center justify-between gap-4 py-4 font-medium text-fg">
                    <h3>{question}</h3>
                    <ChevronIcon className="size-4 shrink-0 text-subtle transition-transform group-open:rotate-180" />
                  </summary>
                  <p className="pb-4 text-sm leading-relaxed text-muted">{answer}</p>
                </details>
              ))}
            </div>
          </Section>
        </article>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-16 first:mt-0">
      <h2 className="mb-4 text-xl font-semibold tracking-tight text-fg">{title}</h2>
      {children}
    </section>
  );
}
