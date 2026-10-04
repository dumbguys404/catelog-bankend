import type { FastifyPluginAsync } from 'fastify'
import { mapAdminImage, type ImageRow } from '../../catalog/product-images.js'
import {
    brandExists,
    mapAdminProduct,
    productSelect,
    type ProductRow,
} from '../../catalog/products.js'
import { db } from '../../db/pool.js'
import { buildUpdate } from '../../db/update-fields.js'
import { getTenantContext } from '../../plugins/tenant-context.js'
import { hasDatabaseCode } from '../../utils/db-errors.js'
import {
    availabilityValues,
    idParamsSchema,
    paginationQueryProperties,
    parseLimit,
    parsePage,
    type QueryRecord,
} from '../../utils/query.js'
import { adminProductImageRoutes } from './product-image.routes.js'
import { adminProductCategoryRoutes } from './product-category.routes.js'

type CategoryRow = { id: string | number; name: string; slug: string }

const listQuerySchema = {
    type: 'object',
    additionalProperties: false,
    properties: paginationQueryProperties,
}
const productProperties = {
    brandId: { type: ['integer', 'null'], minimum: 1 },
    name: { type: 'string', minLength: 1, maxLength: 200 },
    slug: { type: 'string', minLength: 1, maxLength: 220 },
    shortDescription: { type: ['string', 'null'], maxLength: 500 },
    description: { type: ['string', 'null'] },
    price: { type: ['number', 'null'], minimum: 0 },
    mrp: { type: ['number', 'null'], minimum: 0 },
    availability: { type: 'string', enum: availabilityValues },
    status: { type: 'string', enum: ['ACTIVE', 'INACTIVE'] },
    displayOrder: { type: 'integer', minimum: 0 },
}
const createProductBodySchema = {
    type: 'object',
    additionalProperties: false,
    required: ['name', 'slug'],
    properties: productProperties,
}
const updateProductBodySchema = {
    type: 'object',
    additionalProperties: false,
    minProperties: 1,
    properties: productProperties,
}
type ProductBody = {
    brandId?: number | null
    name?: string
    slug?: string
    shortDescription?: string | null
    description?: string | null
    price?: number | null
    mrp?: number | null
    availability?: (typeof availabilityValues)[number]
    status?: 'ACTIVE' | 'INACTIVE'
    displayOrder?: number
}
const productColumns: Partial<Record<keyof ProductBody, string>> = {
    brandId: 'brand_id',
    name: 'name',
    slug: 'slug',
    shortDescription: 'short_description',
    description: 'description',
    price: 'price',
    mrp: 'mrp',
    availability: 'availability',
    status: 'status',
    displayOrder: 'display_order',
}
export const adminProductRoutes: FastifyPluginAsync = async (app) => {
    app.get('/', { schema: { querystring: listQuerySchema } }, async (request) => {
        const tenantId = getTenantContext(request).id,
            query = request.query as QueryRecord,
            page = parsePage(query),
            limit = parseLimit(query),
            offset = (page - 1) * limit
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
        return {
            data: rows.rows.map(mapAdminProduct),
            pagination: { page, limit, total: Number(count.rows[0]?.total ?? 0) },
        }
    })
    app.get('/:id', { schema: { params: idParamsSchema } }, async (request, reply) => {
        const tenantId = getTenantContext(request).id,
            { id } = request.params as { id: number }
        const product = await db.query<ProductRow>(
                `${productSelect} WHERE p.tenant_id=$1 AND p.id=$2`,
                [tenantId, id],
            ),
            row = product.rows[0]
        if (!row) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Product not found' })
        const [images, categories] = await Promise.all([
            db.query<ImageRow>(
                'SELECT id,tenant_id,product_id,object_key,alt_text,is_primary,display_order,created_at FROM product_image WHERE tenant_id=$1 AND product_id=$2 ORDER BY is_primary DESC,display_order,id',
                [tenantId, id],
            ),
            db.query<CategoryRow>(
                `SELECT c.id,c.name,c.slug FROM product_category pc JOIN category c ON c.tenant_id=pc.tenant_id AND c.id=pc.category_id WHERE pc.tenant_id=$1 AND pc.product_id=$2 ORDER BY c.display_order,c.name,c.id`,
                [tenantId, id],
            ),
        ])
        return {
            data: {
                ...mapAdminProduct(row),
                images: images.rows.map(mapAdminImage),
                categories: categories.rows.map((c) => ({
                    id: Number(c.id),
                    name: c.name,
                    slug: c.slug,
                })),
            },
        }
    })
    app.post('/', { schema: { body: createProductBodySchema } }, async (request, reply) => {
        const tenantId = getTenantContext(request).id,
            body = request.body as ProductBody
        if (body.brandId != null && !(await brandExists(tenantId, body.brandId)))
            return reply
                .code(400)
                .send({ error: 'BAD_REQUEST', message: 'Brand does not belong to this tenant' })
        try {
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
            const result = await db.query<ProductRow>(
                `${productSelect} WHERE p.tenant_id=$1 AND p.id=$2`,
                [tenantId, Number(inserted.rows[0]!.id)],
            )
            return reply.code(201).send({ data: mapAdminProduct(result.rows[0]!) })
        } catch (error) {
            if (hasDatabaseCode(error, '23505'))
                return reply.code(409).send({
                    error: 'CONFLICT',
                    message: 'Product slug already exists for this tenant',
                })
            if (hasDatabaseCode(error, '23503'))
                return reply
                    .code(400)
                    .send({ error: 'BAD_REQUEST', message: 'Brand does not belong to this tenant' })
            throw error
        }
    })
    app.patch(
        '/:id',
        { schema: { params: idParamsSchema, body: updateProductBodySchema } },
        async (request, reply) => {
            const tenantId = getTenantContext(request).id,
                { id } = request.params as { id: number },
                body = request.body as ProductBody
            if (body.brandId != null && !(await brandExists(tenantId, body.brandId)))
                return reply
                    .code(400)
                    .send({ error: 'BAD_REQUEST', message: 'Brand does not belong to this tenant' })
            const { assignments, values } = buildUpdate(body, productColumns, [tenantId, id])
            try {
                const changed = await db.query(
                    `UPDATE product SET ${assignments} WHERE tenant_id = $1 AND id = $2 RETURNING id`,
                    values,
                )
                if (!changed.rows[0])
                    return reply
                        .code(404)
                        .send({ error: 'NOT_FOUND', message: 'Product not found' })
                const result = await db.query<ProductRow>(
                    `${productSelect} WHERE p.tenant_id=$1 AND p.id=$2`,
                    [tenantId, id],
                )
                return { data: mapAdminProduct(result.rows[0]!) }
            } catch (error) {
                if (hasDatabaseCode(error, '23505'))
                    return reply.code(409).send({
                        error: 'CONFLICT',
                        message: 'Product slug already exists for this tenant',
                    })
                if (hasDatabaseCode(error, '23503'))
                    return reply.code(400).send({
                        error: 'BAD_REQUEST',
                        message: 'Brand does not belong to this tenant',
                    })
                throw error
            }
        },
    )
    app.delete('/:id', { schema: { params: idParamsSchema } }, async (request, reply) => {
        const { id } = request.params as { id: number },
            result = await db.query(
                "UPDATE product SET status='INACTIVE' WHERE tenant_id=$1 AND id=$2",
                [getTenantContext(request).id, id],
            )
        if (!result.rowCount)
            return reply.code(404).send({ error: 'NOT_FOUND', message: 'Product not found' })
        return reply.code(204).send()
    })
    app.register(adminProductImageRoutes)
    app.register(adminProductCategoryRoutes)
}
