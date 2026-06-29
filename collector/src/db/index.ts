import { drizzle } from '@sentinel/shared/src/schema'
import { Pool } from 'pg'
import * as schema from '@sentinel/shared/src/schema'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

export const db = drizzle(pool, { schema })

export type DB = typeof db