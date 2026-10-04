import assert from 'node:assert/strict'
import { request as httpRequest } from 'node:http'
import { randomBytes } from 'node:crypto'
import { hash } from 'bcryptjs'

process.env.TENANT_BASE_DOMAIN ??= 'ourdomain.com'
process.env.PLATFORM_HOST ??= 'platform.ourdomain.com'
process.env.PLATFORM_ADMIN_USERNAME ??= 'platform-smoke'
process.env.PLATFORM_ADMIN_PASSWORD ??= randomBytes(20).toString('hex')

const { db, closeDatabaseConnection } = await import('../src/plugins/db.ts')
const { TenantRegistry } = await import('../src/modules/tenant/tenant.registry.ts')
const { UserRepository } = await import('../src/modules/user/user.repository.ts')
const { buildApp } = await import('../src/app.ts')

const suffix = randomBytes(5).toString('hex')
const codeA = `smoke-a-${suffix}`
const codeB = `smoke-b-${suffix}`
const customDomain = `${codeA}.shop.test`
const emailA = `admin-a-${suffix}@example.test`
const emailB = emailA
const passwordA = randomBytes(20).toString('hex')
const passwordB = randomBytes(20).toString('hex')
const basic = (user, password) => `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`
const ids = []
let app

function fetchLocal(port, host, path, authorization, method = 'GET', body, extra = {}) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : undefined
        const req = httpRequest({ hostname: '127.0.0.1', port, path, method,
            headers: { Host: host, ...(authorization ? { Authorization: authorization } : {}),
                ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
                ...extra } }, response => {
            let text = ''
            response.on('data', chunk => { text += chunk })
            response.on('end', () => resolve({ status: response.statusCode,
                body: text ? JSON.parse(text) : null }))
        })
        req.on('error', reject)
        req.end(payload)
    })
}

