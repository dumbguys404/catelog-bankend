import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify'
import { env } from '../../config/env.js'
import { db } from '../../db/pool.js'
import { getTenantContext } from '../../plugins/tenant-context.js'
import { allowedImageContentTypes, createProductImageUploadUrl, deleteObject, headObject,
    isAllowedImageContentType, newProductImageKey, productImagePrefix, publicObjectUrl } from '../../storage/r2.js'
import { hasDatabaseCode } from '../../utils/db-errors.js'
import { availabilityValues, idParamsSchema, paginationQueryProperties, parseLimit, parsePage, type QueryRecord } from '../../utils/query.js'

const productIdParamsSchema = { type: 'object', additionalProperties: false, required: ['productId'], properties: { productId: { type: 'integer', minimum: 1 } } }
const productImageParamsSchema = { type: 'object', additionalProperties: false, required: ['productId','imageId'], properties: { productId: { type: 'integer', minimum: 1 }, imageId: { type: 'integer', minimum: 1 } } }
const listQuerySchema = { type: 'object', additionalProperties: false, properties: paginationQueryProperties }
const productProperties = {
    brandId: { type: ['integer','null'], minimum: 1 }, name: { type: 'string', minLength: 1, maxLength: 200 },
    slug: { type: 'string', minLength: 1, maxLength: 220 }, shortDescription: { type: ['string','null'], maxLength: 500 },
    description: { type: ['string','null'] }, price: { type: ['number','null'], minimum: 0 }, mrp: { type: ['number','null'], minimum: 0 },
    availability: { type: 'string', enum: availabilityValues }, status: { type: 'string', enum: ['ACTIVE','INACTIVE'] }, displayOrder: { type: 'integer', minimum: 0 }
}
const createProductBodySchema = { type: 'object', additionalProperties: false, required: ['name','slug'], properties: productProperties }
const updateProductBodySchema = { type: 'object', additionalProperties: false, minProperties: 1, properties: productProperties }
const uploadUrlBodySchema = { type: 'object', additionalProperties: false, required: ['contentType','size'], properties: {
    filename: { type: 'string', minLength: 1, maxLength: 255 }, contentType: { type: 'string', enum: Object.keys(allowedImageContentTypes) },
    size: { type: 'integer', minimum: 1, maximum: env.r2.maxImageBytes } } }
const imageProperties = { objectKey: { type: 'string', minLength: 1, maxLength: 500 }, altText: { type: ['string','null'], maxLength: 255 }, isPrimary: { type: 'boolean' }, displayOrder: { type: 'integer', minimum: 0 } }
const createImageBodySchema = { type: 'object', additionalProperties: false, required: ['objectKey'], properties: imageProperties }
const updateImageBodySchema = { type: 'object', additionalProperties: false, minProperties: 1, properties: imageProperties }
const productCategoriesBodySchema = { type: 'object', additionalProperties: false, required: ['categoryIds'], properties: { categoryIds: { type: 'array', uniqueItems: true, items: { type: 'integer', minimum: 1 } } } }

