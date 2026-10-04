import { db } from '../../plugins/db.js'
import { buildUpdate } from '../../utils/update-fields.js'
import type { TenantRow, TenantBody } from './tenant.schema.js'
import { tenantColumns } from './tenant.schema.js'

export function mapTenant(row: TenantRow) {
    return {
        id: Number(row.id),
        code: row.code,
        name: row.name,
        domain: row.domain,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    }
}

export async function listTenants(limit: number, offset: number) {
    const [rows, count] = await Promise.all([
        db.query<TenantRow>(
            'SELECT id,code,name,domain,status,created_at,updated_at FROM tenant ORDER BY id LIMIT $1 OFFSET $2',
            [limit, offset],
        ),
        db.query<{ total: string }>('SELECT COUNT(*)::text AS total FROM tenant'),
    ])
    return { rows: rows.rows, count: Number(count.rows[0]?.total ?? 0) }
}

export async function getTenant(id: number) {
    const result = await db.query<TenantRow>(
        'SELECT id,code,name,domain,status,created_at,updated_at FROM tenant WHERE id=$1',
        [id],
    )
    return result.rows[0]
}

export async function listTenantHostsExcept(id: number | null) {
    const result = await db.query<Pick<TenantRow, 'code' | 'domain'>>(
        'SELECT code, domain FROM tenant WHERE $1::bigint IS NULL OR id <> $1',
        [id],
    )
    return result.rows
}

export async function createTenant(body: TenantBody) {
    const result = await db.query<TenantRow>(
        'INSERT INTO tenant (code,name,domain,status) VALUES ($1,$2,$3,$4) RETURNING id,code,name,domain,status,created_at,updated_at',
        [body.code, body.name, body.domain ?? null, body.status ?? 'ACTIVE'],
    )
    return result.rows[0]
}

export async function updateTenant(id: number, body: TenantBody) {
    const { assignments, values } = buildUpdate(body, tenantColumns, [id])
    const result = await db.query<TenantRow>(
        `UPDATE tenant SET ${assignments} WHERE id=$1 RETURNING id,code,name,domain,status,created_at,updated_at`,
        values,
    )
    return result.rows[0]
}

export async function tenantExists(id: number) {
    const current = await db.query('SELECT 1 FROM tenant WHERE id=$1', [id])
    return current.rows[0] !== undefined
}

export async function tenantHasData(id: number) {
    const data = await db.query<{ has_data: boolean }>(
        `SELECT EXISTS(SELECT 1 FROM app_user WHERE tenant_id=$1 UNION ALL SELECT 1 FROM category WHERE tenant_id=$1 UNION ALL SELECT 1 FROM brand WHERE tenant_id=$1 UNION ALL SELECT 1 FROM product WHERE tenant_id=$1 UNION ALL SELECT 1 FROM collection WHERE tenant_id=$1) AS has_data`,
        [id],
    )
    return data.rows[0]?.has_data ?? false
}

export async function deactivateTenant(id: number) {
    await db.query("UPDATE tenant SET status='INACTIVE' WHERE id=$1", [id])
}

export async function deleteTenantData(id: number) {
    await db.query('DELETE FROM tenant WHERE id=$1', [id])
}
