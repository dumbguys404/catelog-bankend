import type { FastifyPluginAsync } from 'fastify'
import { db } from '../../db/pool.js'
import { getTenantContext } from '../../plugins/tenant-context.js'

const collectionIdParamsSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['collectionId'],
    properties: { collectionId: { type: 'integer', minimum: 1 } },
}
const collectionProductsBodySchema = {
    type: 'object',
    additionalProperties: false,
    required: ['products'],
    properties: {
        products: {
            type: 'array',
            items: {
                type: 'object',
                additionalProperties: false,
                required: ['productId', 'displayOrder'],
                properties: {
                    productId: { type: 'integer', minimum: 1 },
                    displayOrder: { type: 'integer', minimum: 0 },
                },
            },
        },
    },
}
type CollectionProductsBody = { products: Array<{ productId: number; displayOrder: number }> }
type CollectionProductRow = {
    product_id: string | number
    display_order: number
    name: string
    slug: string
    status: 'ACTIVE' | 'INACTIVE'
}
export const adminCollectionProductRoutes: FastifyPluginAsync = async (app) => {
    app.get(
        '/:collectionId/products',
        { schema: { params: collectionIdParamsSchema } },
        async (request, reply) => {
            const { collectionId } = request.params as { collectionId: number },
                tenantId = getTenantContext(request).id
            const collection = await db.query(
                'SELECT 1 FROM collection WHERE tenant_id=$1 AND id=$2',
                [tenantId, collectionId],
            )
            if (!collection.rows[0])
                return reply.code(404).send({ error: 'NOT_FOUND', message: 'Collection not found' })
            const result = await db.query<CollectionProductRow>(
                `SELECT cp.product_id,cp.display_order,p.name,p.slug,p.status
            FROM collection_product cp JOIN product p ON p.tenant_id=cp.tenant_id AND p.id=cp.product_id
            WHERE cp.tenant_id=$1 AND cp.collection_id=$2 ORDER BY cp.display_order,cp.product_id`,
                [tenantId, collectionId],
            )
            return {
                data: result.rows.map((row) => ({
                    productId: Number(row.product_id),
                    name: row.name,
                    slug: row.slug,
                    status: row.status,
                    displayOrder: row.display_order,
                })),
            }
        },
    )
    app.put(
        '/:collectionId/products',
        { schema: { params: collectionIdParamsSchema, body: collectionProductsBodySchema } },
        async (request, reply) => {
            const { collectionId } = request.params as { collectionId: number },
                tenantId = getTenantContext(request).id
            const { products } = request.body as CollectionProductsBody,
                productIds = products.map((item) => item.productId)
            if (new Set(productIds).size !== productIds.length)
                return reply.code(400).send({
                    error: 'BAD_REQUEST',
                    message: 'A product can appear only once in a collection',
                })
            const client = await db.connect()
            try {
                await client.query('BEGIN')
                const collection = await client.query(
                    'SELECT id FROM collection WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
                    [tenantId, collectionId],
                )
                if (!collection.rows[0]) {
                    await client.query('ROLLBACK')
                    return reply
                        .code(404)
                        .send({ error: 'NOT_FOUND', message: 'Collection not found' })
                }
                if (productIds.length) {
                    const valid = await client.query(
                        'SELECT id FROM product WHERE tenant_id=$1 AND id=ANY($2::bigint[])',
                        [tenantId, productIds],
                    )
                    if (valid.rows.length !== productIds.length) {
                        await client.query('ROLLBACK')
                        return reply.code(400).send({
                            error: 'BAD_REQUEST',
                            message: 'One or more products do not belong to this tenant',
                        })
                    }
                }
                await client.query(
                    'DELETE FROM collection_product WHERE tenant_id=$1 AND collection_id=$2',
                    [tenantId, collectionId],
                )
                if (products.length) {
                    const values: unknown[] = []
                    const rows = products.map((product, index) => {
                        const base = index * 4
                        values.push(tenantId, collectionId, product.productId, product.displayOrder)
                        return `($${base + 1},$${base + 2},$${base + 3},$${base + 4})`
                    })
                    await client.query(
                        `INSERT INTO collection_product (tenant_id,collection_id,product_id,display_order) VALUES ${rows.join(',')}`,
                        values,
                    )
                }
                await client.query('COMMIT')
                return { data: { collectionId, products } }
            } catch (error) {
                await client.query('ROLLBACK')
                throw error
            } finally {
                client.release()
            }
        },
    )
}
