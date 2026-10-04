import type { FastifyPluginAsync } from 'fastify'
import { db } from '../../db/pool.js'
import { buildUpdate } from '../../db/update-fields.js'
import { getTenantContext } from '../../plugins/tenant-context.js'
import { publicObjectUrl } from '../../storage/r2.js'
import { hasDatabaseCode } from '../../utils/db-errors.js'
import {
    idParamsSchema,
    paginationQueryProperties,
    parseLimit,
    parsePage,
    type QueryRecord,
} from '../../utils/query.js'

const statusSchema = { type: 'string', enum: ['ACTIVE', 'INACTIVE'] }
const brandProperties = {
    name: { type: 'string', minLength: 1, maxLength: 150 },
    slug: { type: 'string', minLength: 1, maxLength: 160 },
    description: { type: ['string', 'null'] },
    logoKey: { type: ['string', 'null'], maxLength: 500 },
    websiteUrl: { type: ['string', 'null'], maxLength: 500 },
    displayOrder: { type: 'integer', minimum: 0 },
    status: statusSchema,
}
const createBodySchema = {
    type: 'object',
    additionalProperties: false,
    required: ['name', 'slug'],
    properties: brandProperties,
}
const updateBodySchema = {
    type: 'object',
    additionalProperties: false,
    minProperties: 1,
    properties: brandProperties,
}
const listQuerySchema = {
    type: 'object',
    additionalProperties: false,
    properties: paginationQueryProperties,
}
type BrandBody = {
    name?: string
    slug?: string
    description?: string | null
    logoKey?: string | null
    websiteUrl?: string | null
    displayOrder?: number
    status?: 'ACTIVE' | 'INACTIVE'
}
const brandColumns: Partial<Record<keyof BrandBody, string>> = {
    name: 'name',
    slug: 'slug',
    description: 'description',
    logoKey: 'logo_key',
    websiteUrl: 'website_url',
    displayOrder: 'display_order',
    status: 'status',
}
type BrandRow = {
    id: string | number
    tenant_id: string | number
    name: string
    slug: string
    description: string | null
    logo_key: string | null
    website_url: string | null
    display_order: number
    status: 'ACTIVE' | 'INACTIVE'
    created_at: string | Date
    updated_at: string | Date
}
function mapBrand(row: BrandRow) {
    return {
        id: Number(row.id),
        tenantId: Number(row.tenant_id),
        name: row.name,
        slug: row.slug,
        description: row.description,
        logoKey: row.logo_key,
        logoUrl: row.logo_key ? publicObjectUrl(row.logo_key) : null,
        websiteUrl: row.website_url,
        displayOrder: row.display_order,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    }
}

export const adminBrandRoutes: FastifyPluginAsync = async (app) => {
    app.get('/', { schema: { querystring: listQuerySchema } }, async (request) => {
        const tenantId = getTenantContext(request).id,
            query = request.query as QueryRecord
        const page = parsePage(query),
            limit = parseLimit(query),
            offset = (page - 1) * limit
        const [rows, count] = await Promise.all([
            db.query<BrandRow>(
                `SELECT id,tenant_id,name,slug,description,logo_key,website_url,display_order,status,created_at,updated_at
                FROM brand WHERE tenant_id=$1 ORDER BY display_order,name,id LIMIT $2 OFFSET $3`,
                [tenantId, limit, offset],
            ),
            db.query<{ total: string }>(
                'SELECT COUNT(*)::text AS total FROM brand WHERE tenant_id=$1',
                [tenantId],
            ),
        ])
        return {
            data: rows.rows.map(mapBrand),
            pagination: { page, limit, total: Number(count.rows[0]?.total ?? 0) },
        }
    })
    app.get('/:id', { schema: { params: idParamsSchema } }, async (request, reply) => {
        const { id } = request.params as { id: number }
        const result = await db.query<BrandRow>(
            `SELECT id,tenant_id,name,slug,description,logo_key,website_url,display_order,status,created_at,updated_at
            FROM brand WHERE tenant_id=$1 AND id=$2`,
            [getTenantContext(request).id, id],
        )
        if (!result.rows[0])
            return reply.code(404).send({ error: 'NOT_FOUND', message: 'Brand not found' })
        return { data: mapBrand(result.rows[0]) }
    })
    app.post('/', { schema: { body: createBodySchema } }, async (request, reply) => {
        const body = request.body as BrandBody,
            tenantId = getTenantContext(request).id
        try {
            const result = await db.query<BrandRow>(
                `INSERT INTO brand
                (tenant_id,name,slug,description,logo_key,website_url,display_order,status)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
                RETURNING id,tenant_id,name,slug,description,logo_key,website_url,display_order,status,created_at,updated_at`,
                [
                    tenantId,
                    body.name,
                    body.slug,
                    body.description ?? null,
                    body.logoKey ?? null,
                    body.websiteUrl ?? null,
                    body.displayOrder ?? 0,
                    body.status ?? 'ACTIVE',
                ],
            )
            return reply.code(201).send({ data: mapBrand(result.rows[0]!) })
        } catch (error) {
            if (hasDatabaseCode(error, '23505'))
                return reply.code(409).send({
                    error: 'CONFLICT',
                    message: 'Brand slug already exists for this tenant',
                })
            throw error
        }
    })
    app.patch(
        '/:id',
        { schema: { params: idParamsSchema, body: updateBodySchema } },
        async (request, reply) => {
            const { id } = request.params as { id: number },
                tenantId = getTenantContext(request).id,
                body = request.body as BrandBody
            const { assignments, values } = buildUpdate(body, brandColumns, [tenantId, id])
            try {
                const result = await db.query<BrandRow>(
                    `UPDATE brand SET ${assignments}
                WHERE tenant_id=$1 AND id=$2 RETURNING id,tenant_id,name,slug,description,logo_key,website_url,display_order,status,created_at,updated_at`,
                    values,
                )
                if (!result.rows[0])
                    return reply.code(404).send({ error: 'NOT_FOUND', message: 'Brand not found' })
                return { data: mapBrand(result.rows[0]) }
            } catch (error) {
                if (hasDatabaseCode(error, '23505'))
                    return reply.code(409).send({
                        error: 'CONFLICT',
                        message: 'Brand slug already exists for this tenant',
                    })
                throw error
            }
        },
    )
    app.delete('/:id', { schema: { params: idParamsSchema } }, async (request, reply) => {
        const { id } = request.params as { id: number }
        try {
            const result = await db.query('DELETE FROM brand WHERE tenant_id=$1 AND id=$2', [
                getTenantContext(request).id,
                id,
            ])
            if (!result.rowCount)
                return reply.code(404).send({ error: 'NOT_FOUND', message: 'Brand not found' })
            return reply.code(204).send()
        } catch (error) {
            if (hasDatabaseCode(error, '23503'))
                return reply.code(409).send({
                    error: 'CONFLICT',
                    message: 'Brand cannot be deleted while products reference it',
                })
            throw error
        }
    })
}
