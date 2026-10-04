import type { Pool } from 'pg'

export type TenantContext = {
    id: number
    code: string
    name: string
    domain: string | null
}

type TenantRow = {
    id: string | number
    code: string
    name: string
    domain: string | null
}

type Snapshot = {
    byHostname: Map<string, TenantContext>
    byTenantId: Map<number, TenantContext>
}

export function normalizeHostname(value: string): string {
    const trimmed = value.trim().toLowerCase().replace(/\.$/, '')
    return trimmed.replace(/:\d+$/, '').replace(/\.$/, '')
}

export class TenantRegistry {
    private snapshot: Snapshot = {
        byHostname: new Map(),
        byTenantId: new Map(),
    }

    constructor(
        private readonly pool: Pick<Pool, 'query'>,
        private readonly baseDomain: string,
        private readonly platformHost: string,
    ) {}

    async load(): Promise<void> {
        await this.reload()
    }

    async reload(): Promise<void> {
        const result = await this.pool.query<TenantRow>(
            "SELECT id, code, name, domain FROM tenant WHERE status = 'ACTIVE'",
        )
        const next: Snapshot = {
            byHostname: new Map(),
            byTenantId: new Map(),
        }
        const platform = normalizeHostname(this.platformHost)
        const base = normalizeHostname(this.baseDomain)

        for (const row of result.rows) {
            const id = Number(row.id)
            if (!Number.isSafeInteger(id) || id < 1) {
                throw new Error('Invalid tenant ID in routing data')
            }
            const tenant: TenantContext = {
                id,
                code: row.code,
                name: row.name,
                domain: row.domain,
            }
            const hosts = [`${row.code}.${base}`, ...(row.domain ? [row.domain] : [])]
            for (const value of hosts) {
                const host = normalizeHostname(value)
                const existing = next.byHostname.get(host)
                if (!host || host === platform || (existing && existing.id !== id)) {
                    throw new Error(`Invalid or duplicate tenant hostname: ${host}`)
                }
                next.byHostname.set(host, tenant)
            }
            next.byTenantId.set(id, tenant)
        }
        this.snapshot = next
    }

    getByHostname(hostname: string): TenantContext | undefined {
        return this.snapshot.byHostname.get(normalizeHostname(hostname))
    }

    getByTenantId(id: number): TenantContext | undefined {
        return this.snapshot.byTenantId.get(id)
    }
}
