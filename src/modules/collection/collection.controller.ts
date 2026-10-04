import type { FastifyRequest, FastifyReply } from 'fastify'
import { db } from '../../plugins/db.js'
import { publicObjectUrl } from '../../plugins/storage.js'
import { getTenantContext } from '../../plugins/tenant-context.js'
import { hasDatabaseCode } from '../../utils/db-errors.js'
import { buildUpdate } from '../../utils/update-fields.js'
import { parseLimit, parsePage, type QueryRecord } from '../../utils/query.js'
import { mapAdminCollection, mapCatalogCollection, activeWindow } from './collection.repository.js'
import type {
    CollectionBody,
    AdminCollectionRow,
    CatalogCollectionRow,
    CollectionProductsBody,
    CollectionProductRow,
    CatalogProductRow,
} from './collection.schema.js'
import { collectionColumns } from './collection.schema.js'

export function validateDates(body: CollectionBody, reply: FastifyReply): boolean {
    const dates = [body.startAt, body.endAt].filter((value): value is string => value != null)
    if (dates.some((value) => !Number.isFinite(Date.parse(value)))) {
        reply.code(400).send({
            error: 'BAD_REQUEST',
            message: 'startAt and endAt must be valid ISO date/time strings',
        })
        return false
    }
    if (body.startAt && body.endAt && Date.parse(body.endAt) < Date.parse(body.startAt)) {
        reply.code(400).send({
            error: 'BAD_REQUEST',
            message: 'endAt must be greater than or equal to startAt',
        })
        return false
    }
    return true
}

export async function adminListCollections(request: FastifyRequest) {
    const tenantId = getTenantContext(request).id,
        query = request.query as QueryRecord
    const page = parsePage(query),
        limit = parseLimit(query),
        offset = (page - 1) * limit
    const [rows, count] = await Promise.all([
        db.query<AdminCollectionRow>(
            `SELECT id,tenant_id,name,slug,collection_type,description,image_key,start_at,end_at,display_order,status,created_at,updated_at
            FROM collection WHERE tenant_id=$1 ORDER BY display_order,name,id LIMIT $2 OFFSET $3`,
            [tenantId, limit, offset],
        ),
        db.query<{ total: string }>(
            'SELECT COUNT(*)::text AS total FROM collection WHERE tenant_id=$1',
            [tenantId],
        ),
    ])
    return {
        data: rows.rows.map(mapAdminCollection),
        pagination: { page, limit, total: Number(count.rows[0]?.total ?? 0) },
    }
}

export async function adminGetCollection(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: number }
    const result = await db.query<AdminCollectionRow>(
        `SELECT id,tenant_id,name,slug,collection_type,description,image_key,start_at,end_at,display_order,status,created_at,updated_at
        FROM collection WHERE tenant_id=$1 AND id=$2`,
        [getTenantContext(request).id, id],
    )
    if (!result.rows[0])
        return reply.code(404).send({ error: 'NOT_FOUND', message: 'Collection not found' })
    return { data: mapAdminCollection(result.rows[0]) }
}

export async function adminCreateCollection(request: FastifyRequest, reply: FastifyReply) {
    const body = request.body as CollectionBody,
        tenantId = getTenantContext(request).id
    if (!validateDates(body, reply)) return
    try {
        const result = await db.query<AdminCollectionRow>(
            `INSERT INTO collection
            (tenant_id,name,slug,collection_type,description,image_key,start_at,end_at,display_order,status)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
            RETURNING id,tenant_id,name,slug,collection_type,description,image_key,start_at,end_at,display_order,status,created_at,updated_at`,
            [
                tenantId,
                body.name,
                body.slug,
                body.type,
                body.description ?? null,
                body.imageKey ?? null,
                body.startAt ?? null,
                body.endAt ?? null,
                body.displayOrder ?? 0,
                body.status ?? 'ACTIVE',
            ],
        )
        return reply.code(201).send({ data: mapAdminCollection(result.rows[0]!) })
    } catch (error) {
        if (hasDatabaseCode(error, '23505'))
            return reply.code(409).send({
                error: 'CONFLICT',
                message: 'Collection slug already exists for this tenant',
            })
        if (hasDatabaseCode(error, '23514'))
            return reply.code(400).send({
                error: 'BAD_REQUEST',
                message: 'Invalid collection type, status, display order, or date range',
            })
        throw error
    }
}

