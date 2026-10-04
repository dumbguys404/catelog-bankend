import type { FastifyPluginAsync } from 'fastify'
import { db } from '../../db/pool.js'
import { getTenantContext } from '../../plugins/tenant-context.js'
import { publicObjectUrl } from '../../storage/r2.js'
import { idParamsSchema } from '../../utils/query.js'

const collectionIdParamsSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['collectionId'],
    properties: { collectionId: { type: 'integer', minimum: 1 } },
}
type CollectionRow = {
    id: string | number
    name: string
    slug: string
    collection_type: 'NEW_ARRIVAL' | 'TRENDING' | 'FESTIVAL' | 'FEATURED'
    description: string | null
    image_key: string | null
    start_at: string | Date | null
    end_at: string | Date | null
    display_order: number
}
type ProductRow = {
    id: string | number
    name: string
    slug: string
    price: string | number | null
    mrp: string | number | null
    availability: string
    display_order: number
    object_key: string | null
    alt_text: string | null
}
const activeWindow = `status='ACTIVE' AND (start_at IS NULL OR start_at<=NOW()) AND (end_at IS NULL OR end_at>=NOW())`
function mapCollection(row: CollectionRow) {
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
export const catalogCollectionRoutes: FastifyPluginAsync = async (app) => {
    app.get('/', async (request) => {
        const result = await db.query<CollectionRow>(
            `SELECT id,name,slug,collection_type,description,image_key,start_at,end_at,display_order
            FROM collection WHERE tenant_id=$1 AND ${activeWindow} ORDER BY display_order,name,id`,
            [getTenantContext(request).id],
        )
        return { data: result.rows.map(mapCollection) }
    })
    app.get('/:id', { schema: { params: idParamsSchema } }, async (request, reply) => {
        const { id } = request.params as { id: number }
        const result = await db.query<CollectionRow>(
            `SELECT id,name,slug,collection_type,description,image_key,start_at,end_at,display_order
            FROM collection WHERE tenant_id=$1 AND id=$2 AND ${activeWindow}`,
            [getTenantContext(request).id, id],
        )
        if (!result.rows[0])
            return reply.code(404).send({ error: 'NOT_FOUND', message: 'Collection not found' })
        return { data: mapCollection(result.rows[0]) }
    })
    app.get(
        '/:collectionId/products',
        { schema: { params: collectionIdParamsSchema } },
        async (request, reply) => {
            const tenantId = getTenantContext(request).id,
                { collectionId } = request.params as { collectionId: number }
            const collection = await db.query(
                `SELECT 1 FROM collection WHERE tenant_id=$1 AND id=$2 AND ${activeWindow}`,
                [tenantId, collectionId],
            )
            if (!collection.rows[0])
                return reply.code(404).send({ error: 'NOT_FOUND', message: 'Collection not found' })
            const result = await db.query<ProductRow>(
                `SELECT p.id,p.name,p.slug,p.price,p.mrp,p.availability,cp.display_order,pi.object_key,pi.alt_text
            FROM collection_product cp JOIN product p ON p.tenant_id=cp.tenant_id AND p.id=cp.product_id
            LEFT JOIN LATERAL (SELECT object_key,alt_text FROM product_image WHERE tenant_id=p.tenant_id AND product_id=p.id ORDER BY is_primary DESC,display_order,id LIMIT 1) pi ON TRUE
            WHERE cp.tenant_id=$1 AND cp.collection_id=$2 AND p.status='ACTIVE' ORDER BY cp.display_order,p.id`,
                [tenantId, collectionId],
            )
            return {
                data: result.rows.map((row) => ({
                    id: Number(row.id),
                    name: row.name,
                    slug: row.slug,
                    price: row.price === null ? null : Number(row.price),
                    mrp: row.mrp === null ? null : Number(row.mrp),
                    availability: row.availability,
                    displayOrder: row.display_order,
                    primaryImage: row.object_key
                        ? {
                              objectKey: row.object_key,
                              url: publicObjectUrl(row.object_key),
                              altText: row.alt_text,
                          }
                        : null,
                })),
            }
        },
    )
}
