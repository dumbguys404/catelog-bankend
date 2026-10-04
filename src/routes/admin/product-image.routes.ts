import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify'
import { mapAdminImage, type ImageRow } from '../../catalog/product-images.js'
import { env } from '../../config/env.js'
import { db } from '../../db/pool.js'
import { buildUpdate } from '../../db/update-fields.js'
import { productExists } from '../../catalog/products.js'
import { getTenantContext } from '../../plugins/tenant-context.js'
import {
    allowedImageContentTypes,
    createProductImageUploadUrl,
    deleteObject,
    headObject,
    isAllowedImageContentType,
    newProductImageKey,
    productImagePrefix,
} from '../../storage/r2.js'
import { hasDatabaseCode } from '../../utils/db-errors.js'

const productIdParamsSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['productId'],
    properties: { productId: { type: 'integer', minimum: 1 } },
}
const productImageParamsSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['productId', 'imageId'],
    properties: {
        productId: { type: 'integer', minimum: 1 },
        imageId: { type: 'integer', minimum: 1 },
    },
}
const uploadUrlBodySchema = {
    type: 'object',
    additionalProperties: false,
    required: ['contentType', 'size'],
    properties: {
        filename: { type: 'string', minLength: 1, maxLength: 255 },
        contentType: { type: 'string', enum: Object.keys(allowedImageContentTypes) },
        size: { type: 'integer', minimum: 1, maximum: env.r2.maxImageBytes },
    },
}
const imageProperties = {
    objectKey: { type: 'string', minLength: 1, maxLength: 500 },
    altText: { type: ['string', 'null'], maxLength: 255 },
    isPrimary: { type: 'boolean' },
    displayOrder: { type: 'integer', minimum: 0 },
}
const createImageBodySchema = {
    type: 'object',
    additionalProperties: false,
    required: ['objectKey'],
    properties: imageProperties,
}
const updateImageBodySchema = {
    type: 'object',
    additionalProperties: false,
    minProperties: 1,
    properties: imageProperties,
}
type UploadUrlBody = { filename?: string; contentType: string; size: number }
type ImageBody = {
    objectKey?: string
    altText?: string | null
    isPrimary?: boolean
    displayOrder?: number
}
const imageColumns: Partial<Record<keyof ImageBody, string>> = {
    objectKey: 'object_key',
    altText: 'alt_text',
    isPrimary: 'is_primary',
    displayOrder: 'display_order',
}
async function verifyUploadedImage(
    tenantId: number,
    productId: number,
    objectKey: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
    if (!objectKey.startsWith(productImagePrefix(tenantId, productId)))
        return { ok: false, message: 'Invalid image object key for this tenant/product' }
    try {
        const object = await headObject(objectKey),
            size = object.ContentLength ?? 0,
            type = object.ContentType ?? ''
        if (size < 1 || size > env.r2.maxImageBytes)
            return {
                ok: false,
                message: `Image must be between 1 and ${env.r2.maxImageBytes} bytes`,
            }
        if (!isAllowedImageContentType(type))
            return { ok: false, message: 'Uploaded object is not an allowed image type' }
        return { ok: true }
    } catch {
        return { ok: false, message: 'Image was not uploaded to R2 or is not accessible' }
    }
}

