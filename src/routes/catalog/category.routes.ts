import type { FastifyPluginAsync } from 'fastify'
import { db } from '../../db/pool.js'
import { getTenantContext } from '../../plugins/tenant-context.js'
import { publicObjectUrl } from '../../storage/r2.js'
import { idParamsSchema } from '../../utils/query.js'

type CategoryRow = {
    id: string | number
    parent_category_id: string | number | null
    name: string
    slug: string
    description: string | null
    image_key: string | null
    display_order: number
}
function mapCategory(row: CategoryRow) {
    return {
        id: Number(row.id),
        parentCategoryId: row.parent_category_id === null ? null : Number(row.parent_category_id),
        name: row.name,
        slug: row.slug,
        description: row.description,
        imageKey: row.image_key,
        imageUrl: row.image_key ? publicObjectUrl(row.image_key) : null,
        displayOrder: row.display_order,
    }
}

export const catalogCategoryRoutes: FastifyPluginAsync = async (app) => {
    app.get('/', async (request) => {
        const result = await db.query<CategoryRow>(
            `SELECT id,parent_category_id,name,slug,description,image_key,display_order
             FROM category WHERE tenant_id = $1 AND status = 'ACTIVE' ORDER BY display_order,name,id`,
            [getTenantContext(request).id],
        )
        return { data: result.rows.map(mapCategory) }
    })
    app.get('/:id', { schema: { params: idParamsSchema } }, async (request, reply) => {
        const { id } = request.params as { id: number }
        const result = await db.query<CategoryRow>(
            `SELECT id,parent_category_id,name,slug,description,image_key,display_order
             FROM category WHERE tenant_id = $1 AND id = $2 AND status = 'ACTIVE'`,
            [getTenantContext(request).id, id],
        )
        if (!result.rows[0])
            return reply.code(404).send({ error: 'NOT_FOUND', message: 'Category not found' })
        return { data: mapCategory(result.rows[0]) }
    })
}
