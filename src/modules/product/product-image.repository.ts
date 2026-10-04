import { publicObjectUrl } from '../../plugins/storage.js'
import type { ImageRow } from './product-image.schema.js'

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