type ProductBody = { brandId?: number | null; name?: string; slug?: string; shortDescription?: string | null; description?: string | null; price?: number | null; mrp?: number | null; availability?: typeof availabilityValues[number]; status?: 'ACTIVE' | 'INACTIVE'; displayOrder?: number }
type UploadUrlBody = { filename?: string; contentType: string; size: number }
type ImageBody = { objectKey?: string; altText?: string | null; isPrimary?: boolean; displayOrder?: number }
type ProductCategoriesBody = { categoryIds: number[] }
type ProductRow = { id: string | number; tenant_id: string | number; brand_id: string | number | null; name: string; slug: string; short_description: string | null; description: string | null; price: string | number | null; mrp: string | number | null; availability: typeof availabilityValues[number]; status: 'ACTIVE' | 'INACTIVE'; display_order: number; created_at: string | Date; updated_at: string | Date; brand_name: string | null; brand_slug: string | null; primary_image_id: string | number | null; primary_image_key: string | null; primary_image_alt_text: string | null }
type ImageRow = { id: string | number; tenant_id: string | number; product_id: string | number; object_key: string; alt_text: string | null; is_primary: boolean; display_order: number; created_at: string | Date }
type CategoryRow = { id: string | number; name: string; slug: string }
function money(value: string | number | null) { return value === null ? null : Number(value) }
function mapProduct(row: ProductRow) {
    return { id: Number(row.id), tenantId: Number(row.tenant_id), brandId: row.brand_id === null ? null : Number(row.brand_id),
        name: row.name, slug: row.slug, shortDescription: row.short_description, description: row.description,
        price: money(row.price), mrp: money(row.mrp), availability: row.availability, status: row.status, displayOrder: row.display_order,
        brand: row.brand_id === null ? null : { id: Number(row.brand_id), name: row.brand_name, slug: row.brand_slug },
        primaryImage: row.primary_image_id === null ? null : { id: Number(row.primary_image_id), objectKey: row.primary_image_key,
            url: row.primary_image_key ? publicObjectUrl(row.primary_image_key) : null, altText: row.primary_image_alt_text },
        createdAt: row.created_at, updatedAt: row.updated_at }
}
function mapImage(row: ImageRow) {
    return { id: Number(row.id), productId: Number(row.product_id), objectKey: row.object_key,
        url: publicObjectUrl(row.object_key), altText: row.alt_text, isPrimary: row.is_primary,
        displayOrder: row.display_order, createdAt: row.created_at }
}
const productSelect = `SELECT p.id,p.tenant_id,p.brand_id,p.name,p.slug,p.short_description,p.description,p.price,p.mrp,p.availability,p.status,p.display_order,p.created_at,p.updated_at,
    b.name AS brand_name,b.slug AS brand_slug,pi.id AS primary_image_id,pi.object_key AS primary_image_key,pi.alt_text AS primary_image_alt_text
    FROM product p LEFT JOIN brand b ON b.tenant_id=p.tenant_id AND b.id=p.brand_id
    LEFT JOIN LATERAL (SELECT id,object_key,alt_text FROM product_image WHERE tenant_id=p.tenant_id AND product_id=p.id ORDER BY is_primary DESC,display_order,id LIMIT 1) pi ON TRUE`
async function ensureBrand(tenantId: number, brandId: number) { const r = await db.query('SELECT 1 FROM brand WHERE tenant_id=$1 AND id=$2',[tenantId,brandId]); return Boolean(r.rows[0]) }
async function ensureProduct(tenantId: number, productId: number) { const r = await db.query('SELECT 1 FROM product WHERE tenant_id=$1 AND id=$2',[tenantId,productId]); return Boolean(r.rows[0]) }
async function verifyUploadedImage(tenantId: number, productId: number, objectKey: string): Promise<{ ok: true } | { ok: false; message: string }> {
    if (!objectKey.startsWith(productImagePrefix(tenantId, productId))) return { ok: false, message: 'Invalid image object key for this tenant/product' }
    try {
        const object = await headObject(objectKey), size = object.ContentLength ?? 0, type = object.ContentType ?? ''
        if (size < 1 || size > env.r2.maxImageBytes) return { ok: false, message: `Image must be between 1 and ${env.r2.maxImageBytes} bytes` }
        if (!isAllowedImageContentType(type)) return { ok: false, message: 'Uploaded object is not an allowed image type' }
        return { ok: true }
    } catch { return { ok: false, message: 'Image was not uploaded to R2 or is not accessible' } }
}

