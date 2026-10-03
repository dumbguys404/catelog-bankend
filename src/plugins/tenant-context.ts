import type { FastifyReply, FastifyRequest } from 'fastify'
import { env } from '../config/env.js'
import { normalizeHostname, type TenantContext } from '../tenant/registry.js'

export type AuthenticatedUser = {
    id: number
    tenantId: number
    username: string
    name: string
    role: 'OWNER' | 'ADMIN' | 'EDITOR'
}

declare module 'fastify' {
    interface FastifyRequest {
        tenant?: TenantContext
        user?: AuthenticatedUser
        platformAdmin?: { username: string; role: 'PLATFORM_ADMIN' }
    }
}

export function isPlatformHost(request: FastifyRequest): boolean {
    return normalizeHostname(request.hostname) === normalizeHostname(env.platformHost)
}

export async function attachTenantContext(
    request: FastifyRequest,
    reply: FastifyReply
) {
    if (isPlatformHost(request)) {
        return reply.code(404).send({
            error: 'TENANT_NOT_FOUND',
            message: 'Tenant could not be resolved for this host'
        })
    }
    const tenant = request.server.tenantRegistry.getByHostname(request.hostname)
    if (!tenant) {
        return reply.code(404).send({
            error: 'TENANT_NOT_FOUND',
            message: 'Tenant could not be resolved for this host'
        })
    }
    request.tenant = tenant
}

export function getTenantContext(
    request: FastifyRequest
): TenantContext {
    if (!request.tenant) {
        throw new Error('Tenant context is not available')
    }

    return request.tenant
}
