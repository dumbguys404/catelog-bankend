import { db } from '../../plugins/db.js'
import { publicObjectUrl } from '../../plugins/storage.js'
import { buildUpdate } from '../../utils/update-fields.js'
import type { ProductRow, ProductBody } from './product.schema.js'
import { productColumns } from './product.schema.js'

export const productSelect = `
    SELECT p.id, p.tenant_id, p.brand_id, p.name, p.slug, p.short_description,
           p.description, p.price, p.mrp, p.availability, p.status,
           p.display_order, p.created_at, p.updated_at,
           b.name AS brand_name, b.slug AS brand_slug,
           pi.id AS primary_image_id, pi.object_key AS primary_image_key,
           pi.alt_text AS primary_image_alt_text
    FROM product p
    LEFT JOIN brand b ON b.tenant_id = p.tenant_id AND b.id = p.brand_id
    LEFT JOIN LATERAL (
        SELECT id, object_key, alt_text
        FROM product_image
        WHERE tenant_id = p.tenant_id AND product_id = p.id
        ORDER BY is_primary DESC, display_order, id
        LIMIT 1
    ) pi ON TRUE
`

export function mapPublicProduct(row: ProductRow) {
    return {
        id: Number(row.id),
        brandId: row.brand_id === null ? null : Number(row.brand_id),
        name: row.name,
        slug: row.slug,
        shortDescription: row.short_description,
        description: row.description,
        price: row.price === null ? null : Number(row.price),
        mrp: row.mrp === null ? null : Number(row.mrp),
        availability: row.availability,
        displayOrder: row.display_order,
        brand:
            row.brand_id === null
                ? null
                : {
                      id: Number(row.brand_id),
                      name: row.brand_name,
                      slug: row.brand_slug,
                  },
        primaryImage:
            row.primary_image_id === null
                ? null
                : {
                      id: Number(row.primary_image_id),
                      objectKey: row.primary_image_key,
                      url: row.primary_image_key ? publicObjectUrl(row.primary_image_key) : null,
                      altText: row.primary_image_alt_text,
                  },
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    }
}

export function mapAdminProduct(row: ProductRow) {
    return {
        ...mapPublicProduct(row),
        tenantId: Number(row.tenant_id),
        status: row.status,
    }
}

export async function productExists(tenantId: number, productId: number): Promise<boolean> {
    const result = await db.query('SELECT 1 FROM product WHERE tenant_id = $1 AND id = $2', [
        tenantId,
        productId,
    ])
    return Boolean(result.rows[0])
}

export async function brandExists(tenantId: number, brandId: number): Promise<boolean> {
    const result = await db.query('SELECT 1 FROM brand WHERE tenant_id = $1 AND id = $2', [
        tenantId,
        brandId,
    ])
    return Boolean(result.rows[0])
}

export async function getAdminProducts(tenantId: number, limit: number, offset: number) {
    const [rows, count] = await Promise.all([
        db.query<ProductRow>(
            `${productSelect} WHERE p.tenant_id=$1 ORDER BY p.display_order,p.created_at DESC,p.id DESC LIMIT $2 OFFSET $3`,
            [tenantId, limit, offset],
        ),
        db.query<{ total: string }>(
            'SELECT COUNT(*)::text AS total FROM product WHERE tenant_id=$1',
            [tenantId],
        ),
    ])
    return { rows: rows.rows, count: Number(count.rows[0]?.total ?? 0) }
}

export async function getAdminProduct(tenantId: number, id: number) {
    const result = await db.query<ProductRow>(`${productSelect} WHERE p.tenant_id=$1 AND p.id=$2`, [
        tenantId,
        id,
    ])
    return result.rows[0]
}

export async function createAdminProduct(tenantId: number, body: ProductBody) {
    const inserted = await db.query<{ id: string | number }>(
        `INSERT INTO product (tenant_id,brand_id,name,slug,short_description,description,price,mrp,availability,status,display_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [
            tenantId,
            body.brandId ?? null,
            body.name,
            body.slug,
            body.shortDescription ?? null,
            body.description ?? null,
            body.price ?? null,
            body.mrp ?? null,
            body.availability ?? 'AVAILABLE',
            body.status ?? 'ACTIVE',
            body.displayOrder ?? 0,
        ],
    )
    const result = await db.query<ProductRow>(`${productSelect} WHERE p.tenant_id=$1 AND p.id=$2`, [
        tenantId,
        Number(inserted.rows[0]!.id),
    ])
    return result.rows[0]
}

export async function updateAdminProduct(tenantId: number, id: number, body: ProductBody) {
    const { assignments, values } = buildUpdate(body, productColumns, [tenantId, id])
    const changed = await db.query(
        `UPDATE product SET ${assignments} WHERE tenant_id = $1 AND id = $2 RETURNING id`,
        values,
    )
    if (!changed.rows[0]) return undefined
    const result = await db.query<ProductRow>(`${productSelect} WHERE p.tenant_id=$1 AND p.id=$2`, [
        tenantId,
        id,
    ])
    return result.rows[0]
}

export async function deleteAdminProduct(tenantId: number, id: number) {
    const result = await db.query(
        "UPDATE product SET status='INACTIVE' WHERE tenant_id=$1 AND id=$2",
        [tenantId, id],
    )
    return result.rowCount ?? 0
}

export async function getCatalogProducts(tenantId: number, limit: number, offset: number) {
    const [rows, count] = await Promise.all([
        db.query<ProductRow>(
            `${productSelect} WHERE p.tenant_id=$1 AND p.status='ACTIVE' ORDER BY p.display_order,p.created_at DESC,p.id DESC LIMIT $2 OFFSET $3`,
            [tenantId, limit, offset],
        ),
        db.query<{ total: string }>(
            "SELECT COUNT(*)::text AS total FROM product WHERE tenant_id=$1 AND status='ACTIVE'",
            [tenantId],
        ),
    ])
    return { rows: rows.rows, count: Number(count.rows[0]?.total ?? 0) }
}

export async function getCatalogProduct(tenantId: number, id: number) {
    const result = await db.query<ProductRow>(
        `${productSelect} WHERE p.tenant_id=$1 AND p.id=$2 AND p.status='ACTIVE'`,
        [tenantId, id],
    )
    return result.rows[0]
}
