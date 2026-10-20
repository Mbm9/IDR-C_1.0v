import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

const connectionString = process.env.DATABASE_URL!

const client = postgres(connectionString, {
  max: 20,                // Maximum connections in pool
  idle_timeout: 30,       // Close idle connections after 30s
  connect_timeout: 10,    // Fail connection attempts after 10s
  max_lifetime: 60 * 30,  // Recycle connections after 30 minutes
})

export const db = drizzle(client, { schema })

export type DB = typeof db
