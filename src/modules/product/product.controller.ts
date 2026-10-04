import type { FastifyRequest, FastifyReply } from 'fastify'
import { getTenantContext } from '../../plugins/tenant-context.js'
import { hasDatabaseCode } from '../../utils/db-errors.js'
import { parseLimit, parsePage, type QueryRecord } from '../../utils/query.js'
import { db } from '../../plugins/db.js'
import { publicObjectUrl } from '../../plugins/storage.js'
import { mapAdminImage } from './product-image.repository.js'
import type { ImageRow } from './product-image.schema.js'
import type { CategoryRow, ProductBody } from './product.schema.js'
import {
    brandExists,
    mapAdminProduct,
    mapPublicProduct,
    getAdminProducts,
    getAdminProduct,
    createAdminProduct,
    updateAdminProduct,
    deleteAdminProduct,
    getCatalogProducts,
    getCatalogProduct,
} from './product.repository.js'

export async function listAdminProducts(request: FastifyRequest) {
    const tenantId = getTenantContext(request).id,
        query = request.query as QueryRecord,
        page = parsePage(query),
        limit = parseLimit(query),
        offset = (page - 1) * limit
    const { rows, count } = await getAdminProducts(tenantId, limit, offset)
    return {
        data: rows.map(mapAdminProduct),
        pagination: { page, limit, total: count },
    }
}

export async function getAdminProductHandler(request: FastifyRequest, reply: FastifyReply) {
    const tenantId = getTenantContext(request).id,
        { id } = request.params as { id: number }
    const row = await getAdminProduct(tenantId, id)
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
}

export async function createAdminProductHandler(request: FastifyRequest, reply: FastifyReply) {
    const tenantId = getTenantContext(request).id,
        body = request.body as ProductBody
    if (body.brandId != null && !(await brandExists(tenantId, body.brandId)))
        return reply
            .code(400)
            .send({ error: 'BAD_REQUEST', message: 'Brand does not belong to this tenant' })
    try {
        const row = await createAdminProduct(tenantId, body)
        return reply.code(201).send({ data: mapAdminProduct(row!) })
    } catch (error) {
        if (hasDatabaseCode(error, '23505'))
            return reply
                .code(409)
                .send({ error: 'CONFLICT', message: 'Product slug already exists for this tenant' })
        if (hasDatabaseCode(error, '23503'))
            return reply
                .code(400)
                .send({ error: 'BAD_REQUEST', message: 'Brand does not belong to this tenant' })
        throw error
    }
}

export async function updateAdminProductHandler(request: FastifyRequest, reply: FastifyReply) {
    const tenantId = getTenantContext(request).id,
        { id } = request.params as { id: number },
        body = request.body as ProductBody
    if (body.brandId != null && !(await brandExists(tenantId, body.brandId)))
        return reply
            .code(400)
            .send({ error: 'BAD_REQUEST', message: 'Brand does not belong to this tenant' })
    try {
        const row = await updateAdminProduct(tenantId, id, body)
        if (!row) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Product not found' })
        return { data: mapAdminProduct(row) }
    } catch (error) {
        if (hasDatabaseCode(error, '23505'))
            return reply
                .code(409)
                .send({ error: 'CONFLICT', message: 'Product slug already exists for this tenant' })
        if (hasDatabaseCode(error, '23503'))
            return reply
                .code(400)
                .send({ error: 'BAD_REQUEST', message: 'Brand does not belong to this tenant' })
        throw error
    }
}

export async function deleteAdminProductHandler(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: number }
    const count = await deleteAdminProduct(getTenantContext(request).id, id)
    if (!count) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Product not found' })
    return reply.code(204).send()
}

export async function listCatalogProducts(request: FastifyRequest) {
    const tenantId = getTenantContext(request).id,
        query = request.query as QueryRecord,
        page = parsePage(query),
        limit = parseLimit(query),
        offset = (page - 1) * limit
    const { rows, count } = await getCatalogProducts(tenantId, limit, offset)
    return {
        data: rows.map(mapPublicProduct),
        pagination: { page, limit, total: count },
    }
}

export async function getCatalogProductHandler(request: FastifyRequest, reply: FastifyReply) {
    const tenantId = getTenantContext(request).id,
        { id } = request.params as { id: number }
    const row = await getCatalogProduct(tenantId, id)
    if (!row) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Product not found' })
    const [images, categories] = await Promise.all([
        db.query<ImageRow>(
            'SELECT id,tenant_id,product_id,object_key,alt_text,is_primary,display_order,created_at FROM product_image WHERE tenant_id=$1 AND product_id=$2 ORDER BY is_primary DESC,display_order,id',
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
}
