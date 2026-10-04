import type { FastifyPluginAsync } from 'fastify'
import { db } from '../../db/pool.js'
import { getTenantContext } from '../../plugins/tenant-context.js'
import { publicObjectUrl } from '../../storage/r2.js'
import { idParamsSchema, paginationQueryProperties, parseLimit, parsePage, type QueryRecord } from '../../utils/query.js'

const listQuerySchema = { type: 'object', additionalProperties: false, properties: paginationQueryProperties }
type ProductRow = { id: string | number; brand_id: string | number | null; name: string; slug: string; short_description: string | null; description: string | null; price: string | number | null; mrp: string | number | null; availability: string; display_order: number; created_at: string | Date; updated_at: string | Date; brand_name: string | null; brand_slug: string | null; primary_image_id: string | number | null; primary_image_key: string | null; primary_image_alt_text: string | null }
type ImageRow = { id: string | number; object_key: string; alt_text: string | null; is_primary: boolean; display_order: number }
type CategoryRow = { id: string | number; name: string; slug: string }
function mapProduct(row: ProductRow) {
    return { id: Number(row.id), brandId: row.brand_id === null ? null : Number(row.brand_id), name: row.name, slug: row.slug,
        shortDescription: row.short_description, description: row.description, price: row.price === null ? null : Number(row.price),
        mrp: row.mrp === null ? null : Number(row.mrp), availability: row.availability, displayOrder: row.display_order,
        brand: row.brand_id === null ? null : { id: Number(row.brand_id), name: row.brand_name, slug: row.brand_slug },
        primaryImage: row.primary_image_id === null ? null : { id: Number(row.primary_image_id), objectKey: row.primary_image_key,
            url: row.primary_image_key ? publicObjectUrl(row.primary_image_key) : null, altText: row.primary_image_alt_text },
        createdAt: row.created_at, updatedAt: row.updated_at }
}
const productSelect = `SELECT p.id,p.brand_id,p.name,p.slug,p.short_description,p.description,p.price,p.mrp,p.availability,p.display_order,p.created_at,p.updated_at,
    b.name AS brand_name,b.slug AS brand_slug,pi.id AS primary_image_id,pi.object_key AS primary_image_key,pi.alt_text AS primary_image_alt_text
    FROM product p LEFT JOIN brand b ON b.tenant_id=p.tenant_id AND b.id=p.brand_id
    LEFT JOIN LATERAL (SELECT id,object_key,alt_text FROM product_image WHERE tenant_id=p.tenant_id AND product_id=p.id ORDER BY is_primary DESC,display_order,id LIMIT 1) pi ON TRUE`
export const catalogProductRoutes: FastifyPluginAsync = async (app) => {
    app.get('/',{schema:{querystring:listQuerySchema}},async request=>{
        const tenantId=getTenantContext(request).id,query=request.query as QueryRecord,page=parsePage(query),limit=parseLimit(query),offset=(page-1)*limit
        const [rows,count]=await Promise.all([
            db.query<ProductRow>(`${productSelect} WHERE p.tenant_id=$1 AND p.status='ACTIVE' ORDER BY p.display_order,p.created_at DESC,p.id DESC LIMIT $2 OFFSET $3`,[tenantId,limit,offset]),
            db.query<{total:string}>("SELECT COUNT(*)::text AS total FROM product WHERE tenant_id=$1 AND status='ACTIVE'",[tenantId])])
        return {data:rows.rows.map(mapProduct),pagination:{page,limit,total:Number(count.rows[0]?.total??0)}}
    })
    app.get('/:id',{schema:{params:idParamsSchema}},async(request,reply)=>{
        const tenantId=getTenantContext(request).id,{id}=request.params as {id:number}
        const result=await db.query<ProductRow>(`${productSelect} WHERE p.tenant_id=$1 AND p.id=$2 AND p.status='ACTIVE'`,[tenantId,id]),row=result.rows[0]
        if(!row)return reply.code(404).send({error:'NOT_FOUND',message:'Product not found'})
        const [images,categories]=await Promise.all([
            db.query<ImageRow>('SELECT id,object_key,alt_text,is_primary,display_order FROM product_image WHERE tenant_id=$1 AND product_id=$2 ORDER BY is_primary DESC,display_order,id',[tenantId,id]),
            db.query<CategoryRow>(`SELECT c.id,c.name,c.slug FROM product_category pc JOIN category c ON c.tenant_id=pc.tenant_id AND c.id=pc.category_id WHERE pc.tenant_id=$1 AND pc.product_id=$2 AND c.status='ACTIVE' ORDER BY c.display_order,c.name,c.id`,[tenantId,id])])
        return {data:{...mapProduct(row),images:images.rows.map(image=>({id:Number(image.id),objectKey:image.object_key,url:publicObjectUrl(image.object_key),altText:image.alt_text,isPrimary:image.is_primary,displayOrder:image.display_order})),categories:categories.rows.map(c=>({id:Number(c.id),name:c.name,slug:c.slug}))}}
    })
}
