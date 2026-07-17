// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {FHE} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {ERC7984} from "@openzeppelin/confidential-contracts/token/ERC7984/ERC7984.sol";

/// @title BlackboxCoin
/// @author Deeen_Codes
/// @notice Confidential fungible token used as the unit of account for
/// BLACKBOX prediction amounts and outcome shares. Built on OpenZeppelin's
/// ERC-7984 confidential token standard, developed jointly with Zama for
/// the fhEVM -- not a hand-rolled token. Balances and transfer amounts are
/// encrypted end to end; only the account holder can decrypt their own
/// balance.
///
/// @dev Provenance and trust notes, read before relying on this in
/// anything beyond a testnet demo:
///
/// 1. OpenZeppelin's confidential-contracts library (which ERC7984 comes
///    from) is explicitly NOT yet covered by OpenZeppelin's formal audit
///    process or their Immunefi bug bounty, per their own documentation,
///    and carries no backward-compatibility guarantee. It is the
///    ecosystem-standard building block for confidential tokens on fhEVM
///    as of this writing -- the right choice over a hand-rolled token --
///    but "standard" is not the same claim as "audited." Treat this the
///    same way you'd treat any other pre-audit dependency.
///
/// 2. This token exists to give BLACKBOX predictions real, transferable,
///    payable-out value instead of an abstract unmovable integer -- see
///    BlackboxMarket.sol's design notes for why that mattered enough to
///    add. It is still testnet play money: the `faucet` function mints
///    tokens to anyone who asks, on a per-address cooldown, specifically
///    so a judge or tester evaluating BLACKBOX doesn't need to source
///    tokens from anywhere else. Do not deploy this faucet configuration
///    anywhere real value is expected.
contract BlackboxCoin is ZamaEthereumConfig, ERC7984 {
    /// @notice Amount minted per faucet call, in the token's smallest unit.
    uint64 public constant FAUCET_AMOUNT = 10_000 * 10 ** 6; // 10,000 tokens at 6 decimals

    /// @notice Minimum time between faucet claims for the same address.
    uint256 public constant FAUCET_COOLDOWN = 1 hours;

    /// @notice Unix timestamp at which an address may next call `faucet`.
    mapping(address account => uint256 nextClaimTime) public nextFaucetClaim;

    error FaucetCooldownActive(uint256 nextClaimTime);

    constructor() ERC7984("BLACKBOX Coin", "BBX", "") {}

    /// @notice Mints FAUCET_AMOUNT of test tokens to the caller. Anyone can
    /// call this once per FAUCET_COOLDOWN -- deliberately public and
    /// unrestricted, so BLACKBOX can be tried end to end without needing
    /// tokens from anywhere else. The minted amount is visible on chain
    /// (a plain, non-confidential mint): there is nothing to keep private
    /// about "this address claimed the public faucet," and a visible mint
    /// is cheaper than an encrypted one. What happens to the balance after
    /// minting -- transfers, prediction amounts -- stays fully encrypted.
    function faucet() external {
        if (block.timestamp < nextFaucetClaim[msg.sender]) {
            revert FaucetCooldownActive(nextFaucetClaim[msg.sender]);
        }
        nextFaucetClaim[msg.sender] = block.timestamp + FAUCET_COOLDOWN;
        _mint(msg.sender, FHE.asEuint64(FAUCET_AMOUNT));
    }
}
