import assert from 'node:assert/strict'
import { test } from 'node:test'

process.env.DATABASE_URL = 'postgresql://unused:unused@localhost/unused'
process.env.TENANT_BASE_DOMAIN = 'ourdomain.com'
process.env.PLATFORM_HOST = 'platform.ourdomain.com'
process.env.PLATFORM_ADMIN_USERNAME = 'platform-admin'
process.env.PLATFORM_ADMIN_PASSWORD = 'platform-password'

const { buildApp } = await import('../src/app.ts')
const { db } = await import('../src/db/pool.ts')

const tenant = { id: 12, code: 'shop', name: 'Shop', domain: null }
const registry = {
    getByHostname: (host) => host === 'shop.ourdomain.com' ? tenant : undefined,
    getByTenantId: (id) => id === tenant.id ? tenant : undefined
}
const platformAuth = `Basic ${Buffer.from('platform-admin:platform-password').toString('base64')}`

const product = {
    id: '7', tenant_id: '12', brand_id: null, name: 'Dress', slug: 'dress',
    short_description: null, description: null, price: '12.50', mrp: null,
    availability: 'AVAILABLE', status: 'ACTIVE', display_order: 0,
    created_at: new Date(0), updated_at: new Date(0), brand_name: null,
    brand_slug: null, primary_image_id: null, primary_image_key: null,
    primary_image_alt_text: null
}

test('split product and collection routes keep public/admin behavior and tenant scope', async () => {
    const queries = []
    db.query = async (sql, values = []) => {
        queries.push({ sql, values })
        if (sql.startsWith('UPDATE product SET')) return { rows: [{ id: '7' }], rowCount: 1 }
        if (sql.includes('FROM product p')) return { rows: [product], rowCount: 1 }
        if (sql.includes('FROM product_image')) return { rows: [], rowCount: 0 }
        if (sql.includes('FROM product_category')) return { rows: [], rowCount: 0 }
        if (sql.includes('FROM collection_product')) return { rows: [], rowCount: 0 }
        if (sql.includes('FROM collection')) return { rows: [{ id: '8' }], rowCount: 1 }
        if (sql.includes('FROM product WHERE tenant_id')) return { rows: [{ id: '7' }], rowCount: 1 }
        throw new Error(`Unexpected query: ${sql}`)
    }
    const app = buildApp(registry, { authenticate: async () => null })
    try {
        const publicProduct = await app.inject({
            url: '/api/catalog/products/7', headers: { host: 'shop.ourdomain.com' }
        })
        assert.equal(publicProduct.statusCode, 200)
        assert.equal(publicProduct.json().data.price, 12.5)
        assert.equal('tenantId' in publicProduct.json().data, false)
        assert.equal('status' in publicProduct.json().data, false)

        const platformHeaders = {
            host: 'platform.ourdomain.com', authorization: platformAuth,
            'x-platform-tenant-id': '12'
        }
        const adminProduct = await app.inject({
            url: '/api/admin/products/7', headers: platformHeaders
        })
        assert.equal(adminProduct.statusCode, 200)
        assert.equal(adminProduct.json().data.tenantId, 12)
        assert.equal(adminProduct.json().data.status, 'ACTIVE')

        const images = await app.inject({
            url: '/api/admin/products/7/images', headers: platformHeaders
        })
        const categories = await app.inject({
            url: '/api/admin/products/7/categories', headers: platformHeaders
        })
        const collectionProducts = await app.inject({
            url: '/api/admin/collections/8/products', headers: platformHeaders
        })
        assert.equal(images.statusCode, 200)
        assert.equal(categories.statusCode, 200)
        assert.equal(collectionProducts.statusCode, 200)

        const updated = await app.inject({
            method: 'PATCH', url: '/api/admin/products/7', headers: platformHeaders,
            payload: { name: 'New dress', price: 20 }
        })
        assert.equal(updated.statusCode, 200)
        const updateQuery = queries.find(({ sql }) => sql.startsWith('UPDATE product SET'))
        assert.deepEqual(updateQuery.values, [12, 7, 'New dress', 20])
        assert.match(updateQuery.sql, /WHERE tenant_id = \$1 AND id = \$2/)

        const tenantOverride = await app.inject({
            method: 'PATCH', url: '/api/admin/products/7', headers: platformHeaders,
            payload: { tenantId: 99 }
        })
        assert.equal(tenantOverride.statusCode, 400)
        assert(queries.every(({ values }) => values[0] === tenant.id))
    } finally {
        await app.close()
    }
})