async function registerImage(request: FastifyRequest, reply: FastifyReply) {
    const tenantId = getTenantContext(request).id,
        { productId } = request.params as { productId: number },
        body = request.body as ImageBody
    const objectKey = body.objectKey!
    if (!(await productExists(tenantId, productId)))
        return reply.code(404).send({ error: 'NOT_FOUND', message: 'Product not found' })
    const verified = await verifyUploadedImage(tenantId, productId, objectKey)
    if (!verified.ok)
        return reply.code(400).send({ error: 'BAD_REQUEST', message: verified.message })
    const client = await db.connect()
    try {
        await client.query('BEGIN')
        await client.query('SELECT id FROM product WHERE tenant_id=$1 AND id=$2 FOR UPDATE', [
            tenantId,
            productId,
        ])
        const duplicate = await client.query(
            'SELECT 1 FROM product_image WHERE tenant_id=$1 AND product_id=$2 AND object_key=$3',
            [tenantId, productId, objectKey],
        )
        if (duplicate.rows[0]) {
            await client.query('ROLLBACK')
            return reply
                .code(409)
                .send({ error: 'CONFLICT', message: 'This image object is already registered' })
        }
        const count = await client.query<{ count: string }>(
            'SELECT COUNT(*)::text AS count FROM product_image WHERE tenant_id=$1 AND product_id=$2',
            [tenantId, productId],
        )
        const isPrimary = body.isPrimary ?? Number(count.rows[0]?.count ?? 0) === 0
        if (isPrimary)
            await client.query(
                'UPDATE product_image SET is_primary=FALSE WHERE tenant_id=$1 AND product_id=$2 AND is_primary=TRUE',
                [tenantId, productId],
            )
        const result = await client.query<ImageRow>(
            `INSERT INTO product_image (tenant_id,product_id,object_key,alt_text,is_primary,display_order)
            VALUES ($1,$2,$3,$4,$5,$6) RETURNING id,tenant_id,product_id,object_key,alt_text,is_primary,display_order,created_at`,
            [
                tenantId,
                productId,
                objectKey,
                body.altText ?? null,
                isPrimary,
                body.displayOrder ?? 0,
            ],
        )
        await client.query('COMMIT')
        return reply.code(201).send({ data: mapAdminImage(result.rows[0]!) })
    } catch (error) {
        await client.query('ROLLBACK')
        if (hasDatabaseCode(error, '23505'))
            return reply
                .code(409)
                .send({ error: 'CONFLICT', message: 'Primary image conflict; retry the request' })
        throw error
    } finally {
        client.release()
    }
}

