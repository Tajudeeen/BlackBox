import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";

import { BlackboxMarket, BlackboxMarket__factory } from "../types";

type Signers = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
  carol: HardhatEthersSigner;
};

// Outcome layout used throughout these tests: a 3-way winner market.
const HOME = 0;
const DRAW = 1;
const AWAY = 2;
const ODDS_BPS = [25_000, 31_000, 28_000]; // 2.5x, 3.1x, 2.8x

async function deployFixture() {
  const factory = (await ethers.getContractFactory("BlackboxMarket")) as BlackboxMarket__factory;
  const market = (await factory.deploy()) as BlackboxMarket;
  const marketAddress = await market.getAddress();
  return { market, marketAddress };
}

async function createDefaultMarket(market: BlackboxMarket, closingInSeconds = 3600) {
  const closingTime = (await time.latest()) + closingInSeconds;
  const tx = await market.createMarket(
    "virtual_football_winner",
    "BLACK FC vs GOLD FC -- Winner",
    closingTime,
    ODDS_BPS,
  );
  await tx.wait();
  return { marketId: 0n, closingTime };
}

async function submitEncryptedPrediction(
  market: BlackboxMarket,
  marketAddress: string,
  signer: HardhatEthersSigner,
  marketId: bigint,
  outcome: number,
  amount: number,
) {
  const encrypted = await fhevm
    .createEncryptedInput(marketAddress, signer.address)
    .add8(outcome)
    .add64(amount)
    .encrypt();

  const tx = await market
    .connect(signer)
    .submitPrediction(marketId, encrypted.handles[0], encrypted.handles[1], encrypted.inputProof);
  await tx.wait();
}

