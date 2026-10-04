import type { FastifyPluginAsync } from 'fastify'
import { mapPublicProduct, productSelect, type ProductRow } from '../../catalog/products.js'
import { db } from '../../db/pool.js'
import { getTenantContext } from '../../plugins/tenant-context.js'
import { publicObjectUrl } from '../../storage/r2.js'
import {
    idParamsSchema,
    paginationQueryProperties,
    parseLimit,
    parsePage,
    type QueryRecord,
} from '../../utils/query.js'

const listQuerySchema = {
    type: 'object',
    additionalProperties: false,
    properties: paginationQueryProperties,
}
type ImageRow = {
    id: string | number
    object_key: string
    alt_text: string | null
    is_primary: boolean
    display_order: number
}
type CategoryRow = { id: string | number; name: string; slug: string }

export const catalogProductRoutes: FastifyPluginAsync = async (app) => {
    app.get('/', { schema: { querystring: listQuerySchema } }, async (request) => {
        const tenantId = getTenantContext(request).id,
            query = request.query as QueryRecord,
            page = parsePage(query),
            limit = parseLimit(query),
            offset = (page - 1) * limit
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
        return {
            data: rows.rows.map(mapPublicProduct),
            pagination: { page, limit, total: Number(count.rows[0]?.total ?? 0) },
        }
    })
    app.get('/:id', { schema: { params: idParamsSchema } }, async (request, reply) => {
        const tenantId = getTenantContext(request).id,
            { id } = request.params as { id: number }
        const result = await db.query<ProductRow>(
                `${productSelect} WHERE p.tenant_id=$1 AND p.id=$2 AND p.status='ACTIVE'`,
                [tenantId, id],
            ),
            row = result.rows[0]
        if (!row) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Product not found' })
        const [images, categories] = await Promise.all([
            db.query<ImageRow>(
                'SELECT id,object_key,alt_text,is_primary,display_order FROM product_image WHERE tenant_id=$1 AND product_id=$2 ORDER BY is_primary DESC,display_order,id',
                [tenantId, id],
            ),
            db.query<CategoryRow>(
                `SELECT c.id,c.name,c.slug FROM product_category pc JOIN category c ON c.tenant_id=pc.tenant_id AND c.id=pc.category_id WHERE pc.tenant_id=$1 AND pc.product_id=$2 AND c.status='ACTIVE' ORDER BY c.display_order,c.name,c.id`,
                [tenantId, id],
            ),
        ])
        return {
            data: {
                ...mapPublicProduct(row),
                images: images.rows.map((image) => ({
                    id: Number(image.id),
                    objectKey: image.object_key,
                    url: publicObjectUrl(image.object_key),
                    altText: image.alt_text,
                    isPrimary: image.is_primary,
                    displayOrder: image.display_order,
                })),
                categories: categories.rows.map((c) => ({
                    id: Number(c.id),
                    name: c.name,
                    slug: c.slug,
                })),
            },
        }
    })
}
