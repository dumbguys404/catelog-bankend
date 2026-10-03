import { createHash, timingSafeEqual } from 'node:crypto'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { env } from '../config/env.js'
import { attachTenantContext, getTenantContext, isPlatformHost } from './tenant-context.js'

type BasicCredentials = { username: string; password: string }

function parseBasicAuth(header: string | undefined): BasicCredentials | null {
    if (!header) return null
    const match = /^Basic ([A-Za-z0-9+/]+={0,2})$/i.exec(header)
    if (!match) return null
    const value = Buffer.from(match[1]!, 'base64').toString('utf8')
    const separator = value.indexOf(':')
    if (separator < 1) return null
    return { username: value.slice(0, separator), password: value.slice(separator + 1) }
}

function equal(actual: string, expected: string): boolean {
    const digest = (value: string) => createHash('sha256').update(value).digest()
    return timingSafeEqual(digest(actual), digest(expected))
}

export function sendUnauthorized(reply: FastifyReply) {
    return reply.header('WWW-Authenticate', 'Basic realm="catalog-admin"')
        .code(401).send({ error: 'UNAUTHORIZED', message: 'Authentication required' })
}

export async function requirePlatformAdmin(request: FastifyRequest, reply: FastifyReply) {
    if (!isPlatformHost(request)) {
        return reply.code(404).send({ error: 'NOT_FOUND', message: 'Route not found' })
    }
    const credentials = parseBasicAuth(request.headers.authorization)
    if (!credentials || !equal(credentials.username, env.platformAdmin.username) ||
        !equal(credentials.password, env.platformAdmin.password)) {
        return sendUnauthorized(reply)
    }
    request.platformAdmin = { username: env.platformAdmin.username, role: 'PLATFORM_ADMIN' }
}

export async function requireTenantUser(request: FastifyRequest, reply: FastifyReply) {
    const tenant = getTenantContext(request)
    const credentials = parseBasicAuth(request.headers.authorization)
    if (!credentials) return sendUnauthorized(reply)
    const user = await request.server.userRepository.authenticate(
        tenant.id, credentials.username, credentials.password
    )
    if (!user) return sendUnauthorized(reply)
    request.user = {
        id: user.id,
        tenantId: user.tenantId,
        username: user.email,
        name: [user.firstName, user.lastName].filter(Boolean).join(' '),
        role: user.role
    }
}

export async function requireTenantAdmin(request: FastifyRequest, reply: FastifyReply) {
    if (isPlatformHost(request)) {
        await requirePlatformAdmin(request, reply)
        if (reply.sent) return
        const header = request.headers['x-platform-tenant-id']
        const id = typeof header === 'string' && /^[1-9]\d*$/.test(header) ? Number(header) : NaN
        const tenant = request.server.tenantRegistry.getByTenantId(id)
        if (!tenant) {
            return reply.code(404).send({ error: 'TENANT_NOT_FOUND', message: 'Selected tenant not found' })
        }
        request.tenant = tenant
        return
    }
    await attachTenantContext(request, reply)
    if (reply.sent) return
    await requireTenantUser(request, reply)
    if (reply.sent) return
    if (request.user?.role !== 'OWNER' && request.user?.role !== 'ADMIN') {
        return reply.code(403).send({ error: 'FORBIDDEN', message: 'Administrator access required' })
    }
}
