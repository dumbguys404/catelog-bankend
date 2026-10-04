import type { FastifyRequest, FastifyReply } from 'fastify'
import { getTenantContext } from '../../plugins/tenant-context.js'
import { hasDatabaseCode } from '../../utils/db-errors.js'
import { parseLimit, parsePage, type QueryRecord } from '../../utils/query.js'
import {
    mapAdminBrand,
    mapCatalogBrand,
    adminListBrands,
    adminGetBrand,
    adminCreateBrand,
    adminUpdateBrand,
    adminDeleteBrand,
    catalogListBrands,
    catalogGetBrand,
} from './brand.repository.js'
import type { BrandBody } from './brand.schema.js'

export async function adminListBrandsHandler(request: FastifyRequest) {
    const tenantId = getTenantContext(request).id,
        query = request.query as QueryRecord
    const page = parsePage(query),
        limit = parseLimit(query),
        offset = (page - 1) * limit
    const { rows, count } = await adminListBrands(tenantId, limit, offset)
    return {
        data: rows.map(mapAdminBrand),
        pagination: { page, limit, total: count },
    }
}

export async function adminGetBrandHandler(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: number },
        row = await adminGetBrand(getTenantContext(request).id, id)
    if (!row) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Brand not found' })
    return { data: mapAdminBrand(row) }
}

export async function adminCreateBrandHandler(request: FastifyRequest, reply: FastifyReply) {
    const body = request.body as BrandBody,
        tenantId = getTenantContext(request).id
    try {
        const row = await adminCreateBrand(tenantId, body)
        return reply.code(201).send({ data: mapAdminBrand(row!) })
    } catch (error) {
        if (hasDatabaseCode(error, '23505'))
            return reply.code(409).send({
                error: 'CONFLICT',
                message: 'Brand slug already exists for this tenant',
            })
        throw error
    }
}

export async function adminUpdateBrandHandler(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: number },
        tenantId = getTenantContext(request).id,
        body = request.body as BrandBody
    try {
        const row = await adminUpdateBrand(tenantId, id, body)
        if (!row) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Brand not found' })
        return { data: mapAdminBrand(row) }
    } catch (error) {
        if (hasDatabaseCode(error, '23505'))
            return reply.code(409).send({
                error: 'CONFLICT',
                message: 'Brand slug already exists for this tenant',
            })
        throw error
    }
}

export async function adminDeleteBrandHandler(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: number }
    try {
        const count = await adminDeleteBrand(getTenantContext(request).id, id)
        if (!count) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Brand not found' })
        return reply.code(204).send()
    } catch (error) {
        if (hasDatabaseCode(error, '23503'))
            return reply.code(409).send({
                error: 'CONFLICT',
                message: 'Brand cannot be deleted while products reference it',
            })
        throw error
    }
}

export async function catalogListBrandsHandler(request: FastifyRequest) {
    const rows = await catalogListBrands(getTenantContext(request).id)
    return { data: rows.map(mapCatalogBrand) }
}

export async function catalogGetBrandHandler(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: number },
        row = await catalogGetBrand(getTenantContext(request).id, id)
    if (!row) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Brand not found' })
    return { data: mapCatalogBrand(row) }
}
