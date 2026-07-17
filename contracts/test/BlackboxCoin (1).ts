import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";

import { BlackboxCoin, BlackboxCoin__factory } from "../types";

async function deployFixture() {
  const factory = (await ethers.getContractFactory("BlackboxCoin")) as BlackboxCoin__factory;
  const coin = (await factory.deploy()) as BlackboxCoin;
  const coinAddress = await coin.getAddress();
  return { coin, coinAddress };
}

async function decryptBalance(coin: BlackboxCoin, coinAddress: string, signer: HardhatEthersSigner): Promise<bigint> {
  const handle = await coin.confidentialBalanceOf(signer.address);
  return fhevm.userDecryptEuint(FhevmType.euint64, handle, coinAddress, signer);
}

describe("BlackboxCoin", function () {
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;
  let coin: BlackboxCoin;
  let coinAddress: string;

  before(async function () {
    const signers = await ethers.getSigners();
    alice = signers[1];
    bob = signers[2];
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn(`This hardhat test suite cannot run on Sepolia Testnet`);
      this.skip();
    }

    ({ coin, coinAddress } = await deployFixture());
  });

  it("has the expected name, symbol, and zero initial supply", async function () {
    expect(await coin.name()).to.eq("BLACKBOX Coin");
    expect(await coin.symbol()).to.eq("BBX");

    const supplyHandle = await coin.confidentialTotalSupply();
    // Total supply starts at an uninitialized (zero) handle before any mint.
    expect(supplyHandle).to.eq(ethers.ZeroHash);
  });

  it("mints FAUCET_AMOUNT to the caller", async function () {
    await (await coin.connect(alice).faucet()).wait();

    const balance = await decryptBalance(coin, coinAddress, alice);
    const faucetAmount = await coin.FAUCET_AMOUNT();
    expect(balance).to.eq(faucetAmount);
  });

  it("gives independent callers independent balances", async function () {
    await (await coin.connect(alice).faucet()).wait();
    await (await coin.connect(bob).faucet()).wait();

    const faucetAmount = await coin.FAUCET_AMOUNT();
    expect(await decryptBalance(coin, coinAddress, alice)).to.eq(faucetAmount);
    expect(await decryptBalance(coin, coinAddress, bob)).to.eq(faucetAmount);
  });

  it("reverts on a second faucet call within the cooldown window", async function () {
    await (await coin.connect(alice).faucet()).wait();

    await expect(coin.connect(alice).faucet()).to.be.revertedWithCustomError(coin, "FaucetCooldownActive");
  });

  it("allows a second faucet call once the cooldown has elapsed", async function () {
    await (await coin.connect(alice).faucet()).wait();

    const cooldown = await coin.FAUCET_COOLDOWN();
    await time.increase(cooldown + 1n);

    await expect(coin.connect(alice).faucet()).to.not.be.reverted;

    const faucetAmount = await coin.FAUCET_AMOUNT();
    const balance = await decryptBalance(coin, coinAddress, alice);
    expect(balance).to.eq(faucetAmount * 2n);
  });

  it("does not let another address decrypt a caller's balance", async function () {
    await (await coin.connect(alice).faucet()).wait();
    const handle = await coin.confidentialBalanceOf(alice.address);

    let rejected = false;
    try {
      await fhevm.userDecryptEuint(FhevmType.euint64, handle, coinAddress, bob);
    } catch {
      rejected = true;
    }
    expect(rejected).to.eq(true);
  });
});
