import { db } from '../db/pool.js'
import { publicObjectUrl } from '../storage/r2.js'
import type { availabilityValues } from '../utils/query.js'

export type ProductRow = {
    id: string | number
    tenant_id: string | number
    brand_id: string | number | null
    name: string
    slug: string
    short_description: string | null
    description: string | null
    price: string | number | null
    mrp: string | number | null
    availability: (typeof availabilityValues)[number]
    status: 'ACTIVE' | 'INACTIVE'
    display_order: number
    created_at: string | Date
    updated_at: string | Date
    brand_name: string | null
    brand_slug: string | null
    primary_image_id: string | number | null
    primary_image_key: string | null
    primary_image_alt_text: string | null
}

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
