import type { FastifyRequest, FastifyReply } from 'fastify'
import { env } from '../../config/env.js'
import { db } from '../../plugins/db.js'
import { buildUpdate } from '../../utils/update-fields.js'
import { productExists } from './product.repository.js'
import { getTenantContext } from '../../plugins/tenant-context.js'
import {
    createProductImageUploadUrl,
    deleteObject,
    headObject,
    isAllowedImageContentType,
    newProductImageKey,
    productImagePrefix,
} from '../../plugins/storage.js'
import { hasDatabaseCode } from '../../utils/db-errors.js'
import { mapAdminImage } from './product-image.repository.js'
import type { UploadUrlBody, ImageBody, ImageRow } from './product-image.schema.js'
import { imageColumns } from './product-image.schema.js'

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
    } catch (error) {
        if (
            typeof error === 'object' &&
            error !== null &&
            'statusCode' in error &&
            error.statusCode === 503
        )
            throw error
        return { ok: false, message: 'Image was not uploaded to R2 or is not accessible' }
    }
}

async function deleteUnreferencedObject(
    request: FastifyRequest,
    tenantId: number,
    productId: number,
    objectKey: string,
) {
    try {
        const referenced = await db.query(
            'SELECT 1 FROM product_image WHERE tenant_id=$1 AND product_id=$2 AND object_key=$3 LIMIT 1',
            [tenantId, productId, objectKey],
        )
        if (!referenced.rows[0]) await deleteObject(objectKey)
    } catch (error) {
        request.log.warn({ error, objectKey }, 'Failed to clean up R2 image object')
    }
}

export async function listAdminImages(request: FastifyRequest, reply: FastifyReply) {
    const tenantId = getTenantContext(request).id,
        { productId } = request.params as { productId: number }
    if (!(await productExists(tenantId, productId)))
        return reply.code(404).send({ error: 'NOT_FOUND', message: 'Product not found' })
    const result = await db.query<ImageRow>(
        'SELECT id,tenant_id,product_id,object_key,alt_text,is_primary,display_order,created_at FROM product_image WHERE tenant_id=$1 AND product_id=$2 ORDER BY is_primary DESC,display_order,id',
        [tenantId, productId],
    )
    return { data: result.rows.map(mapAdminImage) }
}

export async function getUploadUrl(request: FastifyRequest, reply: FastifyReply) {
    const tenantId = getTenantContext(request).id,
        { productId } = request.params as { productId: number },
        body = request.body as UploadUrlBody
    if (!(await productExists(tenantId, productId)))
        return reply.code(404).send({ error: 'NOT_FOUND', message: 'Product not found' })
    if (!isAllowedImageContentType(body.contentType))
        return reply
            .code(400)
            .send({ error: 'BAD_REQUEST', message: 'Unsupported image content type' })
    const objectKey = newProductImageKey(tenantId, productId, body.contentType)
    const uploadUrl = await createProductImageUploadUrl(objectKey, body.contentType)
    return {
        data: {
            objectKey,
            uploadUrl,
            expiresIn: env.r2.uploadUrlTtlSeconds,
            requiredHeaders: { 'Content-Type': body.contentType },
        },
    }
}

