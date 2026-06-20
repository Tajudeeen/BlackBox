import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-24">
      <div className="space-y-3">
        <p className="text-xs uppercase tracking-[0.2em] text-bb-yellow">Zama FHE Developer Program</p>
        <h1 className="text-4xl font-medium tracking-tight text-bb-text sm:text-5xl">
          The first confidential prediction market powered by FHE.
        </h1>
        <p className="max-w-xl text-bb-text-dim">
          BLACKBOX keeps every position private. Your prediction, your prediction amount, and your outcome
          share stay encrypted end to end — visible only to you, never to other participants, never to the
          protocol, never to the chain itself.
        </p>
      </div>

      <div className="bb-gradient-rule" />

      <div className="flex flex-wrap gap-4">
        <Link
          href="/markets"
          className="rounded-md bg-bb-yellow px-5 py-3 text-sm font-medium text-bb-black transition-opacity hover:opacity-90"
        >
          View markets
        </Link>
        <Link
          href="https://docs.zama.ai"
          className="rounded-md border border-bb-line px-5 py-3 text-sm text-bb-text-dim transition-colors hover:border-bb-yellow-dim hover:text-bb-text"
        >
          How Zama FHE works
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatusCard label="1" title="Connect & encrypt" body="Pick an outcome and an amount. Both are encrypted in your browser before anything leaves it." />
        <StatusCard label="2" title="Submit privately" body="The transaction carries only ciphertext. The contract computes on encrypted values directly." />
        <StatusCard label="3" title="Claim privately" body="After resolution, only you can decrypt your own outcome share." />
      </div>
    </main>
  );
}

function StatusCard({ label, title, body }: { label: string; title: string; body: string }) {
  return (
    <div className="rounded-md border border-bb-line bg-bb-black-soft p-4">
      <p className="text-xs uppercase tracking-wide text-bb-yellow">Step {label}</p>
      <p className="mt-1 text-sm font-medium text-bb-text">{title}</p>
      <p className="mt-1 text-xs text-bb-text-dim">{body}</p>
    </div>
  );
}
