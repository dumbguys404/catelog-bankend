import type { FastifyRequest, FastifyReply } from 'fastify'
import { getTenantContext } from '../../plugins/tenant-context.js'
import { hasDatabaseCode } from '../../utils/db-errors.js'
import { parseLimit, parsePage, type QueryRecord } from '../../utils/query.js'
import {
    mapAdminCategory,
    mapCatalogCategory,
    ensureParent,
    wouldCreateCycle,
    adminListCategories,
    adminGetCategory,
    adminCreateCategory,
    adminCheckCategoryExists,
    adminUpdateCategory,
    adminDeleteCategory,
    catalogListCategories,
    catalogGetCategory,
} from './category.repository.js'
import type { CategoryBody } from './category.schema.js'

export async function adminListCategoriesHandler(request: FastifyRequest) {
    const tenantId = getTenantContext(request).id
    const query = request.query as QueryRecord
    const page = parsePage(query),
        limit = parseLimit(query),
        offset = (page - 1) * limit
    const { rows, count } = await adminListCategories(tenantId, limit, offset)
    return {
        data: rows.map(mapAdminCategory),
        pagination: { page, limit, total: count },
    }
}

export async function adminGetCategoryHandler(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: number },
        tenantId = getTenantContext(request).id
    const row = await adminGetCategory(tenantId, id)
    if (!row) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Category not found' })
    return { data: mapAdminCategory(row) }
}

export async function adminCreateCategoryHandler(request: FastifyRequest, reply: FastifyReply) {
    const tenantId = getTenantContext(request).id,
        body = request.body as CategoryBody
    if (body.parentCategoryId != null && !(await ensureParent(tenantId, body.parentCategoryId))) {
        return reply.code(400).send({
            error: 'BAD_REQUEST',
            message: 'Parent category does not belong to this tenant',
        })
    }
    try {
        const row = await adminCreateCategory(tenantId, body)
        return reply.code(201).send({ data: mapAdminCategory(row!) })
    } catch (error) {
        if (hasDatabaseCode(error, '23505'))
            return reply.code(409).send({
                error: 'CONFLICT',
                message: 'Category slug already exists at this hierarchy level',
            })
        throw error
    }
}

export async function adminUpdateCategoryHandler(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: number },
        tenantId = getTenantContext(request).id
    const body = request.body as CategoryBody

    if (!(await adminCheckCategoryExists(tenantId, id)))
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
    try {
        const row = await adminUpdateCategory(tenantId, id, body)
        if (!row) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Category not found' })
        return { data: mapAdminCategory(row) }
    } catch (error) {
        if (hasDatabaseCode(error, '23505'))
            return reply.code(409).send({
                error: 'CONFLICT',
                message: 'Category slug already exists at this hierarchy level',
            })
        throw error
    }
}

export async function adminDeleteCategoryHandler(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: number },
        tenantId = getTenantContext(request).id
    try {
        const count = await adminDeleteCategory(tenantId, id)
        if (!count)
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
}

export async function catalogListCategoriesHandler(request: FastifyRequest) {
    const rows = await catalogListCategories(getTenantContext(request).id)
    return { data: rows.map(mapCatalogCategory) }
}

export async function catalogGetCategoryHandler(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: number }
    const row = await catalogGetCategory(getTenantContext(request).id, id)
    if (!row) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Category not found' })
    return { data: mapCatalogCategory(row) }
}
