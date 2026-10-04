import type { FastifyPluginAsync } from 'fastify'
import { getTenantContext } from '../../plugins/tenant-context.js'
import type { CreateUser, UpdateUser } from '../../users/repository.js'
import { idParamsSchema } from '../../utils/query.js'

const email = {
    type: 'string',
    minLength: 3,
    maxLength: 255,
    pattern: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$',
}
const name = { type: 'string', minLength: 1, maxLength: 100 }
const password = { type: 'string', minLength: 8, maxLength: 256 }
const role = { type: 'string', enum: ['OWNER', 'ADMIN', 'EDITOR'] }

const createSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['email', 'password', 'role'],
    properties: { email, password, firstName: name, lastName: name, role },
}
const updateSchema = {
    type: 'object',
    additionalProperties: false,
    minProperties: 1,
    properties: {
        email,
        password,
        firstName: { type: ['string', 'null'], maxLength: 100 },
        lastName: { type: ['string', 'null'], maxLength: 100 },
        role,
        status: { type: 'string', enum: ['ACTIVE', 'LOCKED', 'DISABLED'] },
    },
}

function duplicate(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505'
}

export const adminUserRoutes: FastifyPluginAsync = async (app) => {
    app.get('/', async (request) => ({
        data: await app.userRepository.list(getTenantContext(request).id),
    }))

    app.get('/:id', { schema: { params: idParamsSchema } }, async (request, reply) => {
        const { id } = request.params as { id: number }
        const user = await app.userRepository.get(getTenantContext(request).id, id)
        if (!user) return reply.code(404).send({ error: 'NOT_FOUND', message: 'User not found' })
        return { data: user }
    })

    app.post('/', { schema: { body: createSchema } }, async (request, reply) => {
        try {
            const user = await app.userRepository.create(
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
    })

    app.patch(
        '/:id',
        { schema: { params: idParamsSchema, body: updateSchema } },
        async (request, reply) => {
            const { id } = request.params as { id: number }
            try {
                const user = await app.userRepository.update(
                    getTenantContext(request).id,
                    id,
                    request.body as UpdateUser,
                )
                if (!user)
                    return reply.code(404).send({ error: 'NOT_FOUND', message: 'User not found' })
                return { data: user }
            } catch (error) {
                if (duplicate(error))
                    return reply.code(409).send({
                        error: 'CONFLICT',
                        message: 'A user with this email already exists',
                    })
                throw error
            }
        },
    )

    app.delete('/:id', { schema: { params: idParamsSchema } }, async (request, reply) => {
        const { id } = request.params as { id: number }
        const deleted = await app.userRepository.delete(getTenantContext(request).id, id)
        if (!deleted) return reply.code(404).send({ error: 'NOT_FOUND', message: 'User not found' })
        return reply.code(204).send()
    })
}
