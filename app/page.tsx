import type { Metadata } from "next";
import SendFiles from "@/components/SendFiles";
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

export default function Home() {
  return (
    <main className="flex flex-1 flex-col bg-gradient-to-b from-zinc-50 to-zinc-100 dark:from-zinc-950 dark:to-black">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />

      <section className="flex min-h-[85vh] flex-col items-center justify-center gap-8 px-4 py-12 sm:px-6">
        <div className="max-w-xl text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-50">
            Peer-to-peer file sharing in your browser
          </h1>
          <p className="mt-3 text-sm text-zinc-600 sm:text-base dark:text-zinc-400">
            Send files without uploading them anywhere. Flint uses WebRTC to move your file
            straight to the other device. Free, with no signup.
          </p>
        </div>
        <SendFiles />
      </section>

      <article className="mx-auto w-full max-w-2xl px-4 pb-16 text-zinc-700 sm:px-6 dark:text-zinc-300">
        <Section title="How WebRTC file transfer works">
          <p>
            Flint is a P2P file transfer tool that runs entirely in your browser. Pick files or a
            folder and Flint creates a one-time link and QR code. The other person opens it, sees
            the file names and sizes, and accepts. The two browsers then connect directly and the
            files travel between them over <strong>WebRTC data channels</strong>.
          </p>
          <ol className="mt-3 list-decimal space-y-2 pl-5">
            <li>
              <strong>Signaling.</strong> A small signaling server passes connection details
              between the two browsers over a WebSocket: the session description (offer and
              answer) and network candidates. It never receives any of your file.
            </li>
            <li>
              <strong>Finding a route.</strong> Each browser asks a public STUN server for its
              public address, so the two devices can reach each other even behind home routers.
              Flint doesn&apos;t run a TURN relay, so networks that block every direct connection
              won&apos;t work.
            </li>
            <li>
              <strong>Transfer.</strong> Files stream in chunks over several data channels at
              once. The receiver writes them to disk and confirms each one, so the sender only
              shows &ldquo;Delivered&rdquo; once everything is saved.
            </li>
          </ol>
        </Section>

        <Section title="Features">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>P2P file transfer, no signup.</strong> No account, no login, no email
              address.
            </li>
            <li>
              <strong>Send files without uploading.</strong> Your file goes straight to the
              other device and is never stored on a server.
            </li>
            <li>
              <strong>Files and folders.</strong> Send many files or a whole folder over one
              link. The receiver previews names and sizes, then accepts or declines.
            </li>
            <li>
              <strong>Share by link or QR code.</strong> Copy the link, or scan the QR code to
              move a file from your laptop to your phone.
            </li>
            <li>
              <strong>Any file type.</strong> Documents, photos, videos, archives: Flint sends
              the raw bytes, unchanged.
            </li>
          </ul>
        </Section>

        <Section title="Is it secure?">
          <p>
            Every WebRTC data channel is encrypted with DTLS. This is built into the WebRTC
            standard and can&apos;t be switched off, and the encryption keys are negotiated by the
            two browsers. The signaling server only relays connection setup messages; your files
            never pass through it and never sit on a server. Nothing downloads until the receiver
            accepts. Each link serves one receiver
            and stops working when you close the tab, so share it only with the person it&apos;s for.
          </p>
        </Section>

        <Section title="Frequently asked questions">
          <dl className="space-y-5">
            {FAQ.map(({ question, answer }) => (
              <div key={question}>
                <dt className="font-medium text-zinc-900 dark:text-zinc-100">{question}</dt>
                <dd className="mt-1">{answer}</dd>
              </div>
            ))}
          </dl>
        </Section>
      </article>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-12 text-sm leading-relaxed sm:text-base">
      <h2 className="mb-3 text-lg font-semibold text-zinc-900 sm:text-xl dark:text-zinc-50">
        {title}
      </h2>
      {children}
    </section>
  );
}
