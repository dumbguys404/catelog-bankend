import { Pool } from 'pg'

import { env } from '../config/env.js'

export const db = new Pool({
    connectionString: env.databaseUrl,

    max: env.db.poolMax,

    connectionTimeoutMillis:
        env.db.connectionTimeoutMs,

    idleTimeoutMillis:
        env.db.idleTimeoutMs,

    statement_timeout:
        env.db.statementTimeoutMs,

    query_timeout:
        env.db.queryTimeoutMs,

    idle_in_transaction_session_timeout: 15000,

    application_name: 'catalog-api'
})

db.on('error', (error) => {
    console.error(
        'Unexpected PostgreSQL pool error',
        error
    )
})

export async function checkDatabaseConnection() {
    await db.query('SELECT 1')
}

export async function closeDatabaseConnection() {
    await db.end()
}