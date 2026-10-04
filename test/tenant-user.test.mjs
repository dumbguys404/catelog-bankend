import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hash } from 'bcryptjs'

process.env.DATABASE_URL = 'postgresql://unused:unused@localhost/unused'
process.env.TENANT_BASE_DOMAIN = 'ourdomain.com'
process.env.PLATFORM_HOST = 'platform.ourdomain.com'
process.env.PLATFORM_ADMIN_USERNAME = 'platform-admin'
process.env.PLATFORM_ADMIN_PASSWORD = 'platform-password'

const { TenantRegistry } = await import('../src/tenant/registry.ts')
const { UserRepository } = await import('../src/users/repository.ts')
const { buildApp } = await import('../src/app.ts')
const { db } = await import('../src/db/pool.ts')

const basic = (email, password) => `Basic ${Buffer.from(`${email}:${password}`).toString('base64')}`

class FakePool {
    tenants = [
        { id: '1', code: 'tenant-a', name: 'Tenant A', domain: 'shop-a.com', status: 'ACTIVE' },
        { id: '2', code: 'tenant-b', name: 'Tenant B', domain: null, status: 'ACTIVE' },
        { id: '3', code: 'tenant-c', name: 'Tenant C', domain: null, status: 'INACTIVE' }
    ]
    users = []
    tenantQueries = 0
    failTenantQuery = false
    nextId = 1

    async query(sql, values = []) {
        if (sql.includes('FROM tenant')) {
            this.tenantQueries++
            if (this.failTenantQuery) throw new Error('database unavailable')
            assert.match(sql, /status = 'ACTIVE'/)
            const rows = this.tenants.filter(tenant => tenant.status === 'ACTIVE')
            return { rows, rowCount: rows.length }
        }
        if (sql.includes('INSERT INTO app_user')) {
            const [tenantId, email, passwordHash, firstName, lastName, role] = values
            if (this.users.some(user => user.tenant_id === String(tenantId) &&
                user.email.toLowerCase() === email.toLowerCase())) {
                throw Object.assign(new Error('duplicate'), { code: '23505' })
            }
            const user = { id: String(this.nextId++), tenant_id: String(tenantId), email,
                password_hash: passwordHash, first_name: firstName, last_name: lastName,
                tenant_role: role, status: 'ACTIVE', user_type: 'TENANT_USER' }
            this.users.push(user)
            return { rows: [user], rowCount: 1 }
        }
        const [tenantId, value] = values
        const matches = this.users.filter(user => user.tenant_id === String(tenantId) &&
            user.user_type === 'TENANT_USER')
        if (sql.includes('LOWER(email)')) {
            const row = matches.find(user => user.email.toLowerCase() === value.toLowerCase() && user.status === 'ACTIVE')
            return { rows: row ? [row] : [], rowCount: row ? 1 : 0 }
        }
        if (sql.startsWith('SELECT')) {
            const rows = sql.includes('id = $2') ? matches.filter(user => user.id === String(value)) : matches
            return { rows, rowCount: rows.length }
        }
        if (sql.startsWith('UPDATE')) {
            const row = matches.find(user => user.id === String(value))
            if (!row) return { rows: [], rowCount: 0 }
            const assignments = [...sql.matchAll(/(email|first_name|last_name|tenant_role|status|password_hash) = \$(\d+)/g)]
            for (const [, field, position] of assignments) row[field] = values[Number(position) - 1]
            return { rows: [row], rowCount: 1 }
        }
        if (sql.startsWith('DELETE')) {
            const index = this.users.findIndex(user => user.tenant_id === String(tenantId) && user.id === String(value))
            if (index < 0) return { rows: [], rowCount: 0 }
            this.users.splice(index, 1)
            return { rows: [], rowCount: 1 }
        }
        throw new Error(`Unexpected query: ${sql}`)
    }
}

