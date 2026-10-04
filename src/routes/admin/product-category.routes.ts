import type { FastifyPluginAsync } from 'fastify'
import { productExists } from '../../catalog/products.js'
import { db } from '../../db/pool.js'
import { getTenantContext } from '../../plugins/tenant-context.js'

const productIdParamsSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['productId'],
    properties: { productId: { type: 'integer', minimum: 1 } },
}
const productCategoriesBodySchema = {
    type: 'object',
    additionalProperties: false,
    required: ['categoryIds'],
    properties: {
        categoryIds: { type: 'array', uniqueItems: true, items: { type: 'integer', minimum: 1 } },
    },
}

type ProductCategoriesBody = { categoryIds: number[] }
type CategoryRow = { id: string | number; name: string; slug: string }
export const adminProductCategoryRoutes: FastifyPluginAsync = async (app) => {
    app.get(
        '/:productId/categories',
        { schema: { params: productIdParamsSchema } },
        async (request, reply) => {
            const tenantId = getTenantContext(request).id,
                { productId } = request.params as { productId: number }
            if (!(await productExists(tenantId, productId)))
                return reply.code(404).send({ error: 'NOT_FOUND', message: 'Product not found' })
            const result = await db.query<CategoryRow>(
                `SELECT c.id,c.name,c.slug FROM product_category pc JOIN category c ON c.tenant_id=pc.tenant_id AND c.id=pc.category_id WHERE pc.tenant_id=$1 AND pc.product_id=$2 ORDER BY c.display_order,c.name,c.id`,
                [tenantId, productId],
            )
            return {
                data: result.rows.map((c) => ({ id: Number(c.id), name: c.name, slug: c.slug })),
            }
        },
    )
    app.put(
        '/:productId/categories',
        { schema: { params: productIdParamsSchema, body: productCategoriesBodySchema } },
        async (request, reply) => {
            const tenantId = getTenantContext(request).id,
                { productId } = request.params as { productId: number },
                { categoryIds } = request.body as ProductCategoriesBody,
                client = await db.connect()
            try {
                await client.query('BEGIN')
                const product = await client.query(
                    'SELECT id FROM product WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
                    [tenantId, productId],
                )
                if (!product.rows[0]) {
                    await client.query('ROLLBACK')
                    return reply
                        .code(404)
                        .send({ error: 'NOT_FOUND', message: 'Product not found' })
                }
                if (categoryIds.length) {
                    const categories = await client.query(
                        'SELECT id FROM category WHERE tenant_id=$1 AND id=ANY($2::bigint[])',
                        [tenantId, categoryIds],
                    )
                    if (categories.rows.length !== categoryIds.length) {
                        await client.query('ROLLBACK')
                        return reply.code(400).send({
                            error: 'BAD_REQUEST',
                            message: 'One or more categories do not belong to this tenant',
                        })
                    }
                }
                await client.query(
                    'DELETE FROM product_category WHERE tenant_id=$1 AND product_id=$2',
                    [tenantId, productId],
                )
                if (categoryIds.length)
                    await client.query(
                        'INSERT INTO product_category (tenant_id, product_id, category_id) SELECT $1, $2, u.category_id FROM UNNEST($3::bigint[]) AS u(category_id)',
                        [tenantId, productId, categoryIds],
                    )
                await client.query('COMMIT')
                return { data: { productId, categoryIds } }
            } catch (error) {
                await client.query('ROLLBACK')
                throw error
            } finally {
                client.release()
            }
        },
    )
}
