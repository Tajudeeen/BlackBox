import type { QueryResult, QueryResultRow } from "pg";

/**
 * The subset of `pg.Pool` the engine actually uses. The database helpers
 * in this directory depend on this interface rather than the concrete
 * `Pool` class, so fixture orchestration can be tested with a plain stub
 * instead of a real database connection. A real `Pool` instance already
 * satisfies this shape, so nothing changes at the call site in index.ts.
 */
export interface DbClient {
  query<T extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<T>>;
}
