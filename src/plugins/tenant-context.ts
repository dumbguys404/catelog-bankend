import type { FastifyReply, FastifyRequest } from 'fastify'

export type TenantContext = {
    id: number
    code: string
    domain: string
}

declare module 'fastify' {
    interface FastifyRequest {
        tenant?: TenantContext
    }
}

export async function attachTenantContext(
    request: FastifyRequest,
    _reply: FastifyReply
) {
    request.tenant = {
        id: 1,
        code: 'mock-tenant',
        domain: request.hostname
    }
}

export function getTenantContext(
    request: FastifyRequest
): TenantContext {
    if (!request.tenant) {
        throw new Error('Tenant context is not available')
    }

    return request.tenant
}
