import type { FastifyRequest, FastifyReply } from 'fastify'
import { env } from '../../config/env.js'
import { hasDatabaseCode } from '../../utils/db-errors.js'
import { parseLimit, parsePage, type QueryRecord } from '../../utils/query.js'
import { normalizeHostname } from './tenant.registry.js'
import {
    mapTenant,
    listTenants,
    getTenant,
    listTenantHostsExcept,
    createTenant,
    updateTenant,
    tenantExists,
    tenantHasData,
    deactivateTenant,
    deleteTenantData,
} from './tenant.repository.js'
import type { TenantBody } from './tenant.schema.js'

async function validateTenantHosts(
    tenantId: number | null,
    code: string,
    domain: string | null,
): Promise<{ ok: true } | { ok: false; statusCode: 400 | 409; message: string }> {
    const generated = normalizeHostname(`${code}.${env.tenantBaseDomain}`)
    const custom = domain ? normalizeHostname(domain) : null
    const platform = normalizeHostname(env.platformHost)
    if (generated === platform || custom === platform)
        return {
            ok: false,
            statusCode: 409,
            message: 'Tenant hostname conflicts with the platform hostname',
        }
    if (custom === generated)
        return {
            ok: false,
            statusCode: 400,
            message: 'Custom domain must be different from the tenant generated hostname',
        }

    for (const row of await listTenantHostsExcept(tenantId)) {
        const otherGenerated = normalizeHostname(`${row.code}.${env.tenantBaseDomain}`)
        const otherCustom = row.domain ? normalizeHostname(row.domain) : null
        if (
            generated === otherGenerated ||
            generated === otherCustom ||
            (custom !== null && (custom === otherGenerated || custom === otherCustom))
        )
            return { ok: false, statusCode: 409, message: 'Tenant hostname is already in use' }
    }
    return { ok: true }
}

export async function listTenantsHandler(request: FastifyRequest) {
    const query = request.query as QueryRecord,
        page = parsePage(query),
        limit = parseLimit(query),
        offset = (page - 1) * limit
    const { rows, count } = await listTenants(limit, offset)
    return {
        data: rows.map(mapTenant),
        pagination: { page, limit, total: count },
    }
}

export async function getTenantHandler(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: number },
        row = await getTenant(id)
    if (!row) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Tenant not found' })
    return { data: mapTenant(row) }
}

export async function createTenantHandler(request: FastifyRequest, reply: FastifyReply) {
    const body = request.body as TenantBody
    const domain = body.domain ? normalizeHostname(body.domain) : null
    const valid = await validateTenantHosts(null, body.code!, domain)
    if (!valid.ok)
        return reply.code(valid.statusCode).send({
            error: valid.statusCode === 409 ? 'CONFLICT' : 'BAD_REQUEST',
            message: valid.message,
        })
    try {
        const row = await createTenant({ ...body, domain })
        await request.server.tenantRegistry.reload()
        return reply.code(201).send({ data: mapTenant(row!) })
    } catch (error) {
        if (hasDatabaseCode(error, '23505'))
            return reply.code(409).send({
                error: 'CONFLICT',
                message: 'Tenant code or domain already exists',
            })
        throw error
    }
}

export async function updateTenantHandler(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: number },
        body = request.body as TenantBody
    const current = await getTenant(id)
    if (!current) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Tenant not found' })
    const domain =
        body.domain === undefined
            ? current.domain
            : body.domain === null
              ? null
              : normalizeHostname(body.domain)
    const valid = await validateTenantHosts(id, body.code ?? current.code, domain)
    if (!valid.ok)
        return reply.code(valid.statusCode).send({
            error: valid.statusCode === 409 ? 'CONFLICT' : 'BAD_REQUEST',
            message: valid.message,
        })
    try {
        const updated = await updateTenant(id, {
            ...body,
            domain: body.domain === undefined ? undefined : domain,
        })
        if (!updated)
            return reply.code(404).send({ error: 'NOT_FOUND', message: 'Tenant not found' })
        await request.server.tenantRegistry.reload()
        return { data: mapTenant(updated) }
    } catch (error) {
        if (hasDatabaseCode(error, '23505'))
            return reply.code(409).send({
                error: 'CONFLICT',
                message: 'Tenant code or domain already exists',
            })
        throw error
    }
}

export async function deleteTenantHandler(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: number }
    if (!(await tenantExists(id)))
        return reply.code(404).send({ error: 'NOT_FOUND', message: 'Tenant not found' })
    if (await tenantHasData(id)) {
        await deactivateTenant(id)
    } else {
        await deleteTenantData(id)
    }
    await request.server.tenantRegistry.reload()
    return reply.code(204).send()
}