async function setup() {
    const pool = new FakePool()
    pool.users.push({ id: '1', tenant_id: '1', email: 'admin@a.com',
        password_hash: await hash('password-a', 4), first_name: 'Admin', last_name: 'A',
        tenant_role: 'ADMIN', status: 'ACTIVE', user_type: 'TENANT_USER' })
    pool.nextId = 2
    const registry = new TenantRegistry(pool, 'ourdomain.com', 'platform.ourdomain.com')
    await registry.load()
    db.query = async (sql) => {
        if (sql.includes('COUNT(*)')) return { rows: [{ total: String(pool.tenants.length) }], rowCount: 1 }
        if (sql.includes('FROM tenant')) return { rows: pool.tenants.map(tenant => ({
            ...tenant, created_at: new Date(0), updated_at: new Date(0)
        })), rowCount: pool.tenants.length }
        throw new Error(`Unexpected platform test query: ${sql}`)
    }
    const app = buildApp(registry, new UserRepository(pool))
    return { pool, registry, app }
}

test('registry loads active tenant routes, normalizes hosts, swaps snapshots, and keeps prior snapshot on failure', async () => {
    const { pool, registry } = await setup()
    assert.equal(pool.tenantQueries, 1)
    assert.equal(registry.getByHostname(' Tenant-A.OurDomain.Com:3000. ')?.id, 1)
    assert.equal(registry.getByHostname(' Tenant-A.OurDomain.Com:3000 ' )?.id, 1)
    assert.equal(registry.getByHostname('shop-a.com')?.id, 1)
    assert.equal(registry.getByHostname('platform.ourdomain.com'), undefined)
    assert.equal(registry.getByHostname('tenant-c.ourdomain.com'), undefined)
    assert.equal(registry.getByHostname('unknown.com'), undefined)
    pool.tenants = [{ id: '1', code: 'tenant-a', name: 'Tenant A', domain: 'new-a.com', status: 'ACTIVE' }]
    await registry.reload()
    assert.equal(registry.getByHostname('shop-a.com'), undefined)
    assert.equal(registry.getByHostname('new-a.com')?.id, 1)
    pool.failTenantQuery = true
    await assert.rejects(registry.reload(), /database unavailable/)
    assert.equal(registry.getByHostname('new-a.com')?.id, 1)
    const fresh = new TenantRegistry(pool, 'ourdomain.com', 'platform.ourdomain.com')
    await assert.rejects(fresh.load(), /database unavailable/)
    assert.equal(fresh.getByHostname('new-a.com'), undefined)
})

test('host routing, public tenant, health, and platform access', async () => {
    const { pool, app } = await setup()
    try {
        const request = (host, url, headers = {}) => app.inject({ url, headers: { host, ...headers } })
        assert.equal((await request('unknown.com', '/health')).statusCode, 200)
        assert.equal((await request('tenant-a.ourdomain.com', '/api/catalog/tenant')).json().data.id, 1)
        assert.equal((await request('shop-a.com', '/api/catalog/tenant')).json().data.id, 1)
        assert.equal((await request('unknown.com', '/api/catalog/tenant')).json().error, 'TENANT_NOT_FOUND')
        assert.equal((await request('platform.ourdomain.com', '/api/catalog/tenant')).statusCode, 404)
        assert.equal((await request('tenant-a.ourdomain.com', '/api/platform/tenants',
            { authorization: basic('platform-admin', 'platform-password') })).statusCode, 404)
        assert.equal((await request('platform.ourdomain.com', '/api/platform/tenants')).statusCode, 401)
        assert.equal((await request('platform.ourdomain.com', '/api/platform/tenants',
            { authorization: basic('platform-admin', 'platform-password') })).statusCode, 200)
        assert.equal(pool.tenantQueries, 1)
    } finally { await app.close() }
})