describe("BlackboxMarket", function () {
  let signers: Signers;
  let market: BlackboxMarket;
  let marketAddress: string;

  before(async function () {
    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = { deployer: ethSigners[0], alice: ethSigners[1], bob: ethSigners[2], carol: ethSigners[3] };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn(`This hardhat test suite cannot run on Sepolia Testnet`);
      this.skip();
    }

    ({ market, marketAddress } = await deployFixture());
  });

  describe("access control", function () {
    it("sets the deployer as both owner and operator", async function () {
      expect(await market.owner()).to.eq(signers.deployer.address);
      expect(await market.operator()).to.eq(signers.deployer.address);
    });

    it("lets the owner rotate the operator", async function () {
      await expect(market.connect(signers.deployer).setOperator(signers.alice.address))
        .to.emit(market, "OperatorUpdated")
        .withArgs(signers.deployer.address, signers.alice.address);
      expect(await market.operator()).to.eq(signers.alice.address);
    });

    it("reverts if a non-owner tries to rotate the operator", async function () {
      await expect(market.connect(signers.alice).setOperator(signers.alice.address)).to.be.revertedWithCustomError(
        market,
        "OwnableUnauthorizedAccount",
      );
    });

    it("reverts when rotating the operator to the zero address", async function () {
      await expect(market.connect(signers.deployer).setOperator(ethers.ZeroAddress)).to.be.revertedWithCustomError(
        market,
        "ZeroAddress",
      );
    });

    it("reverts if a non-operator tries to create a market", async function () {
      const closingTime = (await time.latest()) + 3600;
      await expect(
        market
          .connect(signers.alice)
          .createMarket("virtual_football_winner", "BLACK FC vs GOLD FC", closingTime, ODDS_BPS),
      )
        .to.be.revertedWithCustomError(market, "NotOperator")
        .withArgs(signers.alice.address);
    });

    it("reverts if a non-operator tries to resolve a market", async function () {
      const { marketId, closingTime } = await createDefaultMarket(market);
      await time.increaseTo(closingTime + 1);
      await expect(market.connect(signers.alice).resolveMarket(marketId, HOME))
        .to.be.revertedWithCustomError(market, "NotOperator")
        .withArgs(signers.alice.address);
    });
  });

  describe("market creation", function () {
    it("creates a market and emits MarketCreated", async function () {
      const closingTime = (await time.latest()) + 3600;
      await expect(
        market.createMarket("virtual_football_winner", "BLACK FC vs GOLD FC -- Winner", closingTime, ODDS_BPS),
      )
        .to.emit(market, "MarketCreated")
        .withArgs(0n, "virtual_football_winner", "BLACK FC vs GOLD FC -- Winner", closingTime, 3);

      const info = await market.getMarket(0n);
      expect(info.exists).to.eq(true);
      expect(info.resolved).to.eq(false);
      expect(info.outcomeCount).to.eq(3);
      expect(info.closingTime).to.eq(closingTime);

      const odds = await market.getMarketOdds(0n);
      expect(odds.map(Number)).to.deep.eq(ODDS_BPS);
    });

    it("assigns sequential market ids", async function () {
      await createDefaultMarket(market);
      await createDefaultMarket(market);
      expect(await market.nextMarketId()).to.eq(2n);
    });

    it("reverts if closingTime is not in the future", async function () {
      const closingTime = await time.latest();
      await expect(
        market.createMarket("virtual_football_winner", "label", closingTime, ODDS_BPS),
      ).to.be.revertedWithCustomError(market, "InvalidClosingTime");
    });

    it("reverts with fewer than 2 outcomes", async function () {
      const closingTime = (await time.latest()) + 3600;
      await expect(
        market.createMarket("virtual_football_winner", "label", closingTime, [25_000]),
      ).to.be.revertedWithCustomError(market, "InvalidOutcomeCount");
    });

    it("reverts with more than MAX_OUTCOMES outcomes", async function () {
      const closingTime = (await time.latest()) + 3600;
      const tooManyOdds = new Array(9).fill(20_000);
      await expect(
        market.createMarket("virtual_football_winner", "label", closingTime, tooManyOdds),
      ).to.be.revertedWithCustomError(market, "InvalidOutcomeCount");
    });

    it("reverts if any odds value is zero", async function () {
      const closingTime = (await time.latest()) + 3600;
      await expect(
        market.createMarket("virtual_football_winner", "label", closingTime, [20_000, 0]),
      ).to.be.revertedWithCustomError(market, "InvalidOdds");
    });

    it("reverts if any odds value exceeds MAX_ODDS_BPS", async function () {
      const closingTime = (await time.latest()) + 3600;
      const maxOdds = await market.MAX_ODDS_BPS();
      await expect(
        market.createMarket("virtual_football_winner", "label", closingTime, [20_000, maxOdds + 1n]),
      ).to.be.revertedWithCustomError(market, "InvalidOdds");
    });

    it("reverts if eventType exceeds MAX_STRING_LENGTH", async function () {
      const closingTime = (await time.latest()) + 3600;
      const maxLength = await market.MAX_STRING_LENGTH();
      const tooLong = "x".repeat(Number(maxLength) + 1);
      await expect(market.createMarket(tooLong, "label", closingTime, ODDS_BPS)).to.be.revertedWithCustomError(
        market,
        "StringTooLong",
      );
    });

    it("reverts if label exceeds MAX_STRING_LENGTH", async function () {
      const closingTime = (await time.latest()) + 3600;
      const maxLength = await market.MAX_STRING_LENGTH();
      const tooLong = "x".repeat(Number(maxLength) + 1);
      await expect(
        market.createMarket("virtual_football_winner", tooLong, closingTime, ODDS_BPS),
      ).to.be.revertedWithCustomError(market, "StringTooLong");
    });

    it("accepts eventType and label exactly at MAX_STRING_LENGTH", async function () {
      const closingTime = (await time.latest()) + 3600;
      const maxLength = await market.MAX_STRING_LENGTH();
      const exact = "x".repeat(Number(maxLength));
      await expect(market.createMarket(exact, exact, closingTime, ODDS_BPS)).to.not.be.reverted;
    });
  });

  describe("prediction submission", function () {
    it("stores an encrypted position and grants the participant decrypt access", async function () {
      const { marketId } = await createDefaultMarket(market);
      await submitEncryptedPrediction(market, marketAddress, signers.alice, marketId, HOME, 100);

      const position = await market.getPosition(marketId, signers.alice.address);
      expect(position.submitted).to.eq(true);
      expect(position.claimed).to.eq(false);

      const clearOutcome = await fhevm.userDecryptEuint(
        FhevmType.euint8,
        position.predictedOutcome,
        marketAddress,
        signers.alice,
      );
      const clearAmount = await fhevm.userDecryptEuint(
        FhevmType.euint64,
        position.amount,
        marketAddress,
        signers.alice,
      );
      expect(clearOutcome).to.eq(BigInt(HOME));
      expect(clearAmount).to.eq(100n);
    });

    it("emits PredictionSubmitted without leaking the prediction or amount", async function () {
      const { marketId } = await createDefaultMarket(market);
      const encrypted = await fhevm
        .createEncryptedInput(marketAddress, signers.alice.address)
        .add8(AWAY)
        .add64(250)
        .encrypt();

      await expect(
        market
          .connect(signers.alice)
          .submitPrediction(marketId, encrypted.handles[0], encrypted.handles[1], encrypted.inputProof),
      )
        .to.emit(market, "PredictionSubmitted")
        .withArgs(marketId, signers.alice.address);
    });

    it("reverts when submitting to a market that does not exist", async function () {
      const encrypted = await fhevm
        .createEncryptedInput(marketAddress, signers.alice.address)
        .add8(0)
        .add64(1)
        .encrypt();
      await expect(
        market
          .connect(signers.alice)
          .submitPrediction(999n, encrypted.handles[0], encrypted.handles[1], encrypted.inputProof),
      ).to.be.revertedWithCustomError(market, "MarketDoesNotExist");
    });

    it("reverts when submitting after the market has closed", async function () {
      const { marketId, closingTime } = await createDefaultMarket(market);
      await time.increaseTo(closingTime + 1);
      const encrypted = await fhevm
        .createEncryptedInput(marketAddress, signers.alice.address)
        .add8(0)
        .add64(1)
        .encrypt();
      await expect(
        market
          .connect(signers.alice)
          .submitPrediction(marketId, encrypted.handles[0], encrypted.handles[1], encrypted.inputProof),
      ).to.be.revertedWithCustomError(market, "MarketClosed");
    });

    it("reverts on a second submission from the same participant", async function () {
      const { marketId } = await createDefaultMarket(market);
      await submitEncryptedPrediction(market, marketAddress, signers.alice, marketId, HOME, 100);
      await expect(
        submitEncryptedPrediction(market, marketAddress, signers.alice, marketId, AWAY, 50),
      ).to.be.revertedWithCustomError(market, "AlreadySubmitted");
    });

    it("lets independent participants hold independent positions in the same market", async function () {
      const { marketId } = await createDefaultMarket(market);
      await submitEncryptedPrediction(market, marketAddress, signers.alice, marketId, HOME, 100);
      await submitEncryptedPrediction(market, marketAddress, signers.bob, marketId, AWAY, 60);

      const alicePosition = await market.getPosition(marketId, signers.alice.address);
      const bobPosition = await market.getPosition(marketId, signers.bob.address);
      expect(alicePosition.submitted).to.eq(true);
      expect(bobPosition.submitted).to.eq(true);
    });
  });

  describe("resolution", function () {
    it("reverts when resolving before the market closes", async function () {
      const { marketId } = await createDefaultMarket(market);
      await expect(market.resolveMarket(marketId, HOME)).to.be.revertedWithCustomError(market, "MarketStillOpen");
    });

    it("reverts when resolving a market that does not exist", async function () {
      await expect(market.resolveMarket(999n, HOME)).to.be.revertedWithCustomError(market, "MarketDoesNotExist");
    });

    it("reverts with an out-of-range winning outcome", async function () {
      const { marketId, closingTime } = await createDefaultMarket(market);
      await time.increaseTo(closingTime + 1);
      await expect(market.resolveMarket(marketId, 7)).to.be.revertedWithCustomError(market, "InvalidWinningOutcome");
    });

    it("resolves successfully and emits MarketResolved", async function () {
      const { marketId, closingTime } = await createDefaultMarket(market);
      await time.increaseTo(closingTime + 1);
      await expect(market.resolveMarket(marketId, DRAW)).to.emit(market, "MarketResolved").withArgs(marketId, DRAW);

      const info = await market.getMarket(marketId);
      expect(info.resolved).to.eq(true);
      expect(info.winningOutcome).to.eq(DRAW);
    });

    it("reverts when resolving an already-resolved market", async function () {
      const { marketId, closingTime } = await createDefaultMarket(market);
      await time.increaseTo(closingTime + 1);
      await market.resolveMarket(marketId, DRAW);
      await expect(market.resolveMarket(marketId, HOME)).to.be.revertedWithCustomError(market, "MarketAlreadyResolved");
    });
  });

  describe("claiming", function () {
    it("reverts when claiming a market that does not exist", async function () {
      await expect(market.connect(signers.alice).claim(999n)).to.be.revertedWithCustomError(
        market,
        "MarketDoesNotExist",
      );
    });

    it("reverts when claiming before resolution", async function () {
      const { marketId } = await createDefaultMarket(market);
      await submitEncryptedPrediction(market, marketAddress, signers.alice, marketId, HOME, 100);
      await expect(market.connect(signers.alice).claim(marketId)).to.be.revertedWithCustomError(
        market,
        "MarketNotResolved",
      );
    });

    it("reverts when claiming without a position", async function () {
      const { marketId, closingTime } = await createDefaultMarket(market);
      await time.increaseTo(closingTime + 1);
      await market.resolveMarket(marketId, HOME);
      await expect(market.connect(signers.alice).claim(marketId)).to.be.revertedWithCustomError(market, "NoPosition");
    });

    it("pays amount * odds for a correct prediction", async function () {
      const { marketId, closingTime } = await createDefaultMarket(market);
      await submitEncryptedPrediction(market, marketAddress, signers.alice, marketId, HOME, 100);
      await time.increaseTo(closingTime + 1);
      await market.resolveMarket(marketId, HOME);

      await expect(market.connect(signers.alice).claim(marketId))
        .to.emit(market, "Claimed")
        .withArgs(marketId, signers.alice.address);

      const position = await market.getPosition(marketId, signers.alice.address);
      const clearShare = await fhevm.userDecryptEuint(
        FhevmType.euint64,
        position.outcomeShare,
        marketAddress,
        signers.alice,
      );
      // amount 100 * 25_000 bps / 10_000 = 250
      expect(clearShare).to.eq(250n);
    });

    it("pays zero for an incorrect prediction", async function () {
      const { marketId, closingTime } = await createDefaultMarket(market);
      await submitEncryptedPrediction(market, marketAddress, signers.bob, marketId, AWAY, 100);
      await time.increaseTo(closingTime + 1);
      await market.resolveMarket(marketId, HOME);

      await market.connect(signers.bob).claim(marketId);

      const position = await market.getPosition(marketId, signers.bob.address);
      const clearShare = await fhevm.userDecryptEuint(
        FhevmType.euint64,
        position.outcomeShare,
        marketAddress,
        signers.bob,
      );
      expect(clearShare).to.eq(0n);
    });

    it("settles multiple participants independently and correctly in the same market", async function () {
      const { marketId, closingTime } = await createDefaultMarket(market);
      await submitEncryptedPrediction(market, marketAddress, signers.alice, marketId, HOME, 100); // correct
      await submitEncryptedPrediction(market, marketAddress, signers.bob, marketId, AWAY, 100); // incorrect
      await submitEncryptedPrediction(market, marketAddress, signers.carol, marketId, DRAW, 40); // incorrect

      await time.increaseTo(closingTime + 1);
      await market.resolveMarket(marketId, HOME);

      await market.connect(signers.alice).claim(marketId);
      await market.connect(signers.bob).claim(marketId);
      await market.connect(signers.carol).claim(marketId);

      const aliceShare = await fhevm.userDecryptEuint(
        FhevmType.euint64,
        (await market.getPosition(marketId, signers.alice.address)).outcomeShare,
        marketAddress,
        signers.alice,
      );
      const bobShare = await fhevm.userDecryptEuint(
        FhevmType.euint64,
        (await market.getPosition(marketId, signers.bob.address)).outcomeShare,
        marketAddress,
        signers.bob,
      );
      const carolShare = await fhevm.userDecryptEuint(
        FhevmType.euint64,
        (await market.getPosition(marketId, signers.carol.address)).outcomeShare,
        marketAddress,
        signers.carol,
      );

      expect(aliceShare).to.eq(250n); // 100 * 25_000 / 10_000
      expect(bobShare).to.eq(0n);
      expect(carolShare).to.eq(0n);
    });

    it("reverts on a second claim from the same participant", async function () {
      const { marketId, closingTime } = await createDefaultMarket(market);
      await submitEncryptedPrediction(market, marketAddress, signers.alice, marketId, HOME, 100);
      await time.increaseTo(closingTime + 1);
      await market.resolveMarket(marketId, HOME);
      await market.connect(signers.alice).claim(marketId);

      await expect(market.connect(signers.alice).claim(marketId)).to.be.revertedWithCustomError(
        market,
        "AlreadyClaimed",
      );
    });

    it("treats an out-of-range encrypted prediction as a guaranteed loss, not a revert", async function () {
      const { marketId, closingTime } = await createDefaultMarket(market);
      const encrypted = await fhevm
        .createEncryptedInput(marketAddress, signers.alice.address)
        .add8(200) // outside the 0-2 range declared for this market
        .add64(100)
        .encrypt();
      await market
        .connect(signers.alice)
        .submitPrediction(marketId, encrypted.handles[0], encrypted.handles[1], encrypted.inputProof);

      await time.increaseTo(closingTime + 1);
      await market.resolveMarket(marketId, HOME);
      await market.connect(signers.alice).claim(marketId);

      const clearShare = await fhevm.userDecryptEuint(
        FhevmType.euint64,
        (await market.getPosition(marketId, signers.alice.address)).outcomeShare,
        marketAddress,
        signers.alice,
      );
      expect(clearShare).to.eq(0n);
    });
  });

  describe("confidentiality / permissions", function () {
    it("does not let another address decrypt a participant's encrypted prediction", async function () {
      const { marketId } = await createDefaultMarket(market);
      await submitEncryptedPrediction(market, marketAddress, signers.alice, marketId, HOME, 100);
      const position = await market.getPosition(marketId, signers.alice.address);

      let rejected = false;
      try {
        await fhevm.userDecryptEuint(FhevmType.euint8, position.predictedOutcome, marketAddress, signers.bob);
      } catch {
        rejected = true;
      }
      expect(rejected).to.eq(true);
    });

    it("does not let another address decrypt a participant's encrypted amount", async function () {
      const { marketId } = await createDefaultMarket(market);
      await submitEncryptedPrediction(market, marketAddress, signers.alice, marketId, HOME, 100);
      const position = await market.getPosition(marketId, signers.alice.address);

      let rejected = false;
      try {
        await fhevm.userDecryptEuint(FhevmType.euint64, position.amount, marketAddress, signers.bob);
      } catch {
        rejected = true;
      }
      expect(rejected).to.eq(true);
    });

    it("does not let another address decrypt a participant's outcome share", async function () {
      const { marketId, closingTime } = await createDefaultMarket(market);
      await submitEncryptedPrediction(market, marketAddress, signers.alice, marketId, HOME, 100);
      await time.increaseTo(closingTime + 1);
      await market.resolveMarket(marketId, HOME);
      await market.connect(signers.alice).claim(marketId);
      const position = await market.getPosition(marketId, signers.alice.address);

      let rejected = false;
      try {
        await fhevm.userDecryptEuint(FhevmType.euint64, position.outcomeShare, marketAddress, signers.carol);
      } catch {
        rejected = true;
      }
      expect(rejected).to.eq(true);
    });
  });
});
