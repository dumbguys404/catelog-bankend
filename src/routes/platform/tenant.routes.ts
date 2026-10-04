import type { FastifyPluginAsync, FastifyReply } from 'fastify'
import { env } from '../../config/env.js'
import { db } from '../../db/pool.js'
import { normalizeHostname } from '../../tenant/registry.js'
import { hasDatabaseCode } from '../../utils/db-errors.js'
import { idParamsSchema, paginationQueryProperties, parseLimit, parsePage, type QueryRecord } from '../../utils/query.js'

const listQuerySchema={type:'object',additionalProperties:false,properties:paginationQueryProperties}
const tenantProperties={code:{type:'string',minLength:1,maxLength:50,pattern:'^[a-z0-9]+(?:-[a-z0-9]+)*$'},name:{type:'string',minLength:1,maxLength:150},domain:{type:['string','null'],maxLength:255,pattern:'^[A-Za-z0-9.-]+$'},status:{type:'string',enum:['ACTIVE','SUSPENDED','INACTIVE']}}
const createBodySchema={type:'object',additionalProperties:false,required:['code','name'],properties:tenantProperties}
const updateBodySchema={type:'object',additionalProperties:false,minProperties:1,properties:tenantProperties}
type TenantBody={code?:string;name?:string;domain?:string|null;status?:'ACTIVE'|'SUSPENDED'|'INACTIVE'}
type TenantRow={id:string|number;code:string;name:string;domain:string|null;status:'ACTIVE'|'SUSPENDED'|'INACTIVE';created_at:string|Date;updated_at:string|Date}
function mapTenant(row:TenantRow){return{id:Number(row.id),code:row.code,name:row.name,domain:row.domain,status:row.status,createdAt:row.created_at,updatedAt:row.updated_at}}

async function validateTenantHosts(tenantId:number|null,code:string,domain:string|null,reply:FastifyReply):Promise<boolean>{
    const generated=normalizeHostname(`${code}.${env.tenantBaseDomain}`),custom=domain?normalizeHostname(domain):null,platform=normalizeHostname(env.platformHost)
    if(generated===platform||custom===platform){reply.code(409).send({error:'CONFLICT',message:'Tenant hostname conflicts with the platform hostname'});return false}
    if(custom&&custom===generated){reply.code(400).send({error:'BAD_REQUEST',message:'Custom domain must be different from the tenant generated hostname'});return false}
    const result=await db.query<{id:string|number;code:string;domain:string|null}>(`SELECT id,code,domain FROM tenant WHERE $1::bigint IS NULL OR id<>$1`,[tenantId])
    for(const row of result.rows){const otherGenerated=normalizeHostname(`${row.code}.${env.tenantBaseDomain}`),otherCustom=row.domain?normalizeHostname(row.domain):null
        if(generated===otherGenerated||generated===otherCustom||(custom!==null&&(custom===otherGenerated||custom===otherCustom))){reply.code(409).send({error:'CONFLICT',message:'Tenant hostname is already in use'});return false}}
    return true
}

export const platformTenantRoutes:FastifyPluginAsync=async(app)=>{
    app.get('/',{schema:{querystring:listQuerySchema}},async request=>{
        const query=request.query as QueryRecord,page=parsePage(query),limit=parseLimit(query),offset=(page-1)*limit
        const [rows,count]=await Promise.all([
            db.query<TenantRow>('SELECT id,code,name,domain,status,created_at,updated_at FROM tenant ORDER BY id LIMIT $1 OFFSET $2',[limit,offset]),
            db.query<{total:string}>('SELECT COUNT(*)::text AS total FROM tenant')])
        return{data:rows.rows.map(mapTenant),pagination:{page,limit,total:Number(count.rows[0]?.total??0)}}
    })
    app.get('/:id',{schema:{params:idParamsSchema}},async(request,reply)=>{
        const {id}=request.params as{id:number},result=await db.query<TenantRow>('SELECT id,code,name,domain,status,created_at,updated_at FROM tenant WHERE id=$1',[id])
        if(!result.rows[0])return reply.code(404).send({error:'NOT_FOUND',message:'Tenant not found'})
        return{data:mapTenant(result.rows[0])}
    })
    app.post('/',{schema:{body:createBodySchema}},async(request,reply)=>{
        const body=request.body as TenantBody,code=body.code!,domain=body.domain?normalizeHostname(body.domain):null
        if(!(await validateTenantHosts(null,code,domain,reply)))return
        try{
            const result=await db.query<TenantRow>(`INSERT INTO tenant(code,name,domain,status) VALUES($1,$2,$3,$4)
                RETURNING id,code,name,domain,status,created_at,updated_at`,[code,body.name,domain,body.status??'ACTIVE'])
            await app.tenantRegistry.reload()
            return reply.code(201).send({data:mapTenant(result.rows[0]!)})
        }catch(error){if(hasDatabaseCode(error,'23505'))return reply.code(409).send({error:'CONFLICT',message:'Tenant code or domain already exists'});throw error}
    })
    app.patch('/:id',{schema:{params:idParamsSchema,body:updateBodySchema}},async(request,reply)=>{
        const {id}=request.params as{id:number},body=request.body as TenantBody
        const current=await db.query<TenantRow>('SELECT id,code,name,domain,status,created_at,updated_at FROM tenant WHERE id=$1',[id]),row=current.rows[0]
        if(!row)return reply.code(404).send({error:'NOT_FOUND',message:'Tenant not found'})
        const code=body.code??row.code,domain=body.domain===undefined?row.domain:body.domain===null?null:normalizeHostname(body.domain)
        if(!(await validateTenantHosts(id,code,domain,reply)))return
        const fields:string[]=[],values:unknown[]=[id],add=(column:string,value:unknown)=>{values.push(value);fields.push(`${column}=$${values.length}`)}
        if(body.code!==undefined)add('code',body.code);if(body.name!==undefined)add('name',body.name);if(body.domain!==undefined)add('domain',domain);if(body.status!==undefined)add('status',body.status)
        try{
            const result=await db.query<TenantRow>(`UPDATE tenant SET ${fields.join(',')} WHERE id=$1 RETURNING id,code,name,domain,status,created_at,updated_at`,values)
            await app.tenantRegistry.reload()
            return{data:mapTenant(result.rows[0]!)}
        }catch(error){if(hasDatabaseCode(error,'23505'))return reply.code(409).send({error:'CONFLICT',message:'Tenant code or domain already exists'});throw error}
    })
    app.delete('/:id',{schema:{params:idParamsSchema}},async(request,reply)=>{
        const {id}=request.params as{id:number},current=await db.query('SELECT 1 FROM tenant WHERE id=$1',[id])
        if(!current.rows[0])return reply.code(404).send({error:'NOT_FOUND',message:'Tenant not found'})
        const data=await db.query<{has_data:boolean}>(`SELECT EXISTS(SELECT 1 FROM app_user WHERE tenant_id=$1 UNION ALL SELECT 1 FROM category WHERE tenant_id=$1 UNION ALL SELECT 1 FROM brand WHERE tenant_id=$1 UNION ALL SELECT 1 FROM product WHERE tenant_id=$1 UNION ALL SELECT 1 FROM collection WHERE tenant_id=$1) AS has_data`,[id])
        if(data.rows[0]?.has_data)await db.query("UPDATE tenant SET status='INACTIVE' WHERE id=$1",[id])
        else await db.query('DELETE FROM tenant WHERE id=$1',[id])
        await app.tenantRegistry.reload()
        return reply.code(204).send()
    })
}