try {
    for (const [code, domain] of [[codeA, customDomain], [codeB, null]]) {
        const result = await db.query(
            'INSERT INTO tenant (code, name, domain) VALUES ($1, $2, $3) RETURNING id',
            [code, code, domain]
        )
        ids.push(Number(result.rows[0].id))
    }
    for (const [id, email, password] of [[ids[0], emailA, passwordA], [ids[1], emailB, passwordB]]) {
        await db.query(`INSERT INTO app_user
            (tenant_id, email, password_hash, user_type, tenant_role)
            VALUES ($1, $2, $3, 'TENANT_USER', 'ADMIN')`,
            [id, email, await hash(password, 12)])
    }

    const registry = new TenantRegistry(db, process.env.TENANT_BASE_DOMAIN, process.env.PLATFORM_HOST)
    await registry.load()
    app = buildApp(registry, new UserRepository(db))
    const address = await app.listen({ host: '127.0.0.1', port: 0 })
    const port = Number(new URL(address).port)
    const hostA = `${codeA}.${process.env.TENANT_BASE_DOMAIN}`
    const hostB = `${codeB}.${process.env.TENANT_BASE_DOMAIN}`
    const authA = basic(emailA, passwordA)
    const platformAuth = basic(process.env.PLATFORM_ADMIN_USERNAME, process.env.PLATFORM_ADMIN_PASSWORD)

    assert.equal((await fetchLocal(port, 'unknown.test', '/health')).status, 200)
    assert.equal((await fetchLocal(port, hostA, '/api/catalog/tenant')).body.data.id, ids[0])
    assert.equal((await fetchLocal(port, customDomain, '/api/catalog/tenant')).body.data.id, ids[0])
    assert.equal((await fetchLocal(port, 'unknown.test', '/api/catalog/tenant')).body.error, 'TENANT_NOT_FOUND')
    assert.equal((await fetchLocal(port, hostA, '/api/auth/me', authA)).body.data.tenant.id, ids[0])
    assert.equal((await fetchLocal(port, hostB, '/api/auth/me', authA)).status, 401)
    assert.equal((await fetchLocal(port, hostA, '/api/admin/users')).status, 401)
    assert.equal((await fetchLocal(port, hostA, '/api/admin/users', authA)).status, 200)
    assert.equal((await fetchLocal(port, hostA, '/api/platform/tenants', platformAuth)).status, 404)
    assert.equal((await fetchLocal(port, process.env.PLATFORM_HOST, '/api/platform/tenants', platformAuth)).status, 200)
    assert.equal((await fetchLocal(port, process.env.PLATFORM_HOST, '/api/admin/users', platformAuth,
        'GET', undefined, { 'X-Platform-Tenant-Id': String(ids[1]) })).body.data.length, 1)

    const codeC = `smoke-c-${suffix}`
    const domainC = `${codeC}.shop.test`
    const createdTenant = await fetchLocal(port, process.env.PLATFORM_HOST,
        '/api/platform/tenants', platformAuth, 'POST',
        { code: codeC, name: 'Smoke C', domain: domainC, status: 'INACTIVE' })
    assert.equal(createdTenant.status, 201)
    assert.equal(createdTenant.body.data.status, 'INACTIVE')
    const tenantCId = createdTenant.body.data.id
    ids.push(tenantCId)
    assert.equal((await fetchLocal(port, domainC, '/api/catalog/tenant')).status, 404)
    assert.equal((await fetchLocal(port, process.env.PLATFORM_HOST,
        `/api/platform/tenants/${tenantCId}`, platformAuth, 'PATCH',
        { status: 'ACTIVE' })).status, 200)
    assert.equal((await fetchLocal(port, domainC, '/api/catalog/tenant')).body.data.id, tenantCId)
    const newDomainC = `new-${domainC}`
    assert.equal((await fetchLocal(port, process.env.PLATFORM_HOST,
        `/api/platform/tenants/${tenantCId}`, platformAuth, 'PATCH',
        { domain: newDomainC })).status, 200)
    assert.equal((await fetchLocal(port, domainC, '/api/catalog/tenant')).status, 404)
    assert.equal((await fetchLocal(port, newDomainC, '/api/catalog/tenant')).body.data.id, tenantCId)
    assert.equal((await fetchLocal(port, process.env.PLATFORM_HOST,
        '/api/platform/tenants', platformAuth, 'POST',
        { code: `smoke-conflict-${suffix}`, name: 'Conflict', domain: hostA })).status, 409)
    assert.equal((await fetchLocal(port, process.env.PLATFORM_HOST,
        `/api/platform/tenants/${tenantCId}`, platformAuth, 'DELETE')).status, 204)
    assert.equal((await fetchLocal(port, newDomainC, '/api/catalog/tenant')).status, 404)

    const brand = await fetchLocal(port, hostA, '/api/admin/brands', authA, 'POST',
        { name: 'Smoke Brand', slug: `smoke-brand-${suffix}` })
    assert.equal(brand.status, 201)
    const category = await fetchLocal(port, hostA, '/api/admin/categories', authA, 'POST',
        { name: 'Smoke Category', slug: `smoke-category-${suffix}` })
    assert.equal(category.status, 201)
    const product = await fetchLocal(port, hostA, '/api/admin/products', authA, 'POST',
        { name: 'Smoke Product', slug: `smoke-product-${suffix}`, brandId: brand.body.data.id })
    assert.equal(product.status, 201)
    const productId = product.body.data.id
    assert.equal((await fetchLocal(port, hostA,
        `/api/admin/products/${productId}/categories`, authA, 'PUT',
        { categoryIds: [category.body.data.id] })).status, 200)
    assert.equal((await fetchLocal(port, hostA,
        `/api/catalog/products/${productId}`)).body.data.categories.length, 1)
    assert.equal((await fetchLocal(port, hostB,
        `/api/admin/products/${productId}`, basic(emailB, passwordB))).status, 404)
    const collection = await fetchLocal(port, hostA, '/api/admin/collections', authA, 'POST',
        { name: 'Smoke Collection', slug: `smoke-collection-${suffix}`, type: 'FEATURED' })
    assert.equal(collection.status, 201)
    assert.equal((await fetchLocal(port, hostA,
        `/api/admin/collections/${collection.body.data.id}/products`, authA, 'PUT',
        { products: [{ productId, displayOrder: 0 }] })).status, 200)
    assert.equal((await fetchLocal(port, hostA,
        `/api/catalog/collections/${collection.body.data.id}/products`)).body.data.length, 1)

    const created = await fetchLocal(port, hostA, '/api/admin/users', authA, 'POST',
        { email: `created-${suffix}@example.test`, password: 'safe-password', role: 'EDITOR' })
    assert.equal(created.status, 201)
    assert.equal(created.body.data.tenantId, ids[0])
    assert.equal((await fetchLocal(port, hostB, `/api/admin/users/${created.body.data.id}`,
        basic(emailB, passwordB))).status, 404)
    assert.equal((await fetchLocal(port, hostA, `/api/admin/users/${created.body.data.id}`,
        authA, 'DELETE')).status, 204)
    console.log('RUNTIME_SMOKE_PASS')
} finally {
    if (app) await app.close()
    if (ids.length) {
        for (const table of ['collection_product', 'product_category', 'product_image',
            'collection', 'product', 'category', 'brand']) {
            await db.query(`DELETE FROM ${table} WHERE tenant_id = ANY($1::bigint[])`, [ids])
        }
        await db.query('DELETE FROM app_user WHERE tenant_id = ANY($1::bigint[])', [ids])
        await db.query('DELETE FROM tenant WHERE id = ANY($1::bigint[])', [ids])
    }
    await closeDatabaseConnection()
}
