import { describe, it, expect } from 'vitest'
import { is } from 'drizzle-orm'
import { PgTable, getTableConfig } from 'drizzle-orm/pg-core'
import * as schema from '@/lib/db/schema'

// drizzle-kit push reads a unique constraint's columns back in table column
// order. A multi-column unique declared in any other order looks changed on
// every push, which then stops at an interactive prompt (and fails in the
// Docker init container, which has no TTY).
describe('db schema', () => {
  const tables = (Object.values(schema) as unknown[]).filter((t): t is PgTable => is(t, PgTable))

  it('declares multi-column unique constraints in table column order', () => {
    const outOfOrder: string[] = []
    for (const table of tables) {
      const { name, columns, uniqueConstraints } = getTableConfig(table)
      const position = new Map(columns.map((c, i) => [c.name, i]))
      for (const unq of uniqueConstraints) {
        const declared = unq.columns.map((c) => c.name)
        const tableOrder = [...declared].sort((a, b) => position.get(a)! - position.get(b)!)
        if (declared.join() !== tableOrder.join()) {
          outOfOrder.push(`${name}.${unq.name}: (${declared}) should be (${tableOrder})`)
        }
      }
    }
    expect(tables.length).toBeGreaterThan(20)
    expect(outOfOrder).toEqual([])
  })
})
