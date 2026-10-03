import type { FastifyPluginAsync } from 'fastify'

import { getTenantContext } from '../../plugins/tenant-context.js'
import {
    emptyObjectBodySchema,
    idParamsSchema,
    paginationQueryProperties,
    parseLimit,
    parsePage,
    type QueryRecord
} from '../../utils/query.js'

const listQuerySchema = {
    type: 'object',
    additionalProperties: false,
    properties: paginationQueryProperties
}

export const adminCategoryRoutes: FastifyPluginAsync = async (app) => {
    app.get('/', {
        schema: {
            querystring: listQuerySchema
        }
    }, async (request) => {
        const query = request.query as QueryRecord

        return {
            tenant: getTenantContext(request),
            data: [],
            pagination: {
                page: parsePage(query),
                limit: parseLimit(query),
                total: 0
            }
        }
    })

    app.get('/:id', {
        schema: {
            params: idParamsSchema
        }
    }, async (request) => {
        const params = request.params as { id: number }

        return {
            tenant: getTenantContext(request),
            data: {
                id: params.id
            }
        }
    })

    app.post('/', {
        schema: {
            body: emptyObjectBodySchema
        }
    }, async (_request, reply) => {
        return reply.code(201).send({
            success: true,
            message: 'Category creation endpoint is working',
            data: {
                id: 1
            }
        })
    })

    app.patch('/:id', {
        schema: {
            params: idParamsSchema,
            body: emptyObjectBodySchema
        }
    }, async (request) => {
        const params = request.params as { id: number }

        return {
            success: true,
            message: 'Updated',
            data: {
                id: params.id
            }
        }
    })

    app.delete('/:id', {
        schema: {
            params: idParamsSchema
        }
    }, async () => ({
        success: true,
        message: 'Category deleted'
    }))
}
