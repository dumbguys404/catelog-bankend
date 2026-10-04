import { publicObjectUrl } from '../storage/r2.js'

export type ImageRow = {
    id: string | number
    tenant_id: string | number
    product_id: string | number
    object_key: string
    alt_text: string | null
    is_primary: boolean
    display_order: number
    created_at: string | Date
}

export function mapAdminImage(row: ImageRow) {
    return {
        id: Number(row.id),
        productId: Number(row.product_id),
        objectKey: row.object_key,
        url: publicObjectUrl(row.object_key),
        altText: row.alt_text,
        isPrimary: row.is_primary,
        displayOrder: row.display_order,
        createdAt: row.created_at,
    }
}
