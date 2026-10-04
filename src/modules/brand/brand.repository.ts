import { db } from '../../plugins/db.js'
import { buildUpdate } from '../../utils/update-fields.js'
import { publicObjectUrl } from '../../plugins/storage.js'
import type { AdminBrandRow, CatalogBrandRow, BrandBody } from './brand.schema.js'
import { brandColumns } from './brand.schema.js'

export function mapAdminBrand(row: AdminBrandRow) {
    return {
        id: Number(row.id),
        tenantId: Number(row.tenant_id),
        name: row.name,
        slug: row.slug,
        description: row.description,
        logoKey: row.logo_key,
        logoUrl: row.logo_key ? publicObjectUrl(row.logo_key) : null,
        websiteUrl: row.website_url,
        displayOrder: row.display_order,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    }
}

export function mapCatalogBrand(row: CatalogBrandRow) {
    return {
        id: Number(row.id),
        name: row.name,
        slug: row.slug,
        description: row.description,
        logoKey: row.logo_key,
        logoUrl: row.logo_key ? publicObjectUrl(row.logo_key) : null,
        websiteUrl: row.website_url,
        displayOrder: row.display_order,
    }
}

export async function adminListBrands(tenantId: number, limit: number, offset: number) {
    const [rows, count] = await Promise.all([
        db.query<AdminBrandRow>(
            `SELECT id,tenant_id,name,slug,description,logo_key,website_url,display_order,status,created_at,updated_at
            FROM brand WHERE tenant_id=$1 ORDER BY display_order,name,id LIMIT $2 OFFSET $3`,
            [tenantId, limit, offset],
        ),
        db.query<{ total: string }>(
            'SELECT COUNT(*)::text AS total FROM brand WHERE tenant_id=$1',
            [tenantId],
        ),
    ])
    return { rows: rows.rows, count: Number(count.rows[0]?.total ?? 0) }
}

export async function adminGetBrand(tenantId: number, id: number) {
    const result = await db.query<AdminBrandRow>(
        `SELECT id,tenant_id,name,slug,description,logo_key,website_url,display_order,status,created_at,updated_at
        FROM brand WHERE tenant_id=$1 AND id=$2`,
        [tenantId, id],
    )
    return result.rows[0]
}

export async function adminCreateBrand(tenantId: number, body: BrandBody) {
    const result = await db.query<AdminBrandRow>(
        `INSERT INTO brand
        (tenant_id,name,slug,description,logo_key,website_url,display_order,status)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        RETURNING id,tenant_id,name,slug,description,logo_key,website_url,display_order,status,created_at,updated_at`,
        [
            tenantId,
            body.name,
            body.slug,
            body.description ?? null,
            body.logoKey ?? null,
            body.websiteUrl ?? null,
            body.displayOrder ?? 0,
            body.status ?? 'ACTIVE',
        ],
    )
    return result.rows[0]
}

export async function adminUpdateBrand(tenantId: number, id: number, body: BrandBody) {
    const { assignments, values } = buildUpdate(body, brandColumns, [tenantId, id])
    const result = await db.query<AdminBrandRow>(
        `UPDATE brand SET ${assignments}
        WHERE tenant_id=$1 AND id=$2 RETURNING id,tenant_id,name,slug,description,logo_key,website_url,display_order,status,created_at,updated_at`,
        values,
    )
    return result.rows[0]
}

export async function adminDeleteBrand(tenantId: number, id: number) {
    const result = await db.query('DELETE FROM brand WHERE tenant_id=$1 AND id=$2', [tenantId, id])
    return result.rowCount ?? 0
}

export async function catalogListBrands(tenantId: number) {
    const result = await db.query<CatalogBrandRow>(
        `SELECT id,name,slug,description,logo_key,website_url,display_order
        FROM brand WHERE tenant_id=$1 AND status='ACTIVE' ORDER BY display_order,name,id`,
        [tenantId],
    )
    return result.rows
}

export async function catalogGetBrand(tenantId: number, id: number) {
    const result = await db.query<CatalogBrandRow>(
        `SELECT id,name,slug,description,logo_key,website_url,display_order
        FROM brand WHERE tenant_id=$1 AND id=$2 AND status='ACTIVE'`,
        [tenantId, id],
    )
    return result.rows[0]
}