export const adminProductImageRoutes: FastifyPluginAsync = async (app) => {
    app.get(
        '/:productId/images',
        { schema: { params: productIdParamsSchema } },
        async (request, reply) => {
            const tenantId = getTenantContext(request).id,
                { productId } = request.params as { productId: number }
            if (!(await productExists(tenantId, productId)))
                return reply.code(404).send({ error: 'NOT_FOUND', message: 'Product not found' })
            const result = await db.query<ImageRow>(
                'SELECT id,tenant_id,product_id,object_key,alt_text,is_primary,display_order,created_at FROM product_image WHERE tenant_id=$1 AND product_id=$2 ORDER BY is_primary DESC,display_order,id',
                [tenantId, productId],
            )
            return { data: result.rows.map(mapAdminImage) }
        },
    )
    app.post(
        '/:productId/images/upload-url',
        { schema: { params: productIdParamsSchema, body: uploadUrlBodySchema } },
        async (request, reply) => {
            const tenantId = getTenantContext(request).id,
                { productId } = request.params as { productId: number },
                body = request.body as UploadUrlBody
            if (!(await productExists(tenantId, productId)))
                return reply.code(404).send({ error: 'NOT_FOUND', message: 'Product not found' })
            if (!isAllowedImageContentType(body.contentType))
                return reply
                    .code(400)
                    .send({ error: 'BAD_REQUEST', message: 'Unsupported image content type' })
            const objectKey = newProductImageKey(tenantId, productId, body.contentType),
                uploadUrl = await createProductImageUploadUrl(objectKey, body.contentType)
            return {
                data: {
                    uploadUrl,
                    objectKey,
                    expiresIn: env.r2.uploadUrlTtlSeconds,
                    requiredHeaders: { 'Content-Type': body.contentType },
                },
            }
        },
    )
    app.post(
        '/:productId/images',
        { schema: { params: productIdParamsSchema, body: createImageBodySchema } },
        registerImage,
    )
    app.post(
        '/:productId/images/complete',
        { schema: { params: productIdParamsSchema, body: createImageBodySchema } },
        registerImage,
    )
    app.patch(
        '/:productId/images/:imageId',
        { schema: { params: productImageParamsSchema, body: updateImageBodySchema } },
        async (request, reply) => {
            const tenantId = getTenantContext(request).id,
                { productId, imageId } = request.params as { productId: number; imageId: number },
                body = request.body as ImageBody
            const client = await db.connect()
            let oldKey: string | null = null
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
                const current = await client.query<ImageRow>(
                    'SELECT id,tenant_id,product_id,object_key,alt_text,is_primary,display_order,created_at FROM product_image WHERE tenant_id=$1 AND product_id=$2 AND id=$3 FOR UPDATE',
                    [tenantId, productId, imageId],
                )
                const row = current.rows[0]
                if (!row) {
                    await client.query('ROLLBACK')
                    return reply
                        .code(404)
                        .send({ error: 'NOT_FOUND', message: 'Product image not found' })
                }
                oldKey = row.object_key
                if (body.objectKey !== undefined && body.objectKey !== row.object_key) {
                    const verified = await verifyUploadedImage(tenantId, productId, body.objectKey)
                    if (!verified.ok) {
                        await client.query('ROLLBACK')
                        return reply
                            .code(400)
                            .send({ error: 'BAD_REQUEST', message: verified.message })
                    }
                    const duplicate = await client.query(
                        'SELECT 1 FROM product_image WHERE tenant_id=$1 AND product_id=$2 AND object_key=$3 AND id<>$4',
                        [tenantId, productId, body.objectKey, imageId],
                    )
                    if (duplicate.rows[0]) {
                        await client.query('ROLLBACK')
                        return reply.code(409).send({
                            error: 'CONFLICT',
                            message: 'This image object is already registered',
                        })
                    }
                }
                if (body.isPrimary === true)
                    await client.query(
                        'UPDATE product_image SET is_primary=FALSE WHERE tenant_id=$1 AND product_id=$2 AND id<>$3 AND is_primary=TRUE',
                        [tenantId, productId, imageId],
                    )
                const { assignments, values } = buildUpdate(body, imageColumns, [
                    tenantId,
                    productId,
                    imageId,
                ])
                const updated = await client.query<ImageRow>(
                    `UPDATE product_image SET ${assignments} WHERE tenant_id=$1 AND product_id=$2 AND id=$3 RETURNING id,tenant_id,product_id,object_key,alt_text,is_primary,display_order,created_at`,
                    values,
                )
                await client.query('COMMIT')
                if (body.objectKey !== undefined && oldKey && oldKey !== body.objectKey)
                    try {
                        await deleteObject(oldKey)
                    } catch (error) {
                        request.log.warn(
                            { error, objectKey: oldKey },
                            'Failed to delete replaced R2 image object',
                        )
                    }
                return { data: mapAdminImage(updated.rows[0]!) }
            } catch (error) {
                await client.query('ROLLBACK')
                if (hasDatabaseCode(error, '23505'))
                    return reply.code(409).send({
                        error: 'CONFLICT',
                        message: 'Primary image conflict; retry the request',
                    })
                throw error
            } finally {
                client.release()
            }
        },
    )
    app.delete(
        '/:productId/images/:imageId',
        { schema: { params: productImageParamsSchema } },
        async (request, reply) => {
            const tenantId = getTenantContext(request).id,
                { productId, imageId } = request.params as { productId: number; imageId: number },
                client = await db.connect()
            let objectKey: string | null = null
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
                const deleted = await client.query<ImageRow>(
                    'DELETE FROM product_image WHERE tenant_id=$1 AND product_id=$2 AND id=$3 RETURNING id,tenant_id,product_id,object_key,alt_text,is_primary,display_order,created_at',
                    [tenantId, productId, imageId],
                )
                const row = deleted.rows[0]
                if (!row) {
                    await client.query('ROLLBACK')
                    return reply
                        .code(404)
                        .send({ error: 'NOT_FOUND', message: 'Product image not found' })
                }
                objectKey = row.object_key
                if (row.is_primary) {
                    const next = await client.query<{ id: string | number }>(
                        'SELECT id FROM product_image WHERE tenant_id=$1 AND product_id=$2 ORDER BY display_order,id LIMIT 1',
                        [tenantId, productId],
                    )
                    if (next.rows[0])
                        await client.query(
                            'UPDATE product_image SET is_primary=TRUE WHERE tenant_id=$1 AND product_id=$2 AND id=$3',
                            [tenantId, productId, Number(next.rows[0].id)],
                        )
                }
                await client.query('COMMIT')
            } catch (error) {
                await client.query('ROLLBACK')
                throw error
            } finally {
                client.release()
            }
            if (objectKey)
                try {
                    await deleteObject(objectKey)
                } catch (error) {
                    request.log.warn(
                        { error, objectKey },
                        'Failed to delete R2 image object after database delete',
                    )
                }
            return reply.code(204).send()
        },
    )
}
