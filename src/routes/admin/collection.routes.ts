import type { FastifyPluginAsync, FastifyReply } from 'fastify'
import { db } from '../../db/pool.js'
import { getTenantContext } from '../../plugins/tenant-context.js'
import { publicObjectUrl } from '../../storage/r2.js'
import { hasDatabaseCode } from '../../utils/db-errors.js'
import { collectionTypes, idParamsSchema, paginationQueryProperties, parseLimit, parsePage, type QueryRecord } from '../../utils/query.js'

const collectionIdParamsSchema = { type: 'object', additionalProperties: false, required: ['collectionId'], properties: { collectionId: { type: 'integer', minimum: 1 } } }
const listQuerySchema = { type: 'object', additionalProperties: false, properties: paginationQueryProperties }
const collectionProperties = {
    name: { type: 'string', minLength: 1, maxLength: 150 }, slug: { type: 'string', minLength: 1, maxLength: 160 },
    type: { type: 'string', enum: collectionTypes }, description: { type: ['string', 'null'] },
    imageKey: { type: ['string', 'null'], maxLength: 500 }, startAt: { type: ['string', 'null'] }, endAt: { type: ['string', 'null'] },
    displayOrder: { type: 'integer', minimum: 0 }, status: { type: 'string', enum: ['ACTIVE', 'INACTIVE'] }
}
const createBodySchema = { type: 'object', additionalProperties: false, required: ['name', 'slug', 'type'], properties: collectionProperties }
const updateBodySchema = { type: 'object', additionalProperties: false, minProperties: 1, properties: collectionProperties }
const collectionProductsBodySchema = {
    type: 'object', additionalProperties: false, required: ['products'],
    properties: { products: { type: 'array', items: { type: 'object', additionalProperties: false,
        required: ['productId', 'displayOrder'], properties: { productId: { type: 'integer', minimum: 1 }, displayOrder: { type: 'integer', minimum: 0 } } } } }
}
type CollectionBody = { name?: string; slug?: string; type?: typeof collectionTypes[number]; description?: string | null; imageKey?: string | null; startAt?: string | null; endAt?: string | null; displayOrder?: number; status?: 'ACTIVE' | 'INACTIVE' }
type CollectionProductsBody = { products: Array<{ productId: number; displayOrder: number }> }
type CollectionRow = {
    id: string | number; tenant_id: string | number; name: string; slug: string; collection_type: typeof collectionTypes[number]
    description: string | null; image_key: string | null; start_at: string | Date | null; end_at: string | Date | null
    display_order: number; status: 'ACTIVE' | 'INACTIVE'; created_at: string | Date; updated_at: string | Date
}
type CollectionProductRow = { product_id: string | number; display_order: number; name: string; slug: string; status: 'ACTIVE' | 'INACTIVE' }
function mapCollection(row: CollectionRow) {
    return { id: Number(row.id), tenantId: Number(row.tenant_id), name: row.name, slug: row.slug, type: row.collection_type,
        description: row.description, imageKey: row.image_key, imageUrl: row.image_key ? publicObjectUrl(row.image_key) : null,
        startAt: row.start_at, endAt: row.end_at, displayOrder: row.display_order, status: row.status,
        createdAt: row.created_at, updatedAt: row.updated_at }
}
function validateDates(body: CollectionBody, reply: FastifyReply): boolean {
    const dates = [body.startAt, body.endAt].filter((value): value is string => value != null)
    if (dates.some(value => !Number.isFinite(Date.parse(value)))) {
        reply.code(400).send({ error: 'BAD_REQUEST', message: 'startAt and endAt must be valid ISO date/time strings' }); return false
    }
    if (body.startAt && body.endAt && Date.parse(body.endAt) < Date.parse(body.startAt)) {
        reply.code(400).send({ error: 'BAD_REQUEST', message: 'endAt must be greater than or equal to startAt' }); return false
    }
    return true
}