export async function adminUpdateCollection(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: number },
        tenantId = getTenantContext(request).id,
        body = request.body as CollectionBody
    if (!validateDates(body, reply)) return
    const { assignments, values } = buildUpdate(body, collectionColumns, [tenantId, id])
    try {
        const result = await db.query<AdminCollectionRow>(
            `UPDATE collection SET ${assignments}
            WHERE tenant_id=$1 AND id=$2 RETURNING id,tenant_id,name,slug,collection_type,description,image_key,start_at,end_at,display_order,status,created_at,updated_at`,
            values,
        )
        if (!result.rows[0])
            return reply.code(404).send({ error: 'NOT_FOUND', message: 'Collection not found' })
        return { data: mapAdminCollection(result.rows[0]) }
    } catch (error) {
        if (hasDatabaseCode(error, '23505'))
            return reply.code(409).send({
                error: 'CONFLICT',
                message: 'Collection slug already exists for this tenant',
            })
        if (hasDatabaseCode(error, '23514'))
            return reply.code(400).send({
                error: 'BAD_REQUEST',
                message: 'Invalid collection type, status, display order, or date range',
            })
        throw error
    }
}

export async function adminDeleteCollection(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: number }
    const result = await db.query('DELETE FROM collection WHERE tenant_id=$1 AND id=$2', [
        getTenantContext(request).id,
        id,
    ])
    if (!result.rowCount)
        return reply.code(404).send({ error: 'NOT_FOUND', message: 'Collection not found' })
    return reply.code(204).send()
}

export async function adminListCollectionProducts(request: FastifyRequest, reply: FastifyReply) {
    const { collectionId } = request.params as { collectionId: number },
        tenantId = getTenantContext(request).id
    const collection = await db.query('SELECT 1 FROM collection WHERE tenant_id=$1 AND id=$2', [
        tenantId,
        collectionId,
    ])
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
}

export async function adminUpdateCollectionProducts(request: FastifyRequest, reply: FastifyReply) {
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
            return reply.code(404).send({ error: 'NOT_FOUND', message: 'Collection not found' })
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
}

export async function catalogListCollections(request: FastifyRequest) {
    const result = await db.query<CatalogCollectionRow>(
        `SELECT id,name,slug,collection_type,description,image_key,start_at,end_at,display_order
        FROM collection WHERE tenant_id=$1 AND ${activeWindow} ORDER BY display_order,name,id`,
        [getTenantContext(request).id],
    )
    return { data: result.rows.map(mapCatalogCollection) }
}

export async function catalogGetCollection(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: number }
    const result = await db.query<CatalogCollectionRow>(
        `SELECT id,name,slug,collection_type,description,image_key,start_at,end_at,display_order
        FROM collection WHERE tenant_id=$1 AND id=$2 AND ${activeWindow}`,
        [getTenantContext(request).id, id],
    )
    if (!result.rows[0])
        return reply.code(404).send({ error: 'NOT_FOUND', message: 'Collection not found' })
    return { data: mapCatalogCollection(result.rows[0]) }
}

export async function catalogGetCollectionProducts(request: FastifyRequest, reply: FastifyReply) {
    const tenantId = getTenantContext(request).id,
        { collectionId } = request.params as { collectionId: number }
    const collection = await db.query(
        `SELECT 1 FROM collection WHERE tenant_id=$1 AND id=$2 AND ${activeWindow}`,
        [tenantId, collectionId],
    )
    if (!collection.rows[0])
        return reply.code(404).send({ error: 'NOT_FOUND', message: 'Collection not found' })
    const result = await db.query<CatalogProductRow>(
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
}
