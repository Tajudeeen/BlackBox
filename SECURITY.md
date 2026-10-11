# Security boundaries

This project is a testnet prototype. No independent audit or formal verification is claimed. Do not use real-value assets with this implementation.

See [PROTOCOL.md](docs/PROTOCOL.md) for the operator's seed foreknowledge/grinding power, pooled insolvency risk, metadata visibility and FHE/relayer trust assumptions.

The current tree removes credential-like values previously present in `backend/.env.example`. Treat those historical credentials as exposed and rotate/revoke them with their providers. Deleting them from the current file does not revoke them or remove git history. No exposed credential is needed for local checks.

The meaningful safety changes in v2 are enforced result derivation, bounded encrypted multiplication, actual transfer accounting, retryable debt, immutable creation fields, timeout cancellation and durable backend recovery. Their tests are executable evidence for the tested behavior, not evidence that all attacks are impossible.

Report a suspected vulnerability privately to the repository owner. Avoid posting keys, seed secrets, private wallet values or exploit transactions in public issues.
