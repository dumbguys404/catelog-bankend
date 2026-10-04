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
const nullableString = { type: ['string', 'null'] }
const listQuerySchema = {
    type: 'object',
    additionalProperties: false,
    properties: paginationQueryProperties,
}
const categoryProperties = {
    parentCategoryId: { type: ['integer', 'null'], minimum: 1 },
    name: { type: 'string', minLength: 1, maxLength: 150 },
    slug: { type: 'string', minLength: 1, maxLength: 160 },
    description: nullableString,
    imageKey: { type: ['string', 'null'], maxLength: 500 },
    displayOrder: { type: 'integer', minimum: 0 },
    status: statusSchema,
}
const createBodySchema = {
    type: 'object',
    additionalProperties: false,
    required: ['name', 'slug'],
    properties: categoryProperties,
}
const updateBodySchema = {
    type: 'object',
    additionalProperties: false,
    minProperties: 1,
    properties: categoryProperties,
}

type CategoryBody = {
    parentCategoryId?: number | null
    name?: string
    slug?: string
    description?: string | null
    imageKey?: string | null
    displayOrder?: number
    status?: 'ACTIVE' | 'INACTIVE'
}
const categoryColumns: Partial<Record<keyof CategoryBody, string>> = {
    parentCategoryId: 'parent_category_id',
    name: 'name',
    slug: 'slug',
    description: 'description',
    imageKey: 'image_key',
    displayOrder: 'display_order',
    status: 'status',
}
type CategoryRow = {
    id: string | number
    tenant_id: string | number
    parent_category_id: string | number | null
    name: string
    slug: string
    description: string | null
    image_key: string | null
    display_order: number
    status: 'ACTIVE' | 'INACTIVE'
    created_at: string | Date
    updated_at: string | Date
}

function mapCategory(row: CategoryRow) {
    return {
        id: Number(row.id),
        tenantId: Number(row.tenant_id),
        parentCategoryId: row.parent_category_id === null ? null : Number(row.parent_category_id),
        name: row.name,
        slug: row.slug,
        description: row.description,
        imageKey: row.image_key,
        imageUrl: row.image_key ? publicObjectUrl(row.image_key) : null,
        displayOrder: row.display_order,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    }
}

async function ensureParent(tenantId: number, parentId: number): Promise<boolean> {
    const result = await db.query('SELECT 1 FROM category WHERE tenant_id = $1 AND id = $2', [
        tenantId,
        parentId,
    ])
    return Boolean(result.rows[0])
}

async function wouldCreateCycle(
    tenantId: number,
    categoryId: number,
    parentId: number,
): Promise<boolean> {
    const result = await db.query(
        `WITH RECURSIVE descendants AS (
            SELECT id FROM category WHERE tenant_id = $1 AND id = $2
            UNION
            SELECT child.id FROM category child
            JOIN descendants parent ON child.parent_category_id = parent.id
            WHERE child.tenant_id = $1
         ) SELECT 1 FROM descendants WHERE id = $3 LIMIT 1`,
        [tenantId, categoryId, parentId],
    )
    return Boolean(result.rows[0])
}

