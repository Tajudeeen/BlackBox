-- BLACKBOX database schema
-- Stores only public market metadata, simulation history, and activity
-- records that do not compromise user privacy. Predictions, amounts, and
-- positions are never written here — they exist only as encrypted state
-- on-chain, governed by the FHEVM Access Control List.

CREATE TABLE IF NOT EXISTS markets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_market_id BIGINT NOT NULL UNIQUE,
  event_type      TEXT NOT NULL,           -- e.g. 'virtual_football_winner'
  label           TEXT NOT NULL,           -- e.g. 'BLACK FC vs GOLD FC — Winner'
  closes_at       TIMESTAMPTZ NOT NULL,
  settled_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS simulation_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id       UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  fixture_id      TEXT NOT NULL,           -- correlates multiple markets settled from one simulated match
  generator       TEXT NOT NULL,           -- e.g. 'virtual_football'
  seed_commitment TEXT NOT NULL,           -- public commitment to the randomness seed
  seed_reveal     TEXT,                    -- the seed itself, published once the fixture settles
  outcome_summary TEXT,                    -- public, non-financial outcome description
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Activity records intentionally exclude prediction choice, wager amount,
-- and market position. They only confirm that an address participated.
CREATE TABLE IF NOT EXISTS activity_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id       UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  participant     TEXT NOT NULL,           -- wallet address
  action          TEXT NOT NULL,           -- 'submitted' | 'claimed'
  tx_hash         TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_simulation_events_market_id ON simulation_events(market_id);
CREATE INDEX IF NOT EXISTS idx_simulation_events_fixture_id ON simulation_events(fixture_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_market_id ON activity_log(market_id);

-- Holds the secret seed for a fixture between commitment and reveal, plus
-- enough state to finish settling it after a process restart. This table
-- is NOT exposed by any public API or frontend query -- unlike
-- simulation_events (which intentionally publishes seed_commitment and
-- later seed_reveal), a row here contains the seed while it is still
-- secret, before the fixture has closed and resolved.
--
-- Without this table, the engine's in-memory pending-fixture map is wiped
-- on every process restart (a Railway redeploy, a crash, a host restart),
-- silently orphaning every fixture that was still open at that moment --
-- those markets stay open on-chain forever with no way to resolve them.
--
-- A row here is deleted the moment its fixture settles successfully
-- (see backend/src/fixtures/settleFixture.ts). A row that lingers past
-- its closing_time by more than a few minutes indicates the engine
-- process was down when it should have settled -- see the "stuck
-- fixture" recovery notes in backend/src/adminResolve.ts.
CREATE TABLE IF NOT EXISTS pending_fixtures (
  fixture_id      TEXT PRIMARY KEY,
  generator_name  TEXT NOT NULL,
  seed_hex        TEXT NOT NULL,           -- secret until the fixture settles; never expose this table publicly
  markets         JSONB NOT NULL,          -- [{ marketRowId, contractMarketId }, ...] in generator output order
  closing_time    BIGINT NOT NULL,         -- unix seconds
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
