import type { FastifyPluginAsync } from 'fastify'
import { getTenantContext } from '../../plugins/tenant-context.js'

export const authRoutes: FastifyPluginAsync = async (app) => {
    app.get('/me', async (request) => {
        const user = request.user!
        const tenant = getTenantContext(request)
        return {
            data: {
                id: user.id,
                username: user.username,
                name: user.name,
                role: user.role,
                tenant: { id: tenant.id, code: tenant.code, name: tenant.name },
            },
        }
    })
}
