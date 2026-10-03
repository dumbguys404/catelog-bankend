function required(name: string): string {
    const value = process.env[name]

    if (!value) {
        throw new Error(
            `Missing required environment variable: ${name}`
        )
    }

    return value
}

function numberValue(
    name: string,
    defaultValue: number
): number {
    const value = process.env[name]

    if (!value) {
        return defaultValue
    }

    const parsed = Number(value)

    if (!Number.isFinite(parsed) || parsed < 0) {
        throw new Error(
            `Invalid numeric environment variable: ${name}`
        )
    }

    return parsed
}

export const env = {
    nodeEnv:
        process.env.NODE_ENV ?? 'development',

    port:
        numberValue('PORT', 3000),

    host:
        process.env.HOST ?? '0.0.0.0',

    databaseUrl:
        required('DATABASE_URL'),

    tenantAdmin: {
        username:
            required('TENANT_ADMIN_USERNAME'),

        password:
            required('TENANT_ADMIN_PASSWORD')
    },

    platformAdmin: {
        username:
            required('PLATFORM_ADMIN_USERNAME'),

        password:
            required('PLATFORM_ADMIN_PASSWORD')
    },

    db: {
        poolMax:
            numberValue('DB_POOL_MAX', 10),

        connectionTimeoutMs:
            numberValue(
                'DB_CONNECTION_TIMEOUT_MS',
                5000
            ),

        idleTimeoutMs:
            numberValue(
                'DB_IDLE_TIMEOUT_MS',
                30000
            ),

        statementTimeoutMs:
            numberValue(
                'DB_STATEMENT_TIMEOUT_MS',
                15000
            ),

        queryTimeoutMs:
            numberValue(
                'DB_QUERY_TIMEOUT_MS',
                20000
            )
    }
}
