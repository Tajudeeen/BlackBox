"use client";

import { useEncrypt } from "@zama-fhe/react-sdk";
import { useEffect, useState } from "react";
import { bytesToHex } from "viem";
import { useAccount, useWaitForTransactionReceipt, useWriteContract } from "wagmi";

import { BLACKBOX_MARKET_ABI, MARKET_CONTRACT_ADDRESS } from "@/lib/contract";
import { outcomeLabels } from "@/lib/marketMeta";

// Well within euint64's range and Number.MAX_SAFE_INTEGER — every value
// that passes this check converts to BigInt without precision loss.
const MAX_PREDICTION_AMOUNT = 1_000_000_000_000;

export function PredictionForm({
  marketId,
  eventType,
  outcomeCount,
  onSubmitted,
}: {
  marketId: bigint;
  eventType: string;
  outcomeCount: number;
  onSubmitted: () => void;
}) {
  const { address } = useAccount();
  const encrypt = useEncrypt();
  const { writeContractAsync, data: txHash, isPending: isWriting, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: txHash });

  const [selectedOutcome, setSelectedOutcome] = useState<number | null>(null);
  const [amountInput, setAmountInput] = useState("");
  const [stage, setStage] = useState<"idle" | "encrypting" | "submitting">("idle");
  const [error, setError] = useState<string | null>(null);

  const labels = outcomeLabels(eventType, outcomeCount);
  const parsedAmount = Number(amountInput);
  const amountValidationError =
    amountInput.trim() === ""
      ? null
      : !Number.isFinite(parsedAmount) || parsedAmount <= 0
        ? "Enter a positive whole number."
        : parsedAmount > MAX_PREDICTION_AMOUNT
          ? `Maximum is ${MAX_PREDICTION_AMOUNT.toLocaleString()} units.`
          : null;
  const amount =
    amountValidationError === null && amountInput.trim() !== "" ? Math.floor(parsedAmount) : null;

  useEffect(() => {
    if (isConfirmed) onSubmitted();
  }, [isConfirmed, onSubmitted]);

  const handleSubmit = async () => {
    setError(null);
    if (!address || !MARKET_CONTRACT_ADDRESS || selectedOutcome === null || amount === null) return;

    try {
      setStage("encrypting");
      const encrypted = await encrypt.mutateAsync({
        values: [
          { value: BigInt(selectedOutcome), type: "euint8" },
          { value: BigInt(amount), type: "euint64" },
        ],
        contractAddress: MARKET_CONTRACT_ADDRESS,
        userAddress: address,
      });

      setStage("submitting");
      await writeContractAsync({
        address: MARKET_CONTRACT_ADDRESS,
        abi: BLACKBOX_MARKET_ABI,
        functionName: "submitPrediction",
        args: [
          marketId,
          bytesToHex(encrypted.handles[0]!),
          bytesToHex(encrypted.handles[1]!),
          bytesToHex(encrypted.inputProof),
        ],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
      setStage("idle");
    }
  };

  const isBusy = stage !== "idle" || isWriting || isConfirming;

  const submitLabel = () => {
    if (stage === "encrypting") return "Encrypting in browser…";
    if (stage === "submitting" || isWriting) return "Sending transaction…";
    if (isConfirming) return "Waiting for confirmation…";
    return "Encrypt and submit";
  };

  return (
    <div className="rounded-md border border-bb-line bg-bb-black-soft p-5">
      <h2 className="text-sm font-medium uppercase tracking-wide text-bb-text-dim">Submit a prediction</h2>
      <p className="mt-1 text-xs text-bb-text-dim">
        Your choice and amount are encrypted before they leave your browser.
      </p>

      <p className="mt-4 text-xs uppercase tracking-wide text-bb-text-dim">Pick an outcome</p>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {labels.map((label, index) => (
          <button
            key={label}
            type="button"
            onClick={() => setSelectedOutcome(index)}
            disabled={isBusy}
            className={`w-full rounded-md border px-4 py-3 text-left text-sm transition-colors ${
              selectedOutcome === index
                ? "border-bb-yellow text-bb-text"
                : "border-bb-line text-bb-text-dim hover:border-bb-yellow-dim"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <label className="mt-4 block text-xs uppercase tracking-wide text-bb-text-dim">
        Prediction amount
        <span className="mt-0.5 block normal-case text-bb-text-dim">
          Units — your private stake in this outcome
        </span>
        <input
          type="number"
          min={1}
          max={MAX_PREDICTION_AMOUNT}
          step={1}
          value={amountInput}
          onChange={(e) => setAmountInput(e.target.value)}
          disabled={isBusy}
          placeholder="e.g. 100"
          className="mt-2 w-full rounded-md border border-bb-line bg-bb-black px-4 py-3 text-sm text-bb-text outline-none focus:border-bb-yellow-dim"
        />
      </label>
      {amountValidationError && <p className="mt-2 text-xs text-red-400">{amountValidationError}</p>}

      {!address && (
        <p className="mt-4 text-xs text-bb-text-dim">Connect your wallet above to submit a prediction.</p>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!address || selectedOutcome === null || amount === null || isBusy}
        className="mt-4 w-full rounded-md bg-bb-yellow px-4 py-3 text-sm font-medium text-bb-black transition-opacity disabled:opacity-40"
      >
        {submitLabel()}
      </button>

      {(error || writeError) && (
        <p className="mt-3 text-xs text-red-400">{error ?? writeError?.message}</p>
      )}
    </div>
  );
}
