import type { FastifyPluginAsync } from 'fastify'
import { db } from '../../db/pool.js'
import { getTenantContext } from '../../plugins/tenant-context.js'
import { publicObjectUrl } from '../../storage/r2.js'
import { idParamsSchema } from '../../utils/query.js'

type BrandRow = { id: string | number; name: string; slug: string; description: string | null; logo_key: string | null; website_url: string | null; display_order: number }
function mapBrand(row: BrandRow) {
    return { id: Number(row.id), name: row.name, slug: row.slug, description: row.description,
        logoKey: row.logo_key, logoUrl: row.logo_key ? publicObjectUrl(row.logo_key) : null,
        websiteUrl: row.website_url, displayOrder: row.display_order }
}
export const catalogBrandRoutes: FastifyPluginAsync = async (app) => {
    app.get('/', async (request) => {
        const result = await db.query<BrandRow>(`SELECT id,name,slug,description,logo_key,website_url,display_order
            FROM brand WHERE tenant_id=$1 AND status='ACTIVE' ORDER BY display_order,name,id`, [getTenantContext(request).id])
        return { data: result.rows.map(mapBrand) }
    })
    app.get('/:id', { schema: { params: idParamsSchema } }, async (request, reply) => {
        const { id } = request.params as { id: number }
        const result = await db.query<BrandRow>(`SELECT id,name,slug,description,logo_key,website_url,display_order
            FROM brand WHERE tenant_id=$1 AND id=$2 AND status='ACTIVE'`, [getTenantContext(request).id, id])
        if (!result.rows[0]) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Brand not found' })
        return { data: mapBrand(result.rows[0]) }
    })
}
