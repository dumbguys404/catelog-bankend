import type { FastifyRequest, FastifyReply } from 'fastify'
import { db } from '../../plugins/db.js'
import { getTenantContext } from '../../plugins/tenant-context.js'
import { productExists } from './product.repository.js'

export const productCategoriesBodySchema = {
    type: 'object',
    additionalProperties: false,
    required: ['categoryIds'],
    properties: {
        categoryIds: { type: 'array', uniqueItems: true, items: { type: 'integer', minimum: 1 } },
    },
}

export type ProductCategoriesBody = { categoryIds: number[] }
export type CategoryRow = { id: string | number; name: string; slug: string }

export async function listAdminProductCategories(request: FastifyRequest, reply: FastifyReply) {
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
}

export async function updateAdminProductCategories(request: FastifyRequest, reply: FastifyReply) {
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
            return reply.code(404).send({ error: 'NOT_FOUND', message: 'Product not found' })
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
        await client.query('DELETE FROM product_category WHERE tenant_id=$1 AND product_id=$2', [
            tenantId,
            productId,
        ])
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
}
