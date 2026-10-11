// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import {FHE, euint8, euint64, externalEuint8, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";

/// @notice Version 2: committed deterministic results and retryable confidential payments.
/// @dev Commitments do not prevent seed grinding, foreknowledge or withholding.
/// The token pool is shared and has no solvency guarantee. See docs/PROTOCOL.md.
contract BlackboxMarket is ZamaEthereumConfig, Ownable, ReentrancyGuard {
    uint256 public constant PROTOCOL_VERSION = 2;
    uint8 public constant MAX_OUTCOMES = 8;
    uint32 public constant MAX_ODDS_BPS = 1_000_000;
    uint256 public constant MAX_STRING_LENGTH = 128;
    uint64 public constant MAX_AMOUNT = type(uint64).max / MAX_ODDS_BPS;
    uint64 public constant REVEAL_TIMEOUT = 1 days;
    IERC7984 public immutable TOKEN;
    address public operator;
    uint256 public nextMarketId;
    struct Market {
        bool exists;
        bool resolved;
        uint8 outcomeCount;
        uint8 winningOutcome;
        uint64 closingTime;
        string eventType;
        string label;
        uint32[] odds;
        bytes32 commitment;
        bytes32 seed;
        bool cancelled;
    }
    struct Position {
        bool submitted;
        bool claimed; // Entitlement computed; does NOT mean funds transferred.
        euint8 predictedOutcome;
        euint64 amount;
        euint64 outcomeShare;
        euint64 paid;
        euint64 remaining;
    }
    mapping(uint256 => Market) private markets;
    mapping(uint256 => mapping(address => Position)) private positions;
    mapping(bytes32 => uint256) public marketByKey; // ID + 1; zero means absent.
    event MarketCreated(uint256 indexed marketId, string eventType, string label, uint64 indexed closingTime, uint8 indexed outcomeCount);
    event SeedCommitted(uint256 indexed marketId, bytes32 indexed commitment, bytes32 indexed creationKey, uint256 version);
    event SeedRevealed(uint256 indexed marketId, bytes32 seed);
    event MarketResolved(uint256 indexed marketId, uint8 indexed winningOutcome);
    event MarketCancelled(uint256 indexed marketId);
    event PredictionSubmitted(uint256 indexed marketId, address indexed participant);
    event Claimed(uint256 indexed marketId, address indexed participant);
    event OperatorUpdated(address indexed previousOperator, address indexed newOperator);
    error NotOperator(address caller);
    error ZeroAddress();
    error MarketDoesNotExist(uint256 marketId);
    error MarketAlreadyResolved(uint256 marketId);
    error MarketNotResolved(uint256 marketId);
    error MarketClosed(uint256 marketId);
    error MarketStillOpen(uint256 marketId);
    error InvalidClosingTime();
    error InvalidOutcomeCount(uint8 provided);
    error InvalidOdds(uint32 provided);
    error StringTooLong(uint256 provided, uint256 maximum);
    error InvalidCommitment();
    error DuplicateCreationKey();
    error UnsupportedEvent();
    error AlreadySubmitted(uint256 marketId, address participant);
    error NoPosition(uint256 marketId, address participant);
    error RevealWindowClosed();
    error RevealWindowOpen();
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
    function setOperator(address newOperator) external onlyOwner {
        if (newOperator == address(0)) revert ZeroAddress();
        emit OperatorUpdated(operator, newOperator);
        operator = newOperator;
    }
    function createMarket(string calldata eventType, string calldata label, uint64 closingTime,
        uint32[] calldata odds, bytes32 commitment, bytes32 creationKey) external onlyOperator returns (uint256 marketId) {
        if (closingTime <= block.timestamp) revert InvalidClosingTime();
        if (bytes(eventType).length > MAX_STRING_LENGTH) revert StringTooLong(bytes(eventType).length, MAX_STRING_LENGTH);
        if (bytes(label).length > MAX_STRING_LENGTH) revert StringTooLong(bytes(label).length, MAX_STRING_LENGTH);
        if (commitment == bytes32(0) || creationKey == bytes32(0)) revert InvalidCommitment();
        if (marketByKey[creationKey] != 0) revert DuplicateCreationKey();
        if (odds.length != outcomeCountFor(eventType)) revert InvalidOutcomeCount(uint8(odds.length));
        for (uint256 i; i < odds.length; ++i) {
            if (odds[i] == 0 || odds[i] > MAX_ODDS_BPS) revert InvalidOdds(odds[i]);
        }
        marketId = nextMarketId++;
        Market storage m = markets[marketId];
        m.exists = true;
        m.outcomeCount = uint8(odds.length);
        m.closingTime = closingTime;
        m.eventType = eventType;
        m.label = label;
        m.odds = odds;
        m.commitment = commitment;
        marketByKey[creationKey] = marketId + 1;
        emit MarketCreated(marketId, eventType, label, closingTime, m.outcomeCount);
        emit SeedCommitted(marketId, commitment, creationKey, PROTOCOL_VERSION);
    }
    function outcomeCountFor(string memory eventType) public pure returns (uint8) {
        bytes32 tag = keccak256(bytes(eventType));
        if (tag == keccak256("virtual_football_winner")) return 3;
        if (tag == keccak256("virtual_football_over_under") || tag == keccak256("horse_race_place")) return 2;
        if (tag == keccak256("dog_race_winner")) return 6;
        if (tag == keccak256("horse_race_winner")) return 8;
        revert UnsupportedEvent();
    }
    function word(bytes32 seed, uint32 index) private pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked(seed, index)));
    }
    function previewOutcome(string memory eventType, bytes32 seed) public pure returns (uint8) {
        uint8 count = outcomeCountFor(eventType);
        bytes32 tag = keccak256(bytes(eventType));
        if (tag == keccak256("virtual_football_winner") || tag == keccak256("virtual_football_over_under")) {
            uint256 home = word(seed, 0) % 6;
            uint256 away = word(seed, 1) % 6;
            if (tag == keccak256("virtual_football_over_under")) return home + away > 2 ? 1 : 0;
            return home > away ? 0 : home == away ? 1 : 2;
        }
        if (tag == keccak256("horse_race_place")) {
            uint256 first = word(seed, 0);
            uint8 ahead;
            for (uint32 i = 1; i < 8; ++i) if (word(seed, i) < first) ++ahead;
            return ahead < 2 ? 1 : 0;
        }
        uint8 winner;
        uint256 best = word(seed, 0);
        for (uint8 i = 1; i < count; ++i) {
            uint256 score = word(seed, i);
            if (score < best) { best = score; winner = i; }
        }
        return winner;
    }
    function submitPrediction(uint256 marketId, externalEuint8 encryptedOutcome,
        externalEuint64 encryptedAmount, bytes calldata inputProof) external nonReentrant {
        Market storage m = markets[marketId];
        if (!m.exists) revert MarketDoesNotExist(marketId);
        if (block.timestamp >= m.closingTime) revert MarketClosed(marketId);
        Position storage p = positions[marketId][msg.sender];
        if (p.submitted) revert AlreadySubmitted(marketId, msg.sender);
        euint8 outcome = FHE.fromExternal(encryptedOutcome, inputProof);
        euint64 requested = FHE.fromExternal(encryptedAmount, inputProof);
        euint64 safeAmount = FHE.select(FHE.and(FHE.le(requested, MAX_AMOUNT), FHE.lt(outcome, m.outcomeCount)), requested, FHE.asEuint64(0));
        FHE.allowTransient(safeAmount, address(TOKEN));
        euint64 received = TOKEN.confidentialTransferFrom(msg.sender, address(this), safeAmount);
        p.submitted = true;
        p.predictedOutcome = outcome;
        p.amount = received;
        FHE.allowThis(outcome);
        FHE.allow(outcome, msg.sender);
        FHE.allowThis(received);
        FHE.allow(received, msg.sender);
        emit PredictionSubmitted(marketId, msg.sender);
    }
    function resolveMarket(uint256 marketId, bytes32 seed) external {
        Market storage m = markets[marketId];
        if (!m.exists) revert MarketDoesNotExist(marketId);
        if (m.resolved) revert MarketAlreadyResolved(marketId);
        if (block.timestamp < m.closingTime) revert MarketStillOpen(marketId);
        if (block.timestamp >= uint256(m.closingTime) + REVEAL_TIMEOUT) revert RevealWindowClosed();
        if (keccak256(abi.encodePacked(seed)) != m.commitment) revert InvalidCommitment();
        m.seed = seed;
        m.winningOutcome = previewOutcome(m.eventType, seed);
        m.resolved = true;
        emit SeedRevealed(marketId, seed);
        emit MarketResolved(marketId, m.winningOutcome);
    }
    function cancelExpired(uint256 marketId) external {
        Market storage m = markets[marketId];
        if (!m.exists) revert MarketDoesNotExist(marketId);
        if (m.resolved) revert MarketAlreadyResolved(marketId);
        if (block.timestamp < uint256(m.closingTime) + REVEAL_TIMEOUT) revert RevealWindowOpen();
        m.resolved = true;
        m.cancelled = true;
        emit MarketCancelled(marketId);
    }
    function claim(uint256 marketId) external nonReentrant {
        Market storage m = markets[marketId];
        if (!m.exists) revert MarketDoesNotExist(marketId);
        if (!m.resolved) revert MarketNotResolved(marketId);
        Position storage p = positions[marketId][msg.sender];
        if (!p.submitted) revert NoPosition(marketId, msg.sender);
        if (!p.claimed) {
            euint64 entitlement = m.cancelled ? p.amount : FHE.select(FHE.eq(p.predictedOutcome, m.winningOutcome),
                FHE.div(FHE.mul(p.amount, uint64(m.odds[m.winningOutcome])), uint64(10_000)), FHE.asEuint64(0));
            p.claimed = true;
            p.outcomeShare = entitlement;
            p.remaining = entitlement;
            p.paid = FHE.asEuint64(0);
            FHE.allowThis(entitlement);
            FHE.allow(entitlement, msg.sender);
        }
        FHE.allowTransient(p.remaining, address(TOKEN));
        euint64 transferred = TOKEN.confidentialTransfer(msg.sender, p.remaining);
        p.paid = FHE.add(p.paid, transferred);
        p.remaining = FHE.sub(p.remaining, transferred);
        FHE.allowThis(p.paid);
        FHE.allow(p.paid, msg.sender);
        FHE.allowThis(p.remaining);
        FHE.allow(p.remaining, msg.sender);
        emit Claimed(marketId, msg.sender);
    }
    function getMarket(uint256 marketId) external view returns (bool exists, bool resolved, uint8 outcomeCount,
        uint8 winningOutcome, uint64 closingTime, string memory eventType, string memory label) {
        Market storage m = markets[marketId];
        return (m.exists, m.resolved, m.outcomeCount, m.winningOutcome, m.closingTime, m.eventType, m.label);
    }
    function getMarketOdds(uint256 marketId) external view returns (uint32[] memory) { return markets[marketId].odds; }
    function getMarketEvidence(uint256 marketId) external view returns (bytes32 commitment, bytes32 seed, bool cancelled, uint256 version) {
        Market storage m = markets[marketId];
        return (m.commitment, m.seed, m.cancelled, PROTOCOL_VERSION);
    }
    function getPosition(uint256 marketId, address participant) external view returns (bool submitted, bool claimed,
        euint8 predictedOutcome, euint64 amount, euint64 outcomeShare) {
        Position storage p = positions[marketId][participant];
        return (p.submitted, p.claimed, p.predictedOutcome, p.amount, p.outcomeShare);
    }
    function getPayment(uint256 marketId, address participant) external view returns (euint64 paid, euint64 remaining) {
        Position storage p = positions[marketId][participant];
        return (p.paid, p.remaining);
    }
}
