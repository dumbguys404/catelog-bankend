import type { FastifyRequest, FastifyReply } from 'fastify'
import { getTenantContext } from '../../plugins/tenant-context.js'
import type { CreateUser, UpdateUser } from './user.schema.js'

export function duplicate(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505'
}

export async function listUsers(request: FastifyRequest) {
    return { data: await request.server.userRepository.list(getTenantContext(request).id) }
}

export async function getUser(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: number }
    const user = await request.server.userRepository.get(getTenantContext(request).id, id)
    if (!user) return reply.code(404).send({ error: 'NOT_FOUND', message: 'User not found' })
    return { data: user }
}

export async function createUser(request: FastifyRequest, reply: FastifyReply) {
    try {
        const user = await request.server.userRepository.create(
            getTenantContext(request).id,
            request.body as CreateUser,
        )
        return reply.code(201).send({ data: user })
    } catch (error) {
        if (duplicate(error))
            return reply.code(409).send({
                error: 'CONFLICT',
                message: 'A user with this email already exists',
            })
        throw error
    }
}

export async function updateUser(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: number }
    try {
        const user = await request.server.userRepository.update(
            getTenantContext(request).id,
            id,
            request.body as UpdateUser,
        )
        if (!user) return reply.code(404).send({ error: 'NOT_FOUND', message: 'User not found' })
        return { data: user }
    } catch (error) {
        if (duplicate(error))
            return reply.code(409).send({
                error: 'CONFLICT',
                message: 'A user with this email already exists',
            })
        throw error
    }
}

export async function deleteUser(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: number }
    const deleted = await request.server.userRepository.delete(getTenantContext(request).id, id)
    if (!deleted) return reply.code(404).send({ error: 'NOT_FOUND', message: 'User not found' })
    return reply.code(204).send()
}
