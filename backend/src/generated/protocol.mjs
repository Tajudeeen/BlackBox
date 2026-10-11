/** Protocol v2. Hash must implement Ethereum keccak256 over the supplied hex bytes. */
export function simulateV2(eventType, seed, hash) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(seed)) throw new Error('Expected a 32-byte seed');
  const word = (i) => BigInt(hash(`${seed}${i.toString(16).padStart(8, '0')}`));
  if (eventType === 'virtual_football_winner' || eventType === 'virtual_football_over_under') {
    const home = word(0) % 6n, away = word(1) % 6n;
    return eventType === 'virtual_football_over_under' ? (home + away > 2n ? 1 : 0) : home > away ? 0 : home === away ? 1 : 2;
  }
  const count = eventType === 'dog_race_winner' ? 6 : ['horse_race_winner', 'horse_race_place'].includes(eventType) ? 8 : 0;
  if (!count) throw new Error('Unsupported event type');
  const order = Array.from({length: count}, (_, i) => ({i, score: word(i)}))
    .sort((a, b) => a.score < b.score ? -1 : a.score > b.score ? 1 : a.i - b.i);
  return eventType === 'horse_race_place' ? (order.slice(0, 2).some(x => x.i === 0) ? 1 : 0) : order[0].i;
}
