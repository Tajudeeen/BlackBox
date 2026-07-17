// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import {FHE, ebool, euint8, euint64, externalEuint8, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";

/// @title BlackboxMarket
/// @author Deeen_Codes
/// @notice Confidential prediction market protocol. A market has a fixed
/// number of outcomes and a fixed, public payout multiplier per outcome,
/// set by the operator when the market is created. Participants submit an
/// encrypted outcome choice and an encrypted prediction amount. Nothing
/// about a participant's prediction, amount, or resulting outcome share is
/// ever decrypted on chain -- only the participant who submitted it can
/// decrypt it off chain, via the Zama relayer, because only they hold ACL
/// permission on those ciphertext handles.
///
/// @dev Design notes (read before extending this contract):
///
/// 1. Fixed odds, not pari-mutuel. A pari-mutuel design (splitting a shared
///    pool among winners in proportion to their amount) needs to divide by
///    the sum of all winning amounts, and FHEVM only supports dividing an
///    encrypted value by a plaintext divisor (FHE.div(euint64, uint64)) --
///    dividing one encrypted value by another encrypted value is not
///    available. Computing a pari-mutuel share would therefore require
///    revealing the aggregate winning amount, which defeats the goal of
///    keeping every individual amount private. Fixed odds avoids this
///    entirely: the payout for a correct prediction is simply
///    amount * oddsForThatOutcome, which only ever multiplies and divides
///    by values that are already known (the odds are public) or already
///    encrypted (the amount), with no encrypted/encrypted division.
///
/// 2. No on-chain enforcement of "amount > 0" or "outcome index in range".
///    Both values are encrypted at submission time, so the contract cannot
///    branch on them without revealing them. This is intentionally safe in
///    both cases: an out-of-range outcome index can never equal the
///    eventual plaintext winningOutcome, so FHE.eq always evaluates to
///    false for it and the resulting outcome share is always zero. A zero
///    amount likewise always produces a zero outcome share. Neither case
///    can be used to drain funds or corrupt another participant's state --
///    the only cost is wasted gas by the participant who did it.
///
/// 3. Overflow in FHE.mul(amount, oddsBps) is not checked, for the same
///    reason the reference FHECounter example does not check overflow on
///    encrypted addition: the operands cannot be range-checked without
///    decrypting them. The operator-supplied odds are bounded by
///    MAX_ODDS_BPS to keep the plaintext side of the multiplication sane;
///    the encrypted amount is bounded only by the euint64 type itself.
///    A production deployment that custodies real value should pair this
///    contract with a confidential token whose mint/transfer path enforces
///    a balance check, rather than relying on this contract alone.
///
/// 4. Prediction amounts and outcome shares now move real value, via
///    `BlackboxCoin` (an OpenZeppelin ERC-7984 confidential token -- see
///    that contract's own NatSpec for what "confidential token" means
///    here and its provenance). `submitPrediction` escrows the caller's
///    encrypted amount into this contract's own token balance;
///    `claim` pays the resulting outcome share back out of that same
///    balance. Both moves are confidential end to end: the token amounts
///    involved are never decrypted on chain, same as everything else in
///    this contract. See notes 7 and 8 below for what this integration
///    requires from callers and what it does not (yet) protect against.
///
/// 5. Encrypted-input replay, reviewed during the Phase 5 security pass
///    and re-examined here now that design note 4's value custody exists,
///    per this note's own original instruction to do so.
///    `submitPrediction`'s `inputProof` is verified by the FHEVM
///    coprocessor against `msg.sender` (traced through
///    `FHE.fromExternal` -> `Impl.verify` ->
///    `IFHEVMExecutor.verifyInput(handle, msg.sender, proof, type)` in the
///    installed fhevm-solidity library) but NOT against `marketId` --
///    the coprocessor has no concept of `marketId` at all, since that is
///    purely an application-level idea. Two consequences, both checked: a)
///    one user cannot submit using a handle+proof generated for a
///    different address, because the coprocessor binds the proof to the
///    address that calls it; b) the same user CAN reuse their own
///    handle+proof across multiple markets in this contract, since nothing
///    binds a proof to one specific `marketId`. (b) remains non-exploitable
///    now that real value is involved: each `submitPrediction` call
///    independently escrows from the caller's actual on-chain token
///    balance via `confidentialTransferFrom`, which enforces sufficient
///    balance itself, per call. Reusing the same handle+proof for a
///    second market does not re-spend already-escrowed tokens or double-
///    count anything -- it independently escrows the same plaintext
///    amount a second time, debited from the caller's real balance a
///    second time, same as if they had typed the same number into two
///    separate transactions. There is no shared pot being double-counted
///    across the two calls. `AlreadySubmitted` still applies independently
///    per (marketId, address) regardless.
///
/// 6. Participation metadata is intentionally public, not a leak. Anyone
///    can call `getPosition(marketId, anyAddress)` and read back whether
///    that address has `submitted` or `claimed` -- those two booleans,
///    and only those two, are not access-controlled. This is deliberate
///    and matches the backend's own `activity_log` table (see
///    backend/schema.sql), which records participant addresses publicly
///    by design. What stays confidential is the prediction itself, the
///    amount, and the resulting share -- not the fact of participation.
///    If a future version of this product wants to hide participation
///    too, that is a materially different privacy goal requiring a
///    different access pattern for this function, not a bug fix.
///
/// 7. Using the token requires a one-time operator approval. `token`'s
///    ERC-7984 `confidentialTransferFrom` requires the caller (this
///    contract) to be an approved operator for whichever address it is
///    moving tokens from -- that is a property of the ERC-7984 standard,
///    not something this contract can bypass or automate on a user's
///    behalf. In practice: before a participant's first `submitPrediction`
///    call, their wallet must call `token.setOperator(address(this), until)`
///    once. The frontend handles prompting for this (see
///    `frontend/src/components/prediction-form.tsx`); a participant who
///    submits a prediction transaction without having done this will see
///    it revert with the token's own `ERC7984UnauthorizedCaller` error,
///    not a BLACKBOX-specific one.
///
/// 8. Solvency is pooled across all markets, not reserved per market --
///    a known, deliberate limitation, not an oversight. This contract
///    holds one aggregate token balance for every market it has ever
///    created; `submitPrediction` adds to that balance and `claim` pays
///    out of it, but nothing earmarks a given market's escrowed amounts
///    for that market's own eventual payouts. This is exactly how a real
///    fixed-odds sportsbook's bankroll works in aggregate -- money in
///    from losing predictions funds payouts to winning ones, across the
///    whole book, not ring-fenced bet-by-bet -- and is fine as long as
///    odds are set sensibly and the aggregate stays solvent. What this
///    contract does NOT do is verify that solvency: there is no reserve
///    requirement, no per-market exposure cap, and no check that the
///    contract's token balance can actually cover every unclaimed
///    outstanding `outcomeShare` before allowing a new market to be
///    created or a new prediction to be submitted.
///
///    The concrete consequence, confirmed by
///    `test/BlackboxMarket.ts`'s "pays nothing when the market's pooled
///    balance cannot cover a winner's payout" case: if the pool is
///    insufficient at claim time, `TOKEN.confidentialTransfer` fails
///    safely (per `FHESafeMath`'s try-semantics) and silently moves
///    nothing -- but `claim` has already set `position.claimed = true`
///    and stored the fully-computed `outcomeShare` before making that
///    transfer call. The participant is left permanently unable to
///    retry (`AlreadyClaimed` blocks any future attempt) despite never
///    having actually received their payout, and `getPosition` will
///    forever report a claim that looks successful.
///
///    This isn't sloppiness in `claim`'s ordering -- it reflects a real
///    constraint of confidential computation: `TOKEN.confidentialTransfer`
///    returns an encrypted `euint64` for how much actually moved, and
///    there is no way to branch claim's control flow (e.g. "only mark
///    claimed if the full amount transferred") on that encrypted result
///    within the same transaction. Doing so would require decrypting it
///    on chain, which defeats the entire point of using a confidential
///    token, or an asynchronous decrypt-then-confirm flow spanning
///    multiple transactions, which this contract does not implement.
///
///    On Sepolia testnet play money (see `BlackboxCoin`'s public faucet)
///    an unretrievable claim has no real financial consequence. A
///    deployment with real value at stake would need genuine reserve
///    accounting -- e.g. tracking each market's worst-case total payout
///    liability in plaintext at prediction-submission time, and refusing
///    new predictions once the pool can no longer cover it -- before this
///    class of silent, permanent, unpaid "successful" claim could be
///    ruled out. Add that before removing this note.
contract BlackboxMarket is ZamaEthereumConfig, Ownable {
    /// @notice Maximum number of outcomes a single market may have. Bounds
    /// the size of the per-market odds array and the cost of validating it
    /// in `createMarket`. `claim` no longer loops over outcomes (see its
    /// NatSpec), so this constant does not bound `claim`'s gas cost.
    uint8 public constant MAX_OUTCOMES = 8;

    /// @notice Maximum payout multiplier an operator may set for any single
    /// outcome, in basis points (1_000_000 = 100x).
    uint32 public constant MAX_ODDS_BPS = 1_000_000;

    /// @notice Maximum length, in bytes, for a market's eventType and label
    /// strings. `createMarket` is operator-only, so this is defense in
    /// depth rather than a response to an active threat: it keeps a
    /// compromised or misconfigured operator key from writing arbitrarily
    /// large strings that would make every `getMarket` call and every
    /// `MarketCreated` event needlessly expensive to read for every
    /// downstream consumer (the frontend, indexers, block explorers),
    /// indefinitely, for a cost the operator pays once.
    uint256 public constant MAX_STRING_LENGTH = 128;

    uint64 private constant BPS_DIVISOR = 10_000;

    struct Market {
        bool exists;
        bool resolved;
        uint8 outcomeCount;
        uint8 winningOutcome;
        uint64 closingTime;
        string eventType; // e.g. "virtual_football_winner"
        string label; // e.g. "BLACK FC vs GOLD FC -- Winner"
        uint32[] outcomeOddsBps; // payout multiplier per outcome, in basis points
    }

    struct Position {
        bool submitted;
        bool claimed;
        euint8 predictedOutcome;
        euint64 amount;
        euint64 outcomeShare;
    }

    /// @notice Address allowed to create and resolve markets. Kept separate
    /// from `owner` so the day-to-day simulation engine signer is not the
    /// same high-value key that controls contract ownership.
    address public operator;

    /// @notice The confidential token predictions are escrowed in and
    /// outcome shares are paid out of. See design notes 4, 7, and 8 above.
    /// Immutable: set once at deployment, never changeable afterward,
    /// removing "operator repoints the token mid-operation" as an
    /// attack surface entirely rather than gating it behind access control.
    IERC7984 public immutable TOKEN;

    /// @notice Id that will be assigned to the next market created.
    uint256 public nextMarketId;

    mapping(uint256 marketId => Market market) private _markets;
    mapping(uint256 marketId => mapping(address participant => Position position)) private _positions;

    /// @notice Emitted when a new market is created.
    /// @param marketId Id assigned to the new market.
    /// @param eventType Machine-readable generator tag for the market.
    /// @param label Human-readable market label.
    /// @param closingTime Unix timestamp after which predictions are no longer accepted.
    /// @param outcomeCount Number of possible outcomes for the market.
    event MarketCreated(
        uint256 indexed marketId,
        string eventType,
        string label,
        uint64 indexed closingTime,
        uint8 indexed outcomeCount
    );

    /// @notice Emitted when a participant submits a confidential prediction.
    /// @param marketId Market the prediction was submitted to.
    /// @param participant Address that submitted the prediction.
    event PredictionSubmitted(uint256 indexed marketId, address indexed participant);

    /// @notice Emitted when a market is resolved.
    /// @param marketId Market that was resolved.
    /// @param winningOutcome Index of the winning outcome.
    event MarketResolved(uint256 indexed marketId, uint8 indexed winningOutcome);

    /// @notice Emitted when a participant claims their outcome share.
    /// @param marketId Market the claim was made against.
    /// @param participant Address that claimed.
    event Claimed(uint256 indexed marketId, address indexed participant);

    /// @notice Emitted when the operator address is changed.
    /// @param previousOperator Previous operator address.
    /// @param newOperator New operator address.
    event OperatorUpdated(address indexed previousOperator, address indexed newOperator);

    error MarketDoesNotExist(uint256 marketId);
    error MarketAlreadyResolved(uint256 marketId);
    error MarketNotResolved(uint256 marketId);
    error MarketClosed(uint256 marketId);
    error MarketStillOpen(uint256 marketId);
    error InvalidOutcomeCount(uint8 provided);
    error InvalidOdds(uint32 provided);
    error InvalidClosingTime();
    error StringTooLong(uint256 providedLength, uint256 maxLength);
    error InvalidWinningOutcome(uint8 provided, uint8 outcomeCount);
    error AlreadySubmitted(uint256 marketId, address participant);
    error NoPosition(uint256 marketId, address participant);
    error AlreadyClaimed(uint256 marketId, address participant);
    error NotOperator(address caller);
    error ZeroAddress();

    modifier onlyOperator() {
        if (msg.sender != operator) revert NotOperator(msg.sender);
        _;
    }

    constructor(address tokenAddress) Ownable(msg.sender) {
        if (tokenAddress == address(0)) revert ZeroAddress();
        TOKEN = IERC7984(tokenAddress);
        operator = msg.sender;
        emit OperatorUpdated(address(0), msg.sender);
    }

    /// @notice Reassigns the operator address. Only the contract owner can
    /// do this. Lets the owner rotate the simulation engine's signing key
    /// without touching ownership of the contract itself.
    /// @param newOperator Address to designate as the new operator.
    function setOperator(address newOperator) external onlyOwner {
        if (newOperator == address(0)) revert ZeroAddress();
        address previous = operator;
        operator = newOperator;
        emit OperatorUpdated(previous, newOperator);
    }

    /// @notice Creates a new market with a fixed odds table.
    /// @param eventType Machine-readable generator tag, e.g. "virtual_football_winner".
    /// @param label Human-readable market label.
    /// @param closingTime Unix timestamp after which predictions are no longer accepted.
    /// @param outcomeOddsBps Payout multiplier per outcome index, in basis points (10_000 = 1x).
    /// @return marketId Id assigned to the newly created market.
    function createMarket(
        string calldata eventType,
        string calldata label,
        uint64 closingTime,
        uint32[] calldata outcomeOddsBps
    ) external onlyOperator returns (uint256 marketId) {
        if (!(closingTime > block.timestamp)) revert InvalidClosingTime();
        if (bytes(eventType).length > MAX_STRING_LENGTH) {
            revert StringTooLong(bytes(eventType).length, MAX_STRING_LENGTH);
        }
        if (bytes(label).length > MAX_STRING_LENGTH) {
            revert StringTooLong(bytes(label).length, MAX_STRING_LENGTH);
        }

        uint256 outcomeCount = outcomeOddsBps.length;
        if (outcomeCount < 2 || outcomeCount > MAX_OUTCOMES) {
            revert InvalidOutcomeCount(uint8(outcomeCount));
        }

        for (uint256 i = 0; i < outcomeCount; ++i) {
            uint32 odds = outcomeOddsBps[i];
            if (odds == 0 || odds > MAX_ODDS_BPS) revert InvalidOdds(odds);
        }

        marketId = nextMarketId;
        ++nextMarketId;

        Market storage market = _markets[marketId];
        market.exists = true;
        market.outcomeCount = uint8(outcomeCount);
        market.closingTime = closingTime;
        market.eventType = eventType;
        market.label = label;
        market.outcomeOddsBps = outcomeOddsBps;

        emit MarketCreated(marketId, eventType, label, closingTime, uint8(outcomeCount));
    }

    /// @notice Submits a confidential prediction. `encryptedOutcome` and
    /// `encryptedAmount` must be created together as one encrypted input
    /// batch (see the Zama relayer SDK's `createEncryptedInput`), so they
    /// share a single `inputProof`.
    ///
    /// Escrows `encryptedAmount` from the caller's confidential token
    /// balance into this contract via `TOKEN.confidentialTransferFrom`.
    /// Requires the caller to have already approved this contract as an
    /// ERC-7984 operator on `TOKEN` (see design note 7) -- without that,
    /// this call reverts with the token's own `ERC7984UnauthorizedCaller`
    /// error, not a BLACKBOX-specific one.
    /// @param marketId Market to submit a prediction to.
    /// @param encryptedOutcome Encrypted outcome index handle.
    /// @param encryptedAmount Encrypted prediction amount handle.
    /// @param inputProof Proof covering both encrypted handles.
    function submitPrediction(
        uint256 marketId,
        externalEuint8 encryptedOutcome,
        externalEuint64 encryptedAmount,
        bytes calldata inputProof
    ) external {
        Market storage market = _markets[marketId];
        if (!market.exists) revert MarketDoesNotExist(marketId);
        if (!(block.timestamp < market.closingTime)) revert MarketClosed(marketId);

        Position storage position = _positions[marketId][msg.sender];
        if (position.submitted) revert AlreadySubmitted(marketId, msg.sender);

        euint8 outcome = FHE.fromExternal(encryptedOutcome, inputProof);
        euint64 amount = FHE.fromExternal(encryptedAmount, inputProof);

        position.submitted = true;
        position.predictedOutcome = outcome;
        position.amount = amount;

        FHE.allowThis(outcome);
        FHE.allow(outcome, msg.sender);
        FHE.allowThis(amount);
        FHE.allow(amount, msg.sender);

        // Escrow the prediction amount. Requires FHE.allowThis(amount)
        // above so this contract can pass the handle to the token call,
        // AND FHE.allow(amount, address(TOKEN)) here so BlackboxCoin's own
        // internal balance-sufficiency check (FHE.ge inside its transfer
        // logic) can operate on the handle too -- FHE ACL permissions are
        // scoped per contract execution context, not per external call
        // chain, so BlackboxMarket already having permission does not
        // extend it to BlackboxCoin's own code once execution moves there.
        FHE.allow(amount, address(TOKEN));
        TOKEN.confidentialTransferFrom(msg.sender, address(this), amount);

        emit PredictionSubmitted(marketId, msg.sender);
    }

    /// @notice Resolves a market with the actual outcome. The outcome
    /// itself is a public fact about the underlying event (e.g. which team
    /// won a simulated match) -- it is only individual predictions and
    /// amounts that stay confidential.
    ///
    /// @dev Centralization note: this is a single trusted-operator call
    /// with no dispute window, no challenge period, and no on-chain check
    /// that the submitted outcome is correct -- the contract has no way to
    /// independently verify a real-world (or simulated) event outcome, so
    /// it does not try to. Confidentiality of individual predictions does
    /// not depend on the operator's honesty (see `submitPrediction`'s ACL
    /// grants), but the *correctness* of every claim does: a malicious or
    /// compromised operator key can resolve any market to any outcome,
    /// once. The off-chain commit-reveal randomness model in the backend
    /// (see backend/src/generators/virtualFootball/randomness.ts) makes
    /// the operator's choice independently checkable after the fact for
    /// the specific virtual-football generator, but this contract is
    /// generator-agnostic and enforces none of that itself. A production
    /// deployment with real value at stake should not treat a single
    /// operator key as sufficient; a timelock, multisig operator, or
    /// optimistic dispute window are the natural next steps.
    /// @param marketId Market to resolve.
    /// @param winningOutcome Index of the outcome that occurred.
    function resolveMarket(uint256 marketId, uint8 winningOutcome) external onlyOperator {
        Market storage market = _markets[marketId];
        if (!market.exists) revert MarketDoesNotExist(marketId);
        if (market.resolved) revert MarketAlreadyResolved(marketId);
        if (block.timestamp < market.closingTime) revert MarketStillOpen(marketId);
        if (!(winningOutcome < market.outcomeCount)) {
            revert InvalidWinningOutcome(winningOutcome, market.outcomeCount);
        }

        market.resolved = true;
        market.winningOutcome = winningOutcome;

        emit MarketResolved(marketId, winningOutcome);
    }

    /// @notice Computes and stores the caller's encrypted outcome share for
    /// a resolved market. The share is `amount * oddsForThePredictedOutcome`
    /// if the prediction matches the resolved outcome, and zero otherwise.
    /// Only the caller can decrypt the resulting share off chain.
    ///
    /// @dev Gas note: this does only one encrypted comparison, not one per
    /// outcome. `market.winningOutcome` is already plaintext by the time a
    /// market can be claimed against (set in `resolveMarket`), so the only
    /// fact that needs to come from an encrypted comparison is whether the
    /// caller's encrypted prediction equals that already-known plaintext
    /// value -- there is no need to encrypt-compare against every possible
    /// outcome to find "which odds the caller predicted", because if the
    /// prediction does not match the winning outcome the odds are
    /// multiplied by zero via `FHE.select` regardless of what they were,
    /// and if it does match, the odds are simply
    /// `market.outcomeOddsBps[market.winningOutcome]` -- a plain array
    /// read, not something that needs computing from the caller's
    /// ciphertext at all. An earlier version of this function looped over
    /// every outcome doing an `FHE.eq` + `FHE.select` per iteration to
    /// reconstruct that same value the hard way; this version does one
    /// `FHE.eq`, one `FHE.mul`, one `FHE.div`, and one `FHE.select`,
    /// regardless of `outcomeCount`. The "out-of-range prediction always
    /// loses" property from the design notes above is preserved: an
    /// encrypted prediction equal to, say, 200 can never equal a
    /// `winningOutcome` that is always less than `MAX_OUTCOMES`, so
    /// `matched` is false and the share is zero either way.
    ///
    /// Pays `outcomeShare` out to the caller via `TOKEN.confidentialTransfer`,
    /// from this contract's own pooled token balance -- see design note 8
    /// for what "pooled" means and what it does not guarantee. A losing
    /// claim (`outcomeShare` encrypting zero) still calls this; transferring
    /// an encrypted zero is a harmless no-op in effect, and keeping the
    /// call unconditional avoids branching on the (encrypted) win/loss
    /// result, consistent with the rest of this function.
    /// @param marketId Market to claim against.
    function claim(uint256 marketId) external {
        Market storage market = _markets[marketId];
        if (!market.exists) revert MarketDoesNotExist(marketId);
        if (!market.resolved) revert MarketNotResolved(marketId);

        Position storage position = _positions[marketId][msg.sender];
        if (!position.submitted) revert NoPosition(marketId, msg.sender);
        if (position.claimed) revert AlreadyClaimed(marketId, msg.sender);

        ebool matched = FHE.eq(position.predictedOutcome, FHE.asEuint8(market.winningOutcome));
        euint64 oddsForWinningOutcome = FHE.asEuint64(market.outcomeOddsBps[market.winningOutcome]);
        euint64 grossShare = FHE.div(FHE.mul(position.amount, oddsForWinningOutcome), BPS_DIVISOR);
        euint64 outcomeShare = FHE.select(matched, grossShare, FHE.asEuint64(0));

        position.claimed = true;
        position.outcomeShare = outcomeShare;

        FHE.allowThis(outcomeShare);
        FHE.allow(outcomeShare, msg.sender);

        // Pay out. Same ACL requirement as the escrow call in
        // submitPrediction: BlackboxCoin's own internal balance-check code
        // needs its own grant on this handle, separate from this
        // contract's own permission via FHE.allowThis above.
        FHE.allow(outcomeShare, address(TOKEN));
        TOKEN.confidentialTransfer(msg.sender, outcomeShare);

        emit Claimed(marketId, msg.sender);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /// @notice Returns the core fields of a market.
    /// @param marketId Market to read.
    /// @return exists Whether the market has been created.
    /// @return resolved Whether the market has been resolved.
    /// @return outcomeCount Number of possible outcomes.
    /// @return winningOutcome Winning outcome index, meaningful only if resolved.
    /// @return closingTime Unix timestamp after which predictions are no longer accepted.
    /// @return eventType Machine-readable generator tag for the market.
    /// @return label Human-readable market label.
    function getMarket(
        uint256 marketId
    )
        external
        view
        returns (
            bool exists,
            bool resolved,
            uint8 outcomeCount,
            uint8 winningOutcome,
            uint64 closingTime,
            string memory eventType,
            string memory label
        )
    {
        Market storage market = _markets[marketId];
        return (
            market.exists,
            market.resolved,
            market.outcomeCount,
            market.winningOutcome,
            market.closingTime,
            market.eventType,
            market.label
        );
    }

    /// @notice Returns the payout multiplier table for a market.
    /// @param marketId Market to read.
    function getMarketOdds(uint256 marketId) external view returns (uint32[] memory) {
        return _markets[marketId].outcomeOddsBps;
    }

    /// @notice Returns a participant's position in a market, as encrypted handles.
    /// @param marketId Market to read.
    /// @param participant Address whose position to read.
    /// @return submitted Whether the participant has submitted a prediction.
    /// @return claimed Whether the participant has claimed their outcome share.
    /// @return predictedOutcome Encrypted outcome index the participant predicted.
    /// @return amount Encrypted prediction amount.
    /// @return outcomeShare Encrypted outcome share, meaningful only after claiming.
    function getPosition(
        uint256 marketId,
        address participant
    )
        external
        view
        returns (bool submitted, bool claimed, euint8 predictedOutcome, euint64 amount, euint64 outcomeShare)
    {
        Position storage position = _positions[marketId][participant];
        return (
            position.submitted,
            position.claimed,
            position.predictedOutcome,
            position.amount,
            position.outcomeShare
        );
    }
}