export async function registerImage(request: FastifyRequest, reply: FastifyReply) {
    const tenantId = getTenantContext(request).id,
        { productId } = request.params as { productId: number },
        body = request.body as ImageBody
    const objectKey = body.objectKey!
    if (!(await productExists(tenantId, productId)))
        return reply.code(404).send({ error: 'NOT_FOUND', message: 'Product not found' })
    const verification = await verifyUploadedImage(tenantId, productId, objectKey)
    if (!verification.ok)
        return reply.code(400).send({ error: 'BAD_REQUEST', message: verification.message })
    const client = await db.connect()
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
        if (body.isPrimary)
            await client.query(
                'UPDATE product_image SET is_primary=FALSE WHERE tenant_id=$1 AND product_id=$2',
                [tenantId, productId],
            )
        const currentPrimary = await client.query(
            'SELECT 1 FROM product_image WHERE tenant_id=$1 AND product_id=$2 AND is_primary=TRUE',
            [tenantId, productId],
        )
        const isPrimary = body.isPrimary ?? !currentPrimary.rows[0]
        const result = await client.query<ImageRow>(
            `INSERT INTO product_image (tenant_id,product_id,object_key,alt_text,is_primary,display_order)
             VALUES ($1,$2,$3,$4,$5,$6)
             RETURNING id,tenant_id,product_id,object_key,alt_text,is_primary,display_order,created_at`,
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

export async function updateAdminImage(request: FastifyRequest, reply: FastifyReply) {
    const tenantId = getTenantContext(request).id
    const { productId, imageId } = request.params as { productId: number; imageId: number }
    const body = request.body as ImageBody
    const client = await db.connect()
    let oldObjectKey: string | null = null
    let updatedImage: ImageRow

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

        const current = await client.query<ImageRow>(
            `SELECT id,tenant_id,product_id,object_key,alt_text,is_primary,display_order,created_at
             FROM product_image WHERE tenant_id=$1 AND product_id=$2 AND id=$3 FOR UPDATE`,
            [tenantId, productId, imageId],
        )
        const currentImage = current.rows[0]
        if (!currentImage) {
            await client.query('ROLLBACK')
            return reply.code(404).send({ error: 'NOT_FOUND', message: 'Product image not found' })
        }
        oldObjectKey = currentImage.object_key

        if (body.objectKey !== undefined && body.objectKey !== oldObjectKey) {
            const verification = await verifyUploadedImage(tenantId, productId, body.objectKey)
            if (!verification.ok) {
                await client.query('ROLLBACK')
                return reply.code(400).send({ error: 'BAD_REQUEST', message: verification.message })
            }
            const duplicate = await client.query(
                'SELECT 1 FROM product_image WHERE tenant_id=$1 AND product_id=$2 AND object_key=$3 AND id<>$4',
                [tenantId, productId, body.objectKey, imageId],
            )
            if (duplicate.rows[0]) {
                await client.query('ROLLBACK')
                return reply
                    .code(409)
                    .send({ error: 'CONFLICT', message: 'This image object is already registered' })
            }
        }

        if (body.isPrimary === true) {
            await client.query(
                'UPDATE product_image SET is_primary=FALSE WHERE tenant_id=$1 AND product_id=$2 AND id<>$3 AND is_primary=TRUE',
                [tenantId, productId, imageId],
            )
        }
        const { assignments, values } = buildUpdate(body, imageColumns, [
            tenantId,
            productId,
            imageId,
        ])
        const result = await client.query<ImageRow>(
            `UPDATE product_image SET ${assignments} WHERE tenant_id=$1 AND product_id=$2 AND id=$3
             RETURNING id,tenant_id,product_id,object_key,alt_text,is_primary,display_order,created_at`,
            values,
        )
        const row = result.rows[0]!
        if (!row.is_primary) {
            const hasPrimary = await client.query(
                'SELECT 1 FROM product_image WHERE tenant_id=$1 AND product_id=$2 AND is_primary=TRUE LIMIT 1',
                [tenantId, productId],
            )
            if (!hasPrimary.rows[0]) {
                const next = await client.query<{ id: string | number }>(
                    'SELECT id FROM product_image WHERE tenant_id=$1 AND product_id=$2 ORDER BY display_order,id LIMIT 1',
                    [tenantId, productId],
                )
                if (next.rows[0]) {
                    await client.query(
                        'UPDATE product_image SET is_primary=TRUE WHERE tenant_id=$1 AND product_id=$2 AND id=$3',
                        [tenantId, productId, Number(next.rows[0].id)],
                    )
                    if (Number(next.rows[0].id) === Number(row.id)) row.is_primary = true
                }
            }
        }
        await client.query('COMMIT')
        updatedImage = row
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

    if (body.objectKey !== undefined && oldObjectKey && oldObjectKey !== body.objectKey) {
        await deleteUnreferencedObject(request, tenantId, productId, oldObjectKey)
    }
    return { data: mapAdminImage(updatedImage) }
}

export async function deleteAdminImage(request: FastifyRequest, reply: FastifyReply) {
    const tenantId = getTenantContext(request).id,
        { productId, imageId } = request.params as { productId: number; imageId: number }
    let objectKey: string | null = null
    const client = await db.connect()
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
        const deleted = await client.query<ImageRow>(
            'DELETE FROM product_image WHERE tenant_id=$1 AND product_id=$2 AND id=$3 RETURNING id,tenant_id,product_id,object_key,alt_text,is_primary,display_order,created_at',
            [tenantId, productId, imageId],
        )
        const row = deleted.rows[0]
        if (!row) {
            await client.query('ROLLBACK')
            return reply.code(404).send({ error: 'NOT_FOUND', message: 'Product image not found' })
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
    if (objectKey) await deleteUnreferencedObject(request, tenantId, productId, objectKey)
    return reply.code(204).send()
}