async function registerImage(request: FastifyRequest, reply: FastifyReply) {
    const tenantId = getTenantContext(request).id, { productId } = request.params as { productId: number }, body = request.body as ImageBody
    const objectKey = body.objectKey!
    if (!(await ensureProduct(tenantId, productId))) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Product not found' })
    const verified = await verifyUploadedImage(tenantId, productId, objectKey)
    if (!verified.ok) return reply.code(400).send({ error: 'BAD_REQUEST', message: verified.message })
    const client = await db.connect()
    try {
        await client.query('BEGIN')
        await client.query('SELECT id FROM product WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenantId,productId])
        const duplicate = await client.query('SELECT 1 FROM product_image WHERE tenant_id=$1 AND product_id=$2 AND object_key=$3',[tenantId,productId,objectKey])
        if (duplicate.rows[0]) { await client.query('ROLLBACK'); return reply.code(409).send({ error: 'CONFLICT', message: 'This image object is already registered' }) }
        const count = await client.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM product_image WHERE tenant_id=$1 AND product_id=$2',[tenantId,productId])
        const isPrimary = body.isPrimary ?? Number(count.rows[0]?.count ?? 0) === 0
        if (isPrimary) await client.query('UPDATE product_image SET is_primary=FALSE WHERE tenant_id=$1 AND product_id=$2 AND is_primary=TRUE',[tenantId,productId])
        const result = await client.query<ImageRow>(`INSERT INTO product_image (tenant_id,product_id,object_key,alt_text,is_primary,display_order)
            VALUES ($1,$2,$3,$4,$5,$6) RETURNING id,tenant_id,product_id,object_key,alt_text,is_primary,display_order,created_at`,
            [tenantId,productId,objectKey,body.altText ?? null,isPrimary,body.displayOrder ?? 0])
        await client.query('COMMIT')
        return reply.code(201).send({ data: mapImage(result.rows[0]!) })
    } catch (error) {
        await client.query('ROLLBACK')
        if (hasDatabaseCode(error,'23505')) return reply.code(409).send({ error:'CONFLICT',message:'Primary image conflict; retry the request' })
        throw error
    } finally { client.release() }
}

export const adminProductRoutes: FastifyPluginAsync = async (app) => {
    app.get('/', { schema: { querystring: listQuerySchema } }, async request => {
        const tenantId=getTenantContext(request).id, query=request.query as QueryRecord, page=parsePage(query), limit=parseLimit(query), offset=(page-1)*limit
        const [rows,count]=await Promise.all([
            db.query<ProductRow>(`${productSelect} WHERE p.tenant_id=$1 ORDER BY p.display_order,p.created_at DESC,p.id DESC LIMIT $2 OFFSET $3`,[tenantId,limit,offset]),
            db.query<{total:string}>('SELECT COUNT(*)::text AS total FROM product WHERE tenant_id=$1',[tenantId])])
        return { data:rows.rows.map(mapProduct), pagination:{page,limit,total:Number(count.rows[0]?.total ?? 0)} }
    })
    app.get('/:id',{schema:{params:idParamsSchema}},async(request,reply)=>{
        const tenantId=getTenantContext(request).id,{id}=request.params as {id:number}
        const product=await db.query<ProductRow>(`${productSelect} WHERE p.tenant_id=$1 AND p.id=$2`,[tenantId,id]), row=product.rows[0]
        if(!row)return reply.code(404).send({error:'NOT_FOUND',message:'Product not found'})
        const [images,categories]=await Promise.all([
            db.query<ImageRow>('SELECT id,tenant_id,product_id,object_key,alt_text,is_primary,display_order,created_at FROM product_image WHERE tenant_id=$1 AND product_id=$2 ORDER BY is_primary DESC,display_order,id',[tenantId,id]),
            db.query<CategoryRow>(`SELECT c.id,c.name,c.slug FROM product_category pc JOIN category c ON c.tenant_id=pc.tenant_id AND c.id=pc.category_id WHERE pc.tenant_id=$1 AND pc.product_id=$2 ORDER BY c.display_order,c.name,c.id`,[tenantId,id])])
        return {data:{...mapProduct(row),images:images.rows.map(mapImage),categories:categories.rows.map(c=>({id:Number(c.id),name:c.name,slug:c.slug}))}}
    })
    app.post('/',{schema:{body:createProductBodySchema}},async(request,reply)=>{
        const tenantId=getTenantContext(request).id,body=request.body as ProductBody
        if(body.brandId!=null && !(await ensureBrand(tenantId,body.brandId)))return reply.code(400).send({error:'BAD_REQUEST',message:'Brand does not belong to this tenant'})
        try{
            const inserted=await db.query<{id:string|number}>(`INSERT INTO product (tenant_id,brand_id,name,slug,short_description,description,price,mrp,availability,status,display_order)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,[tenantId,body.brandId??null,body.name,body.slug,body.shortDescription??null,body.description??null,body.price??null,body.mrp??null,body.availability??'AVAILABLE',body.status??'ACTIVE',body.displayOrder??0])
            const result=await db.query<ProductRow>(`${productSelect} WHERE p.tenant_id=$1 AND p.id=$2`,[tenantId,Number(inserted.rows[0]!.id)])
            return reply.code(201).send({data:mapProduct(result.rows[0]!)} )
        }catch(error){if(hasDatabaseCode(error,'23505'))return reply.code(409).send({error:'CONFLICT',message:'Product slug already exists for this tenant'});if(hasDatabaseCode(error,'23503'))return reply.code(400).send({error:'BAD_REQUEST',message:'Brand does not belong to this tenant'});throw error}
    })
    app.patch('/:id',{schema:{params:idParamsSchema,body:updateProductBodySchema}},async(request,reply)=>{
        const tenantId=getTenantContext(request).id,{id}=request.params as {id:number},body=request.body as ProductBody
        if(body.brandId!=null && !(await ensureBrand(tenantId,body.brandId)))return reply.code(400).send({error:'BAD_REQUEST',message:'Brand does not belong to this tenant'})
        const fields:string[]=[],values:unknown[]=[tenantId,id],add=(column:string,value:unknown)=>{values.push(value);fields.push(`${column}=$${values.length}`)}
        if(body.brandId!==undefined)add('brand_id',body.brandId);if(body.name!==undefined)add('name',body.name);if(body.slug!==undefined)add('slug',body.slug)
        if(body.shortDescription!==undefined)add('short_description',body.shortDescription);if(body.description!==undefined)add('description',body.description)
        if(body.price!==undefined)add('price',body.price);if(body.mrp!==undefined)add('mrp',body.mrp);if(body.availability!==undefined)add('availability',body.availability)
        if(body.status!==undefined)add('status',body.status);if(body.displayOrder!==undefined)add('display_order',body.displayOrder)
        try{
            const changed=await db.query('UPDATE product SET '+fields.join(',')+' WHERE tenant_id=$1 AND id=$2 RETURNING id',[...values])
            if(!changed.rows[0])return reply.code(404).send({error:'NOT_FOUND',message:'Product not found'})
            const result=await db.query<ProductRow>(`${productSelect} WHERE p.tenant_id=$1 AND p.id=$2`,[tenantId,id])
            return {data:mapProduct(result.rows[0]!)}
        }catch(error){if(hasDatabaseCode(error,'23505'))return reply.code(409).send({error:'CONFLICT',message:'Product slug already exists for this tenant'});if(hasDatabaseCode(error,'23503'))return reply.code(400).send({error:'BAD_REQUEST',message:'Brand does not belong to this tenant'});throw error}
    })
    app.delete('/:id',{schema:{params:idParamsSchema}},async(request,reply)=>{
        const {id}=request.params as {id:number},result=await db.query("UPDATE product SET status='INACTIVE' WHERE tenant_id=$1 AND id=$2",[getTenantContext(request).id,id])
        if(!result.rowCount)return reply.code(404).send({error:'NOT_FOUND',message:'Product not found'})
        return reply.code(204).send()
    })
    app.get('/:productId/images',{schema:{params:productIdParamsSchema}},async(request,reply)=>{
        const tenantId=getTenantContext(request).id,{productId}=request.params as {productId:number}
        if(!(await ensureProduct(tenantId,productId)))return reply.code(404).send({error:'NOT_FOUND',message:'Product not found'})
        const result=await db.query<ImageRow>('SELECT id,tenant_id,product_id,object_key,alt_text,is_primary,display_order,created_at FROM product_image WHERE tenant_id=$1 AND product_id=$2 ORDER BY is_primary DESC,display_order,id',[tenantId,productId])
        return {data:result.rows.map(mapImage)}
    })
    app.post('/:productId/images/upload-url',{schema:{params:productIdParamsSchema,body:uploadUrlBodySchema}},async(request,reply)=>{
        const tenantId=getTenantContext(request).id,{productId}=request.params as {productId:number},body=request.body as UploadUrlBody
        if(!(await ensureProduct(tenantId,productId)))return reply.code(404).send({error:'NOT_FOUND',message:'Product not found'})
        if(!isAllowedImageContentType(body.contentType))return reply.code(400).send({error:'BAD_REQUEST',message:'Unsupported image content type'})
        const objectKey=newProductImageKey(tenantId,productId,body.contentType),uploadUrl=await createProductImageUploadUrl(objectKey,body.contentType)
        return {data:{uploadUrl,objectKey,expiresIn:env.r2.uploadUrlTtlSeconds,requiredHeaders:{'Content-Type':body.contentType}}}
    })
    app.post('/:productId/images',{schema:{params:productIdParamsSchema,body:createImageBodySchema}},registerImage)
    app.post('/:productId/images/complete',{schema:{params:productIdParamsSchema,body:createImageBodySchema}},registerImage)
    app.patch('/:productId/images/:imageId',{schema:{params:productImageParamsSchema,body:updateImageBodySchema}},async(request,reply)=>{
        const tenantId=getTenantContext(request).id,{productId,imageId}=request.params as {productId:number;imageId:number},body=request.body as ImageBody
        const client=await db.connect();let oldKey:string|null=null;let uploadedKeyVerified=false
        try{
            await client.query('BEGIN')
            const product=await client.query('SELECT id FROM product WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenantId,productId])
            if(!product.rows[0]){await client.query('ROLLBACK');return reply.code(404).send({error:'NOT_FOUND',message:'Product not found'})}
            const current=await client.query<ImageRow>('SELECT id,tenant_id,product_id,object_key,alt_text,is_primary,display_order,created_at FROM product_image WHERE tenant_id=$1 AND product_id=$2 AND id=$3 FOR UPDATE',[tenantId,productId,imageId])
            const row=current.rows[0];if(!row){await client.query('ROLLBACK');return reply.code(404).send({error:'NOT_FOUND',message:'Product image not found'})}oldKey=row.object_key
            if(body.objectKey!==undefined && body.objectKey!==row.object_key){const verified=await verifyUploadedImage(tenantId,productId,body.objectKey);if(!verified.ok){await client.query('ROLLBACK');return reply.code(400).send({error:'BAD_REQUEST',message:verified.message})}uploadedKeyVerified=true
                const duplicate=await client.query('SELECT 1 FROM product_image WHERE tenant_id=$1 AND product_id=$2 AND object_key=$3 AND id<>$4',[tenantId,productId,body.objectKey,imageId])
                if(duplicate.rows[0]){await client.query('ROLLBACK');try{await deleteObject(body.objectKey)}catch{}return reply.code(409).send({error:'CONFLICT',message:'This image object is already registered'})}}
            if(body.isPrimary===true)await client.query('UPDATE product_image SET is_primary=FALSE WHERE tenant_id=$1 AND product_id=$2 AND id<>$3 AND is_primary=TRUE',[tenantId,productId,imageId])
            const fields:string[]=[],values:unknown[]=[tenantId,productId,imageId],add=(column:string,value:unknown)=>{values.push(value);fields.push(`${column}=$${values.length}`)}
            if(body.objectKey!==undefined)add('object_key',body.objectKey);if(body.altText!==undefined)add('alt_text',body.altText);if(body.isPrimary!==undefined)add('is_primary',body.isPrimary);if(body.displayOrder!==undefined)add('display_order',body.displayOrder)
            const updated=await client.query<ImageRow>(`UPDATE product_image SET ${fields.join(',')} WHERE tenant_id=$1 AND product_id=$2 AND id=$3 RETURNING id,tenant_id,product_id,object_key,alt_text,is_primary,display_order,created_at`,values)
            await client.query('COMMIT')
            if(body.objectKey!==undefined&&oldKey&&oldKey!==body.objectKey)try{await deleteObject(oldKey)}catch(error){request.log.warn({error,objectKey:oldKey},'Failed to delete replaced R2 image object')}
            return {data:mapImage(updated.rows[0]!)}
        }catch(error){await client.query('ROLLBACK');if(uploadedKeyVerified&&body.objectKey&&body.objectKey!==oldKey)try{await deleteObject(body.objectKey)}catch{}if(hasDatabaseCode(error,'23505'))return reply.code(409).send({error:'CONFLICT',message:'Primary image conflict; retry the request'});throw error}finally{client.release()}
    })
    app.delete('/:productId/images/:imageId',{schema:{params:productImageParamsSchema}},async(request,reply)=>{
        const tenantId=getTenantContext(request).id,{productId,imageId}=request.params as {productId:number;imageId:number},client=await db.connect();let objectKey:string|null=null
        try{
            await client.query('BEGIN');const product=await client.query('SELECT id FROM product WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenantId,productId])
            if(!product.rows[0]){await client.query('ROLLBACK');return reply.code(404).send({error:'NOT_FOUND',message:'Product not found'})}
            const deleted=await client.query<ImageRow>('DELETE FROM product_image WHERE tenant_id=$1 AND product_id=$2 AND id=$3 RETURNING id,tenant_id,product_id,object_key,alt_text,is_primary,display_order,created_at',[tenantId,productId,imageId])
            const row=deleted.rows[0];if(!row){await client.query('ROLLBACK');return reply.code(404).send({error:'NOT_FOUND',message:'Product image not found'})}objectKey=row.object_key
            if(row.is_primary){const next=await client.query<{id:string|number}>('SELECT id FROM product_image WHERE tenant_id=$1 AND product_id=$2 ORDER BY display_order,id LIMIT 1',[tenantId,productId]);if(next.rows[0])await client.query('UPDATE product_image SET is_primary=TRUE WHERE tenant_id=$1 AND product_id=$2 AND id=$3',[tenantId,productId,Number(next.rows[0].id)])}
            await client.query('COMMIT')
        }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
        if(objectKey)try{await deleteObject(objectKey)}catch(error){request.log.warn({error,objectKey},'Failed to delete R2 image object after database delete')}
        return reply.code(204).send()
    })
    app.get('/:productId/categories',{schema:{params:productIdParamsSchema}},async(request,reply)=>{
        const tenantId=getTenantContext(request).id,{productId}=request.params as {productId:number}
        if(!(await ensureProduct(tenantId,productId)))return reply.code(404).send({error:'NOT_FOUND',message:'Product not found'})
        const result=await db.query<CategoryRow>(`SELECT c.id,c.name,c.slug FROM product_category pc JOIN category c ON c.tenant_id=pc.tenant_id AND c.id=pc.category_id WHERE pc.tenant_id=$1 AND pc.product_id=$2 ORDER BY c.display_order,c.name,c.id`,[tenantId,productId])
        return {data:result.rows.map(c=>({id:Number(c.id),name:c.name,slug:c.slug}))}
    })
    app.put('/:productId/categories',{schema:{params:productIdParamsSchema,body:productCategoriesBodySchema}},async(request,reply)=>{
        const tenantId=getTenantContext(request).id,{productId}=request.params as {productId:number},{categoryIds}=request.body as ProductCategoriesBody,client=await db.connect()
        try{
            await client.query('BEGIN');const product=await client.query('SELECT id FROM product WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenantId,productId])
            if(!product.rows[0]){await client.query('ROLLBACK');return reply.code(404).send({error:'NOT_FOUND',message:'Product not found'})}
            if(categoryIds.length){const categories=await client.query('SELECT id FROM category WHERE tenant_id=$1 AND id=ANY($2::bigint[])',[tenantId,categoryIds]);if(categories.rows.length!==categoryIds.length){await client.query('ROLLBACK');return reply.code(400).send({error:'BAD_REQUEST',message:'One or more categories do not belong to this tenant'})}}
            await client.query('DELETE FROM product_category WHERE tenant_id=$1 AND product_id=$2',[tenantId,productId])
            if(categoryIds.length)await client.query('INSERT INTO product_category (tenant_id,product_id,category_id) SELECT $1,$2,category_id FROM UNNEST($3::bigint[]) AS category_id',[tenantId,productId,categoryIds])
            await client.query('COMMIT');return {data:{productId,categoryIds}}
        }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
    })
}