export const adminCollectionRoutes: FastifyPluginAsync = async (app) => {
    app.get('/', { schema: { querystring: listQuerySchema } }, async (request) => {
        const tenantId = getTenantContext(request).id, query = request.query as QueryRecord
        const page = parsePage(query), limit = parseLimit(query), offset = (page - 1) * limit
        const [rows, count] = await Promise.all([
            db.query<CollectionRow>(`SELECT id,tenant_id,name,slug,collection_type,description,image_key,start_at,end_at,display_order,status,created_at,updated_at
                FROM collection WHERE tenant_id=$1 ORDER BY display_order,name,id LIMIT $2 OFFSET $3`, [tenantId, limit, offset]),
            db.query<{ total: string }>('SELECT COUNT(*)::text AS total FROM collection WHERE tenant_id=$1', [tenantId])
        ])
        return { data: rows.rows.map(mapCollection), pagination: { page, limit, total: Number(count.rows[0]?.total ?? 0) } }
    })
    app.get('/:id', { schema: { params: idParamsSchema } }, async (request, reply) => {
        const { id } = request.params as { id: number }
        const result = await db.query<CollectionRow>(`SELECT id,tenant_id,name,slug,collection_type,description,image_key,start_at,end_at,display_order,status,created_at,updated_at
            FROM collection WHERE tenant_id=$1 AND id=$2`, [getTenantContext(request).id, id])
        if (!result.rows[0]) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Collection not found' })
        return { data: mapCollection(result.rows[0]) }
    })
    app.post('/', { schema: { body: createBodySchema } }, async (request, reply) => {
        const body = request.body as CollectionBody, tenantId = getTenantContext(request).id
        if (!validateDates(body, reply)) return
        try {
            const result = await db.query<CollectionRow>(`INSERT INTO collection
                (tenant_id,name,slug,collection_type,description,image_key,start_at,end_at,display_order,status)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
                RETURNING id,tenant_id,name,slug,collection_type,description,image_key,start_at,end_at,display_order,status,created_at,updated_at`,
                [tenantId, body.name, body.slug, body.type, body.description ?? null, body.imageKey ?? null,
                    body.startAt ?? null, body.endAt ?? null, body.displayOrder ?? 0, body.status ?? 'ACTIVE'])
            return reply.code(201).send({ data: mapCollection(result.rows[0]!) })
        } catch (error) {
            if (hasDatabaseCode(error, '23505')) return reply.code(409).send({ error: 'CONFLICT', message: 'Collection slug already exists for this tenant' })
            if (hasDatabaseCode(error, '23514')) return reply.code(400).send({ error: 'BAD_REQUEST', message: 'Invalid collection type, status, display order, or date range' })
            throw error
        }
    })
    app.patch('/:id', { schema: { params: idParamsSchema, body: updateBodySchema } }, async (request, reply) => {
        const { id } = request.params as { id: number }, tenantId = getTenantContext(request).id, body = request.body as CollectionBody
        if (!validateDates(body, reply)) return
        const fields: string[] = [], values: unknown[] = [tenantId, id]
        const add = (column: string, value: unknown) => { values.push(value); fields.push(`${column}=$${values.length}`) }
        if (body.name !== undefined) add('name', body.name)
        if (body.slug !== undefined) add('slug', body.slug)
        if (body.type !== undefined) add('collection_type', body.type)
        if (body.description !== undefined) add('description', body.description)
        if (body.imageKey !== undefined) add('image_key', body.imageKey)
        if (body.startAt !== undefined) add('start_at', body.startAt)
        if (body.endAt !== undefined) add('end_at', body.endAt)
        if (body.displayOrder !== undefined) add('display_order', body.displayOrder)
        if (body.status !== undefined) add('status', body.status)
        try {
            const result = await db.query<CollectionRow>(`UPDATE collection SET ${fields.join(',')}
                WHERE tenant_id=$1 AND id=$2 RETURNING id,tenant_id,name,slug,collection_type,description,image_key,start_at,end_at,display_order,status,created_at,updated_at`, values)
            if (!result.rows[0]) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Collection not found' })
            return { data: mapCollection(result.rows[0]) }
        } catch (error) {
            if (hasDatabaseCode(error, '23505')) return reply.code(409).send({ error: 'CONFLICT', message: 'Collection slug already exists for this tenant' })
            if (hasDatabaseCode(error, '23514')) return reply.code(400).send({ error: 'BAD_REQUEST', message: 'Invalid collection type, status, display order, or date range' })
            throw error
        }
    })
    app.delete('/:id', { schema: { params: idParamsSchema } }, async (request, reply) => {
        const { id } = request.params as { id: number }
        const result = await db.query('DELETE FROM collection WHERE tenant_id=$1 AND id=$2', [getTenantContext(request).id, id])
        if (!result.rowCount) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Collection not found' })
        return reply.code(204).send()
    })
    app.get('/:collectionId/products', { schema: { params: collectionIdParamsSchema } }, async (request, reply) => {
        const { collectionId } = request.params as { collectionId: number }, tenantId = getTenantContext(request).id
        const collection = await db.query('SELECT 1 FROM collection WHERE tenant_id=$1 AND id=$2', [tenantId, collectionId])
        if (!collection.rows[0]) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Collection not found' })
        const result = await db.query<CollectionProductRow>(`SELECT cp.product_id,cp.display_order,p.name,p.slug,p.status
            FROM collection_product cp JOIN product p ON p.tenant_id=cp.tenant_id AND p.id=cp.product_id
            WHERE cp.tenant_id=$1 AND cp.collection_id=$2 ORDER BY cp.display_order,cp.product_id`, [tenantId, collectionId])
        return { data: result.rows.map(row => ({ productId: Number(row.product_id), name: row.name, slug: row.slug, status: row.status, displayOrder: row.display_order })) }
    })
    app.put('/:collectionId/products', { schema: { params: collectionIdParamsSchema, body: collectionProductsBodySchema } }, async (request, reply) => {
        const { collectionId } = request.params as { collectionId: number }, tenantId = getTenantContext(request).id
        const { products } = request.body as CollectionProductsBody, productIds = products.map(item => item.productId)
        if (new Set(productIds).size !== productIds.length) return reply.code(400).send({ error: 'BAD_REQUEST', message: 'A product can appear only once in a collection' })
        const client = await db.connect()
        try {
            await client.query('BEGIN')
            const collection = await client.query('SELECT id FROM collection WHERE tenant_id=$1 AND id=$2 FOR UPDATE', [tenantId, collectionId])
            if (!collection.rows[0]) { await client.query('ROLLBACK'); return reply.code(404).send({ error: 'NOT_FOUND', message: 'Collection not found' }) }
            if (productIds.length) {
                const valid = await client.query('SELECT id FROM product WHERE tenant_id=$1 AND id=ANY($2::bigint[])', [tenantId, productIds])
                if (valid.rows.length !== productIds.length) { await client.query('ROLLBACK'); return reply.code(400).send({ error: 'BAD_REQUEST', message: 'One or more products do not belong to this tenant' }) }
            }
            await client.query('DELETE FROM collection_product WHERE tenant_id=$1 AND collection_id=$2', [tenantId, collectionId])
            if (products.length) {
                const values: unknown[] = []
                const rows = products.map((product, index) => {
                    const base = index * 4; values.push(tenantId, collectionId, product.productId, product.displayOrder)
                    return `($${base + 1},$${base + 2},$${base + 3},$${base + 4})`
                })
                await client.query(`INSERT INTO collection_product (tenant_id,collection_id,product_id,display_order) VALUES ${rows.join(',')}`, values)
            }
            await client.query('COMMIT')
            return { data: { collectionId, products } }
        } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
    })
}