export const adminCategoryRoutes: FastifyPluginAsync = async (app) => {
    app.get('/', { schema: { querystring: listQuerySchema } }, async (request) => {
        const tenantId = getTenantContext(request).id
        const query = request.query as QueryRecord
        const page = parsePage(query),
            limit = parseLimit(query),
            offset = (page - 1) * limit
        const [rows, count] = await Promise.all([
            db.query<CategoryRow>(
                `SELECT id, tenant_id, parent_category_id, name, slug, description, image_key, display_order, status, created_at, updated_at
                 FROM category WHERE tenant_id = $1 ORDER BY display_order, name, id LIMIT $2 OFFSET $3`,
                [tenantId, limit, offset],
            ),
            db.query<{ total: string }>(
                'SELECT COUNT(*)::text AS total FROM category WHERE tenant_id = $1',
                [tenantId],
            ),
        ])
        return {
            data: rows.rows.map(mapCategory),
            pagination: { page, limit, total: Number(count.rows[0]?.total ?? 0) },
        }
    })

    app.get('/:id', { schema: { params: idParamsSchema } }, async (request, reply) => {
        const { id } = request.params as { id: number },
            tenantId = getTenantContext(request).id
        const result = await db.query<CategoryRow>(
            `SELECT id, tenant_id, parent_category_id, name, slug, description, image_key, display_order, status, created_at, updated_at
             FROM category WHERE tenant_id = $1 AND id = $2`,
            [tenantId, id],
        )
        if (!result.rows[0])
            return reply.code(404).send({ error: 'NOT_FOUND', message: 'Category not found' })
        return { data: mapCategory(result.rows[0]) }
    })

    app.post('/', { schema: { body: createBodySchema } }, async (request, reply) => {
        const tenantId = getTenantContext(request).id,
            body = request.body as CategoryBody
        if (
            body.parentCategoryId != null &&
            !(await ensureParent(tenantId, body.parentCategoryId))
        ) {
            return reply.code(400).send({
                error: 'BAD_REQUEST',
                message: 'Parent category does not belong to this tenant',
            })
        }
        try {
            const result = await db.query<CategoryRow>(
                `INSERT INTO category (tenant_id, parent_category_id, name, slug, description, image_key, display_order, status)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
                 RETURNING id, tenant_id, parent_category_id, name, slug, description, image_key, display_order, status, created_at, updated_at`,
                [
                    tenantId,
                    body.parentCategoryId ?? null,
                    body.name,
                    body.slug,
                    body.description ?? null,
                    body.imageKey ?? null,
                    body.displayOrder ?? 0,
                    body.status ?? 'ACTIVE',
                ],
            )
            return reply.code(201).send({ data: mapCategory(result.rows[0]!) })
        } catch (error) {
            if (hasDatabaseCode(error, '23505'))
                return reply.code(409).send({
                    error: 'CONFLICT',
                    message: 'Category slug already exists at this hierarchy level',
                })
            throw error
        }
    })

    app.patch(
        '/:id',
        { schema: { params: idParamsSchema, body: updateBodySchema } },
        async (request, reply) => {
            const { id } = request.params as { id: number },
                tenantId = getTenantContext(request).id
            const body = request.body as CategoryBody
            const exists = await db.query(
                'SELECT 1 FROM category WHERE tenant_id = $1 AND id = $2',
                [tenantId, id],
            )
            if (!exists.rows[0])
                return reply.code(404).send({ error: 'NOT_FOUND', message: 'Category not found' })
            if (body.parentCategoryId != null) {
                if (!(await ensureParent(tenantId, body.parentCategoryId)))
                    return reply.code(400).send({
                        error: 'BAD_REQUEST',
                        message: 'Parent category does not belong to this tenant',
                    })
                if (await wouldCreateCycle(tenantId, id, body.parentCategoryId))
                    return reply.code(400).send({
                        error: 'BAD_REQUEST',
                        message: 'Category hierarchy cycle is not allowed',
                    })
            }
            const { assignments, values } = buildUpdate(body, categoryColumns, [tenantId, id])
            try {
                const result = await db.query<CategoryRow>(
                    `UPDATE category SET ${assignments} WHERE tenant_id = $1 AND id = $2
                 RETURNING id, tenant_id, parent_category_id, name, slug, description, image_key, display_order, status, created_at, updated_at`,
                    values,
                )
                const row = result.rows[0]
                if (!row)
                    return reply
                        .code(404)
                        .send({ error: 'NOT_FOUND', message: 'Category not found' })
                return { data: mapCategory(row) }
            } catch (error) {
                if (hasDatabaseCode(error, '23505'))
                    return reply.code(409).send({
                        error: 'CONFLICT',
                        message: 'Category slug already exists at this hierarchy level',
                    })
                throw error
            }
        },
    )

    app.delete('/:id', { schema: { params: idParamsSchema } }, async (request, reply) => {
        const { id } = request.params as { id: number },
            tenantId = getTenantContext(request).id
        try {
            const result = await db.query('DELETE FROM category WHERE tenant_id = $1 AND id = $2', [
                tenantId,
                id,
            ])
            if (!result.rowCount)
                return reply.code(404).send({ error: 'NOT_FOUND', message: 'Category not found' })
            return reply.code(204).send()
        } catch (error) {
            if (hasDatabaseCode(error, '23503'))
                return reply.code(409).send({
                    error: 'CONFLICT',
                    message: 'Category cannot be deleted while child categories reference it',
                })
            throw error
        }
    })
}