test('tenant Basic Auth, user CRUD isolation, and platform selection', async () => {
    const { pool, app } = await setup()
    try {
        const tenantAuth = basic('admin@a.com', 'password-a')
        const platformAuth = basic('platform-admin', 'platform-password')
        const request = (host, method, url, authorization, payload, extra = {}) =>
            app.inject({ method, url, payload, headers: { host, ...(authorization ? { authorization } : {}), ...extra } })
        const hostA = 'tenant-a.ourdomain.com'
        const hostB = 'tenant-b.ourdomain.com'
        assert.equal((await request(hostA, 'GET', '/api/admin/users')).statusCode, 401)
        const wrongPassword = await request(hostA, 'GET', '/api/auth/me', basic('admin@a.com', 'wrong'))
        const unknownUser = await request(hostA, 'GET', '/api/auth/me', basic('missing@a.com', 'wrong'))
        assert.equal(wrongPassword.statusCode, 401)
        assert.equal(unknownUser.statusCode, 401)
        assert.deepEqual(wrongPassword.json(), unknownUser.json())
        assert.equal((await request(hostB, 'GET', '/api/auth/me', tenantAuth)).statusCode, 401)
        const me = (await request(hostA, 'GET', '/api/auth/me', tenantAuth)).json()
        assert.equal(me.data.tenant.id, 1)
        assert.equal(JSON.stringify(me).includes('password_hash'), false)
        assert.equal(JSON.stringify(me).includes('token'), false)
        const created = await request(hostA, 'POST', '/api/admin/users', tenantAuth,
            { email: 'new@a.com', password: 'new-password', role: 'EDITOR', firstName: 'New' })
        assert.equal(created.statusCode, 201)
        const id = created.json().data.id
        assert.equal(created.json().data.tenantId, 1)
        assert.equal(JSON.stringify(created.json()).includes('password'), false)
        assert.equal((await request(hostA, 'POST', '/api/admin/users', tenantAuth,
            { email: 'new@a.com', password: 'new-password', role: 'EDITOR' })).statusCode, 409)
        assert.equal((await request(hostA, 'GET', '/api/admin/users', basic('new@a.com', 'new-password'))).statusCode, 403)
        assert.equal((await request(hostA, 'POST', '/api/admin/users', tenantAuth,
            { email: 'bad@a.com', password: 'password', role: 'ADMIN', tenantId: 2 })).statusCode, 400)
        assert.equal((await request(hostA, 'GET', '/api/admin/users', tenantAuth)).json().data.length, 2)
        assert.equal((await request(hostB, 'GET', `/api/admin/users/${id}`, platformAuth)).statusCode, 401)
        assert.equal((await request(hostA, 'GET', `/api/admin/users/${id}`, tenantAuth)).statusCode, 200)
        assert.equal((await request(hostA, 'PATCH', `/api/admin/users/${id}`, tenantAuth,
            { status: 'DISABLED' })).statusCode, 200)
        assert.equal((await request(hostA, 'GET', '/api/auth/me', basic('new@a.com', 'new-password'))).statusCode, 401)
        assert.equal((await request(hostA, 'GET', '/api/admin/users', tenantAuth,
            undefined, { 'x-platform-tenant-id': '2' })).json().data.length, 2)
        const platformHost = 'platform.ourdomain.com'
        assert.equal((await request(platformHost, 'GET', '/api/admin/users', platformAuth)).statusCode, 404)
        assert.equal((await request(platformHost, 'GET', '/api/admin/users', platformAuth,
            undefined, { 'x-platform-tenant-id': '1' })).statusCode, 200)
        const sameEmailOtherTenant = await request(platformHost, 'POST', '/api/admin/users', platformAuth,
            { email: 'new@a.com', password: 'tenant-b-password', role: 'ADMIN' },
            { 'x-platform-tenant-id': '2' })
        assert.equal(sameEmailOtherTenant.statusCode, 201)
        assert.equal((await request(hostB, 'GET', '/api/auth/me',
            basic('new@a.com', 'tenant-b-password'))).statusCode, 200)
        const platformCreate = await request(platformHost, 'POST', '/api/admin/users', platformAuth,
            { email: 'new@b.com', password: 'password-b', role: 'ADMIN' }, { 'x-platform-tenant-id': '2' })
        assert.equal(platformCreate.statusCode, 201)
        assert.equal(platformCreate.json().data.tenantId, 2)
        assert.equal((await request(hostA, 'GET', `/api/admin/users/${platformCreate.json().data.id}`, tenantAuth)).statusCode, 404)
        assert.equal((await request(hostA, 'PATCH', `/api/admin/users/${platformCreate.json().data.id}`, tenantAuth,
            { firstName: 'Illegal' })).statusCode, 404)
        assert.equal((await request(hostA, 'DELETE', `/api/admin/users/${platformCreate.json().data.id}`, tenantAuth)).statusCode, 404)
        assert.equal((await request(hostB, 'GET', '/api/auth/me', basic('new@b.com', 'password-b'))).statusCode, 200)
        assert.equal((await request(hostA, 'GET', '/api/admin/users')).statusCode, 401)
        assert.equal(pool.tenantQueries, 1)
    } finally { await app.close() }
})
