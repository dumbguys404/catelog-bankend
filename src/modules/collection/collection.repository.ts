import { db } from '../../plugins/db.js'
import { publicObjectUrl } from '../../plugins/storage.js'
import { buildUpdate } from '../../utils/update-fields.js'
import type {
    AdminCollectionRow,
    CatalogCollectionRow,
    CollectionBody,
} from './collection.schema.js'
import { collectionColumns } from './collection.schema.js'

export const activeWindow = `status='ACTIVE' AND (start_at IS NULL OR start_at<=NOW()) AND (end_at IS NULL OR end_at>=NOW())`

export function mapAdminCollection(row: AdminCollectionRow) {
    return {
        id: Number(row.id),
        tenantId: Number(row.tenant_id),
        name: row.name,
        slug: row.slug,
        type: row.collection_type,
        description: row.description,
        imageKey: row.image_key,
        imageUrl: row.image_key ? publicObjectUrl(row.image_key) : null,
        startAt: row.start_at,
        endAt: row.end_at,
        displayOrder: row.display_order,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    }
}

export function mapCatalogCollection(row: CatalogCollectionRow) {
    return {
        id: Number(row.id),
        name: row.name,
        slug: row.slug,
        type: row.collection_type,
        description: row.description,
        imageKey: row.image_key,
        imageUrl: row.image_key ? publicObjectUrl(row.image_key) : null,
        startAt: row.start_at,
        endAt: row.end_at,
        displayOrder: row.display_order,
    }
}
