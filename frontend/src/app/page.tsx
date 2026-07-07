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
          BLACKBOX keeps every position private. Your prediction, your amount, and your outcome stay
          encrypted — visible only to you, never to other participants, never to the chain.
        </p>
      </div>

      <div className="bb-gradient-rule" />

      <div className="flex flex-wrap gap-4">
        <Link
          href="/markets"
          className="rounded-md bg-bb-yellow px-5 py-3 text-sm font-medium text-bb-black transition-opacity hover:opacity-90"
        >
          View open markets
        </Link>
        <Link
          href="https://docs.zama.ai"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md border border-bb-line px-5 py-3 text-sm text-bb-text-dim transition-colors hover:border-bb-yellow-dim hover:text-bb-text"
        >
          How Zama FHE works
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StepCard
          step="1"
          title="Connect your wallet"
          body="Connect on Sepolia testnet. Your wallet signs encryption requests — no gas needed for that step."
        />
        <StepCard
          step="2"
          title="Pick and encrypt"
          body="Choose an outcome and enter an amount. Both are encrypted in your browser before the transaction is sent."
        />
        <StepCard
          step="3"
          title="Claim privately"
          body="After the market resolves, only you can decrypt your outcome. The contract never sees what you chose."
        />
      </div>

      <div className="rounded-md border border-bb-line bg-bb-black-soft p-4">
        <p className="text-xs text-bb-text-dim">
          <span className="font-medium text-bb-text">How it works under the hood:</span> predictions go on
          chain as ciphertext. The contract runs settlement logic directly on encrypted values using Zama
          FHE — no trusted intermediary decrypts anything to compute your payout.
        </p>
      </div>
    </main>
  );
}

function StepCard({ step, title, body }: { step: string; title: string; body: string }) {
  return (
    <div className="rounded-md border border-bb-line bg-bb-black-soft p-4">
      <p className="text-xs uppercase tracking-wide text-bb-yellow">Step {step}</p>
      <p className="mt-1 text-sm font-medium text-bb-text">{title}</p>
      <p className="mt-1 text-xs text-bb-text-dim">{body}</p>
    </div>
  );
}
