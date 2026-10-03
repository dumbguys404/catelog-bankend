import type { FastifyPluginAsync } from 'fastify'

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

const dummyTenant = {
    id: 1,
    code: 'royal-fashion',
    name: 'Royal Fashion',
    domain: 'royalfashion.example',
    status: 'ACTIVE'
}

export const platformTenantRoutes: FastifyPluginAsync = async (app) => {
    app.get('/', {
        schema: {
            querystring: listQuerySchema
        }
    }, async (request) => {
        const query = request.query as QueryRecord

        return {
            data: [dummyTenant],
            pagination: {
                page: parsePage(query),
                limit: parseLimit(query),
                total: 1
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
            data: {
                ...dummyTenant,
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
            message: 'Created',
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
        message: 'Deleted'
    }))
}
