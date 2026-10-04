import type { FastifyPluginAsync } from 'fastify'
import { idParamsSchema } from '../../utils/query.js'
import { createSchema, updateSchema } from './user.schema.js'
import { listUsers, getUser, createUser, updateUser, deleteUser } from './user.controller.js'

export const adminUserRoutes: FastifyPluginAsync = async (app) => {
    app.get('/', listUsers)
    app.get('/:id', { schema: { params: idParamsSchema } }, getUser)
    app.post('/', { schema: { body: createSchema } }, createUser)
    app.patch('/:id', { schema: { params: idParamsSchema, body: updateSchema } }, updateUser)
    app.delete('/:id', { schema: { params: idParamsSchema } }, deleteUser)
}
