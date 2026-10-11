import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';
import { time } from '@nomicfoundation/hardhat-network-helpers';
import { FhevmType } from '@fhevm/hardhat-plugin';
import { expect } from 'chai';
import { ethers, fhevm } from 'hardhat';
import type { BlackboxCoin, BlackboxMarket } from '../types';
const seed = ethers.id('public test seed');
const commitment = ethers.keccak256(seed);
const events = ['virtual_football_winner', 'virtual_football_over_under', 'dog_race_winner', 'horse_race_winner', 'horse_race_place'];
function reference(type: string, value: string): number {
  const words = Array.from({length: 8}, (_, i) => BigInt(ethers.solidityPackedKeccak256(['bytes32', 'uint32'], [value, i])));
  if (type.startsWith('virtual_football')) {
    const h = words[0] % 6n, a = words[1] % 6n;
    return type.endsWith('over_under') ? (h + a > 2n ? 1 : 0) : h > a ? 0 : h === a ? 1 : 2;
  }
  const order = words.slice(0, type.startsWith('dog') ? 6 : 8).map((score, i) => ({score, i}))
    .sort((a, b) => a.score < b.score ? -1 : a.score > b.score ? 1 : a.i - b.i);
  return type.endsWith('place') ? (order.slice(0, 2).some(x => x.i === 0) ? 1 : 0) : order[0].i;
}
describe('BlackboxMarket v2', function () {
  let market: BlackboxMarket, coin: BlackboxCoin, alice: HardhatEthersSigner, bob: HardhatEthersSigner, owner: HardhatEthersSigner;
  let address: string, closes: number;
  const winning = reference(events[0], seed);
  beforeEach(async function () {
    if (!fhevm.isMock) this.skip();
    [owner, alice, bob] = await ethers.getSigners();
    coin = await (await ethers.getContractFactory('BlackboxCoin')).deploy();
    market = await (await ethers.getContractFactory('BlackboxMarket')).deploy(await coin.getAddress());
    address = await market.getAddress();
    for (const user of [owner, alice, bob]) {
      await coin.connect(user).faucet();
      await coin.connect(user).setOperator(address, 2_000_000_000);
    }
    closes = await time.latest() + 3600;
  });
  async function create() { await market.createMarket(events[0], 'Test', closes, [25000,25000,25000], commitment, ethers.id('key')); }
  async function submit(amount = 100n, outcome = winning, signer = alice) {
    const e = await fhevm.createEncryptedInput(address, signer.address).add8(outcome).add64(amount).encrypt();
    return market.connect(signer).submitPrediction(0, e.handles[0], e.handles[1], e.inputProof);
  }
  async function decrypt(handle: string, signer = alice) { return fhevm.userDecryptEuint(FhevmType.euint64, handle, address, signer); }
  async function resolve() { await time.increaseTo(closes); await market.connect(bob).resolveMarket(0, seed); }
  async function bankroll() {
    const e = await fhevm.createEncryptedInput(await coin.getAddress(), owner.address).add64(1000).encrypt();
    await coin['confidentialTransfer(address,bytes32,bytes)'](address, e.handles[0], e.inputProof);
  }
  it('enforces ownership and operator authorization', async () => {
    expect(await market.owner()).eq(owner.address);
    await expect(market.connect(alice).setOperator(bob.address)).revertedWithCustomError(market, 'OwnableUnauthorizedAccount');
    await expect(market.setOperator(ethers.ZeroAddress)).revertedWithCustomError(market, 'ZeroAddress');
    await expect(market.connect(alice).createMarket(events[0], 'Test', closes, [1,1,1], commitment, ethers.id('k'))).revertedWithCustomError(market, 'NotOperator');
    await market.setOperator(bob.address);
    expect(await market.operator()).eq(bob.address);
  });
  it('rejects a zero token address', async () => {
    const factory = await ethers.getContractFactory('BlackboxMarket');
    await expect(factory.deploy(ethers.ZeroAddress)).revertedWithCustomError(factory, 'ZeroAddress');
  });
  it('atomically commits the seed and unique recovery key', async () => {
    await create();
    expect((await market.getMarketEvidence(0)).commitment).eq(commitment);
    expect(await market.marketByKey(ethers.id('key'))).eq(1n);
    await expect(create()).revertedWithCustomError(market, 'DuplicateCreationKey');
  });
  it('rejects invalid event, odds, count, commitment, label and closing time', async () => {
    const call = (type = events[0], odds = [1,1,1], hash = commitment, label = 'Test', end = closes) =>
      market.createMarket(type, label, end, odds, hash, ethers.id('key'));
    await expect(call('unknown')).revertedWithCustomError(market, 'UnsupportedEvent');
    await expect(call(events[0], [1,1])).revertedWithCustomError(market, 'InvalidOutcomeCount');
    await expect(call(events[0], [1,0,1])).revertedWithCustomError(market, 'InvalidOdds');
    await expect(call(events[0], [1,1000001,1])).revertedWithCustomError(market, 'InvalidOdds');
    await expect(call(events[0], [1,1,1], ethers.ZeroHash)).revertedWithCustomError(market, 'InvalidCommitment');
    await expect(call(events[0], [1,1,1], commitment, 'a'.repeat(129))).revertedWithCustomError(market, 'StringTooLong');
    await expect(call(events[0], [1,1,1], commitment, 'Test', 1)).revertedWithCustomError(market, 'InvalidClosingTime');
  });
  for (const type of events) it(`matches 24 independently encoded vectors: ${type}`, async () => {
    for (let i=0; i<24; i++) {
      const s = ethers.id(`vector:${i}`);
      expect(await market.previewOutcome(type, s)).eq(reference(type, s));
    }
  });
  it('rejects early/wrong/duplicate reveals and permits any correct revealer', async () => {
    await create();
    await expect(market.resolveMarket(0, seed)).revertedWithCustomError(market, 'MarketStillOpen');
    await time.increaseTo(closes);
    await expect(market.resolveMarket(0, ethers.id('wrong'))).revertedWithCustomError(market, 'InvalidCommitment');
    await market.connect(bob).resolveMarket(0, seed);
    expect((await market.getMarket(0)).winningOutcome).eq(winning);
    expect((await market.getMarketEvidence(0)).seed).eq(seed);
    await expect(market.resolveMarket(0, seed)).revertedWithCustomError(market, 'MarketAlreadyResolved');
  });
  it('records zero actual deposit when the token balance is insufficient', async () => {
    await create(); await submit((await coin.FAUCET_AMOUNT()) + 1n);
    expect(await decrypt((await market.getPosition(0, alice.address)).amount)).eq(0n);
    await resolve(); await market.connect(alice).claim(0);
    expect(await decrypt((await market.getPosition(0, alice.address)).outcomeShare)).eq(0n);
  });
  for (const mode of ['overflow', 'invalid outcome', 'zero']) it(`safely selects zero for ${mode}`, async () => {
    await create();
    await submit(mode === 'overflow' ? (await market.MAX_AMOUNT()) + 1n : mode === 'zero' ? 0n : 100n, mode === 'invalid outcome' ? 255 : winning);
    expect(await decrypt((await market.getPosition(0, alice.address)).amount)).eq(0n);
  });
  it('requires token approval and rejects repeated or closed submissions', async () => {
    await create(); await coin.connect(alice).setOperator(address, 0);
    await expect(submit()).revertedWithCustomError(coin, 'ERC7984UnauthorizedSpender');
    await coin.connect(alice).setOperator(address, 2_000_000_000);
    await submit();
    await expect(submit()).revertedWithCustomError(market, 'AlreadySubmitted');
    await time.increaseTo(closes);
    await expect(submit(100n, winning, bob)).revertedWithCustomError(market, 'MarketClosed');
  });
  it('retains unpaid debt, pays after funding, and never pays twice', async () => {
    const balance = async () => fhevm.userDecryptEuint(FhevmType.euint64, await coin.confidentialBalanceOf(alice.address), await coin.getAddress(), alice);
    const initial = await balance();
    await create(); await submit(); await resolve();
    expect(await balance()).eq(initial - 100n);
    await market.connect(alice).claim(0);
    expect(await balance()).eq(initial - 100n);
    let p = await market.getPayment(0, alice.address);
    expect(await decrypt(p.paid)).eq(0n); expect(await decrypt(p.remaining)).eq(250n);
    await bankroll(); await market.connect(alice).claim(0);
    p = await market.getPayment(0, alice.address);
    expect(await decrypt(p.paid)).eq(250n); expect(await decrypt(p.remaining)).eq(0n);
    expect(await balance()).eq(initial + 150n);
    await market.connect(alice).claim(0);
    expect(await decrypt((await market.getPayment(0, alice.address)).paid)).eq(250n);
    expect(await balance()).eq(initial + 150n);
  });
  it('computes zero entitlement for a losing prediction', async () => {
    await create(); await submit(100n, (winning + 1) % 3); await resolve(); await market.connect(alice).claim(0);
    expect(await decrypt((await market.getPosition(0, alice.address)).outcomeShare)).eq(0n);
  });
  it('does not grant another user decryption access to position or payments', async () => {
    await create(); await submit(); await resolve(); await market.connect(alice).claim(0);
    const p = await market.getPosition(0, alice.address), paid = await market.getPayment(0, alice.address);
    for (const handle of [p.amount, p.outcomeShare, paid.paid, paid.remaining]) {
      let rejected = false; try { await decrypt(handle, bob); } catch { rejected = true; }
      expect(rejected).eq(true);
    }
  });
  it('rejects a proof bound to another participant', async () => {
    await create();
    const e = await fhevm.createEncryptedInput(address, alice.address).add8(winning).add64(100).encrypt();
    await expect(market.connect(bob).submitPrediction(0, e.handles[0], e.handles[1], e.inputProof)).reverted;
  });
  it('allows permissionless timeout cancellation and refunds actual principal', async () => {
    await create(); await submit();
    await expect(market.cancelExpired(0)).revertedWithCustomError(market, 'RevealWindowOpen');
    await time.increaseTo(closes + 86400);
    await expect(market.resolveMarket(0, seed)).revertedWithCustomError(market, 'RevealWindowClosed');
    await market.connect(bob).cancelExpired(0);
    expect((await market.getMarketEvidence(0)).cancelled).eq(true);
    await market.connect(alice).claim(0);
    expect(await decrypt((await market.getPayment(0, alice.address)).paid)).eq(100n);
  });
  it('rejects nonexistent, premature and positionless claims', async () => {
    await expect(market.claim(0)).revertedWithCustomError(market, 'MarketDoesNotExist');
    await create(); await expect(market.claim(0)).revertedWithCustomError(market, 'MarketNotResolved');
    await resolve(); await expect(market.claim(0)).revertedWithCustomError(market, 'NoPosition');
  });
});
