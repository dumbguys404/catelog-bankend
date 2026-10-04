import { db } from '../../plugins/db.js'
import { buildUpdate } from '../../utils/update-fields.js'
import { publicObjectUrl } from '../../plugins/storage.js'
import type { AdminCategoryRow, CatalogCategoryRow, CategoryBody } from './category.schema.js'
import { categoryColumns } from './category.schema.js'

export function mapAdminCategory(row: AdminCategoryRow) {
    return {
        id: Number(row.id),
        tenantId: Number(row.tenant_id),
        parentCategoryId: row.parent_category_id === null ? null : Number(row.parent_category_id),
        name: row.name,
        slug: row.slug,
        description: row.description,
        imageKey: row.image_key,
        imageUrl: row.image_key ? publicObjectUrl(row.image_key) : null,
        displayOrder: row.display_order,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    }
}

export function mapCatalogCategory(row: CatalogCategoryRow) {
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

export async function ensureParent(tenantId: number, parentId: number): Promise<boolean> {
    const result = await db.query('SELECT 1 FROM category WHERE tenant_id = $1 AND id = $2', [
        tenantId,
        parentId,
    ])
    return Boolean(result.rows[0])
}

export async function wouldCreateCycle(
    tenantId: number,
    categoryId: number,
    parentId: number,
): Promise<boolean> {
    const result = await db.query(
        `WITH RECURSIVE descendants AS (
            SELECT id FROM category WHERE tenant_id = $1 AND id = $2
            UNION
            SELECT child.id FROM category child
            JOIN descendants parent ON child.parent_category_id = parent.id
            WHERE child.tenant_id = $1
         ) SELECT 1 FROM descendants WHERE id = $3 LIMIT 1`,
        [tenantId, categoryId, parentId],
    )
    return Boolean(result.rows[0])
}

export async function adminListCategories(tenantId: number, limit: number, offset: number) {
    const [rows, count] = await Promise.all([
        db.query<AdminCategoryRow>(
            `SELECT id, tenant_id, parent_category_id, name, slug, description, image_key, display_order, status, created_at, updated_at
             FROM category WHERE tenant_id = $1 ORDER BY display_order, name, id LIMIT $2 OFFSET $3`,
            [tenantId, limit, offset],
        ),
        db.query<{ total: string }>(
            'SELECT COUNT(*)::text AS total FROM category WHERE tenant_id = $1',
            [tenantId],
        ),
    ])
    return { rows: rows.rows, count: Number(count.rows[0]?.total ?? 0) }
}

export async function adminGetCategory(tenantId: number, id: number) {
    const result = await db.query<AdminCategoryRow>(
        `SELECT id, tenant_id, parent_category_id, name, slug, description, image_key, display_order, status, created_at, updated_at
         FROM category WHERE tenant_id = $1 AND id = $2`,
        [tenantId, id],
    )
    return result.rows[0]
}

export async function adminCreateCategory(tenantId: number, body: CategoryBody) {
    const result = await db.query<AdminCategoryRow>(
        `INSERT INTO category (tenant_id, parent_category_id, name, slug, description, image_key, display_order, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id, tenant_id, parent_category_id, name, slug, description, image_key, display_order, status, created_at, updated_at`,
        [
            tenantId,
            body.parentCategoryId ?? null,
            body.name,
            body.slug,
            body.description ?? null,
            body.imageKey ?? null,
            body.displayOrder ?? 0,
            body.status ?? 'ACTIVE',
        ],
    )
    return result.rows[0]
}

export async function adminCheckCategoryExists(tenantId: number, id: number) {
    const exists = await db.query('SELECT 1 FROM category WHERE tenant_id = $1 AND id = $2', [
        tenantId,
        id,
    ])
    return Boolean(exists.rows[0])
}

export async function adminUpdateCategory(tenantId: number, id: number, body: CategoryBody) {
    const { assignments, values } = buildUpdate(body, categoryColumns, [tenantId, id])
    const result = await db.query<AdminCategoryRow>(
        `UPDATE category SET ${assignments} WHERE tenant_id = $1 AND id = $2
         RETURNING id, tenant_id, parent_category_id, name, slug, description, image_key, display_order, status, created_at, updated_at`,
        values,
    )
    return result.rows[0]
}

export async function adminDeleteCategory(tenantId: number, id: number) {
    const result = await db.query('DELETE FROM category WHERE tenant_id = $1 AND id = $2', [
        tenantId,
        id,
    ])
    return result.rowCount ?? 0
}

export async function catalogListCategories(tenantId: number) {
    const result = await db.query<CatalogCategoryRow>(
        `SELECT id,parent_category_id,name,slug,description,image_key,display_order
         FROM category WHERE tenant_id = $1 AND status = 'ACTIVE' ORDER BY display_order,name,id`,
        [tenantId],
    )
    return result.rows
}

export async function catalogGetCategory(tenantId: number, id: number) {
    const result = await db.query<CatalogCategoryRow>(
        `SELECT id,parent_category_id,name,slug,description,image_key,display_order
         FROM category WHERE tenant_id = $1 AND id = $2 AND status = 'ACTIVE'`,
        [tenantId, id],
    )
    return result.rows[0]
}
