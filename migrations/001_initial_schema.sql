-- ============================================================
-- MULTI-TENANT PRODUCT CATALOG - MVP DATABASE SCHEMA
-- PostgreSQL
--
-- Includes:
--   1. tenant
--   2. app_user
--   3. category
--   4. brand
--   5. product
--   6. product_image
--   7. product_category
--   8. collection
--   9. collection_product
--  10. updated_at trigger function + triggers
--
-- Notes:
-- - Normal tenant users belong to exactly one tenant.
-- - PLATFORM_ADMIN has tenant_id = NULL and can select a tenant in the app.
-- - Category supports unlimited hierarchy using parent_category_id.
-- - Products can belong to multiple categories using product_category.
-- - Products can have one primary image and many additional images.
-- - Collections handle NEW_ARRIVAL, TRENDING, FESTIVAL, FEATURED.
-- - Tenant context must come from authenticated user/admin context, not request tenant_id.
-- - Prefer mapping products to leaf categories; product_category permits multiple leaves.
-- - Service layer must prevent longer category cycles (A -> B -> A).
-- ============================================================


-- ============================================================
-- 1. TENANT
-- One row = one client/business/shop account.
-- ============================================================

CREATE TABLE tenant (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    code            VARCHAR(50) NOT NULL,
    name            VARCHAR(150) NOT NULL,

    domain          VARCHAR(255),

    status          VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uk_tenant_code
        UNIQUE (code),

    CONSTRAINT chk_tenant_status
        CHECK (
            status IN (
                'ACTIVE',
                'SUSPENDED',
                'INACTIVE'
            )
        )
);

CREATE UNIQUE INDEX uk_tenant_domain
    ON tenant(LOWER(domain))
    WHERE domain IS NOT NULL;


-- ============================================================
-- 2. APP USER
--
-- TENANT_USER:
--   - must belong to exactly one tenant
--   - has OWNER / ADMIN / EDITOR role
--
-- PLATFORM_ADMIN:
--   - tenant_id must be NULL
--   - can access/select any tenant through application logic
-- ============================================================

CREATE TABLE app_user (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    tenant_id           BIGINT,

    email               VARCHAR(255) NOT NULL,
    password_hash       VARCHAR(255) NOT NULL,

    first_name          VARCHAR(100),
    last_name           VARCHAR(100),
    phone               VARCHAR(30),

    user_type           VARCHAR(30) NOT NULL,
    tenant_role         VARCHAR(30),

    status              VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',

    last_login_at       TIMESTAMPTZ,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_app_user_tenant
        FOREIGN KEY (tenant_id)
        REFERENCES tenant(id),

    CONSTRAINT chk_app_user_type
        CHECK (
            user_type IN (
                'PLATFORM_ADMIN',
                'TENANT_USER'
            )
        ),

    CONSTRAINT chk_app_user_tenant_role
        CHECK (
            tenant_role IS NULL
            OR tenant_role IN (
                'OWNER',
                'ADMIN',
                'EDITOR'
            )
        ),

    CONSTRAINT chk_app_user_status
        CHECK (
            status IN (
                'ACTIVE',
                'LOCKED',
                'DISABLED'
            )
        ),

    CONSTRAINT chk_app_user_tenant_mapping
        CHECK (
            (
                user_type = 'PLATFORM_ADMIN'
                AND tenant_id IS NULL
                AND tenant_role IS NULL
            )
            OR
            (
                user_type = 'TENANT_USER'
                AND tenant_id IS NOT NULL
                AND tenant_role IS NOT NULL
            )
        )
);

CREATE INDEX idx_app_user_tenant
    ON app_user(tenant_id);

-- Login emails are unique regardless of letter case.
-- Example: Owner@shop.com and owner@shop.com are treated as the same login.
CREATE UNIQUE INDEX uk_app_user_email
    ON app_user(LOWER(email));


-- ============================================================
-- 3. CATEGORY
--
-- Supports unlimited hierarchy:
--
-- Women
--   -> Traditional
--      -> Sarees
--         -> Silk Sarees
--
-- A child category is forced to belong to the same tenant
-- as its parent category.
-- ============================================================

CREATE TABLE category (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    tenant_id           BIGINT NOT NULL,
    parent_category_id  BIGINT,

    name                VARCHAR(150) NOT NULL,
    slug                VARCHAR(160) NOT NULL,

    description         TEXT,

    image_key           VARCHAR(500),

    display_order       INTEGER NOT NULL DEFAULT 0,

    status              VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_category_tenant
        FOREIGN KEY (tenant_id)
        REFERENCES tenant(id),

    -- Required so other tables can use tenant-safe composite FKs.
    CONSTRAINT uk_category_tenant_id_id
        UNIQUE (tenant_id, id),

    CONSTRAINT fk_category_parent
        FOREIGN KEY (
            tenant_id,
            parent_category_id
        )
        REFERENCES category(
            tenant_id,
            id
        ),

    CONSTRAINT chk_category_not_self_parent
        CHECK (
            parent_category_id IS NULL
            OR parent_category_id <> id
        ),

    CONSTRAINT chk_category_status
        CHECK (
            status IN (
                'ACTIVE',
                'INACTIVE'
            )
        ),

    CONSTRAINT chk_category_display_order
        CHECK (display_order >= 0)
);

-- Root category slugs must be unique inside one tenant.
CREATE UNIQUE INDEX uk_category_root_slug
    ON category(tenant_id, slug)
    WHERE parent_category_id IS NULL;

-- Child category slugs only need to be unique under the same parent.
CREATE UNIQUE INDEX uk_category_child_slug
    ON category(
        tenant_id,
        parent_category_id,
        slug
    )
    WHERE parent_category_id IS NOT NULL;

CREATE INDEX idx_category_tenant_parent
    ON category(
        tenant_id,
        parent_category_id
    );

CREATE INDEX idx_category_tenant_status
    ON category(
        tenant_id,
        status
    );

CREATE INDEX idx_category_tenant_display_order
    ON category(
        tenant_id,
        display_order
    );


-- ============================================================
-- 4. BRAND
--
-- Brand remains independent from category.
-- Brand -> Product -> Product Category is used to determine
-- which categories are available under a brand.
-- ============================================================

CREATE TABLE brand (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    tenant_id       BIGINT NOT NULL,

    name            VARCHAR(150) NOT NULL,
    slug            VARCHAR(160) NOT NULL,

    description     TEXT,

    logo_key        VARCHAR(500),
    website_url     VARCHAR(500),

    display_order   INTEGER NOT NULL DEFAULT 0,

    status          VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_brand_tenant
        FOREIGN KEY (tenant_id)
        REFERENCES tenant(id),

    CONSTRAINT uk_brand_tenant_slug
        UNIQUE (
            tenant_id,
            slug
        ),

    -- Required for tenant-safe product -> brand FK.
    CONSTRAINT uk_brand_tenant_id_id
        UNIQUE (
            tenant_id,
            id
        ),

    CONSTRAINT chk_brand_status
        CHECK (
            status IN (
                'ACTIVE',
                'INACTIVE'
            )
        ),

    CONSTRAINT chk_brand_display_order
        CHECK (display_order >= 0)
);

CREATE INDEX idx_brand_tenant_status
    ON brand(
        tenant_id,
        status
    );

CREATE INDEX idx_brand_tenant_display_order
    ON brand(
        tenant_id,
        display_order
    );


-- ============================================================
-- 5. PRODUCT
--
-- A product:
-- - belongs to one tenant
-- - can optionally belong to one brand
-- - can belong to multiple categories through product_category
-- - can have multiple images through product_image
-- - featured/new/trending/festival membership is handled by collections
-- ============================================================

CREATE TABLE product (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    tenant_id           BIGINT NOT NULL,
    brand_id            BIGINT,

    name                VARCHAR(200) NOT NULL,
    slug                VARCHAR(220) NOT NULL,

    short_description   VARCHAR(500),
    description         TEXT,

    price               NUMERIC(12,2),
    mrp                 NUMERIC(12,2),

    availability        VARCHAR(30) NOT NULL DEFAULT 'AVAILABLE',

    status              VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',

    display_order       INTEGER NOT NULL DEFAULT 0,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_product_tenant
        FOREIGN KEY (tenant_id)
        REFERENCES tenant(id),

    -- Guarantees product and brand belong to the same tenant.
    CONSTRAINT fk_product_brand
        FOREIGN KEY (
            tenant_id,
            brand_id
        )
        REFERENCES brand(
            tenant_id,
            id
        ),

    -- Required for tenant-safe references from images/categories/collections.
    CONSTRAINT uk_product_tenant_id_id
        UNIQUE (
            tenant_id,
            id
        ),

    CONSTRAINT uk_product_tenant_slug
        UNIQUE (
            tenant_id,
            slug
        ),

    CONSTRAINT chk_product_availability
        CHECK (
            availability IN (
                'AVAILABLE',
                'LIMITED',
                'OUT_OF_STOCK',
                'COMING_SOON'
            )
        ),

    CONSTRAINT chk_product_status
        CHECK (
            status IN (
                'ACTIVE',
                'INACTIVE'
            )
        ),

    CONSTRAINT chk_product_price
        CHECK (
            price IS NULL
            OR price >= 0
        ),

    CONSTRAINT chk_product_mrp
        CHECK (
            mrp IS NULL
            OR mrp >= 0
        ),

    CONSTRAINT chk_product_display_order
        CHECK (display_order >= 0)
);

CREATE INDEX idx_product_tenant_status
    ON product(
        tenant_id,
        status
    );

CREATE INDEX idx_product_tenant_brand
    ON product(
        tenant_id,
        brand_id
    );

CREATE INDEX idx_product_tenant_display_order
    ON product(
        tenant_id,
        display_order
    );


-- ============================================================
-- 6. PRODUCT IMAGE
--
-- One product can have many images.
-- Maximum one image can be marked as primary.
--
-- Store only the object/storage key, not a full CDN URL.
-- Example:
-- tenant/1/products/100/front.webp
-- ============================================================

CREATE TABLE product_image (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    tenant_id           BIGINT NOT NULL,
    product_id          BIGINT NOT NULL,

    object_key          VARCHAR(500) NOT NULL,

    alt_text            VARCHAR(255),

    is_primary          BOOLEAN NOT NULL DEFAULT FALSE,

    display_order       INTEGER NOT NULL DEFAULT 0,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_product_image_product
        FOREIGN KEY (
            tenant_id,
            product_id
        )
        REFERENCES product(
            tenant_id,
            id
        )
        ON DELETE CASCADE,

    CONSTRAINT chk_product_image_display_order
        CHECK (
            display_order >= 0
        )
);

-- PostgreSQL partial unique index:
-- only one primary image per product.
CREATE UNIQUE INDEX uk_product_one_primary_image
    ON product_image(
        tenant_id,
        product_id
    )
    WHERE is_primary = TRUE;

CREATE INDEX idx_product_image_product_order
    ON product_image(
        tenant_id,
        product_id,
        display_order
    );


-- ============================================================
-- 7. PRODUCT CATEGORY
--
-- Many-to-many relation.
--
-- One product can belong to multiple leaf categories.
-- Example:
-- Product 100 -> Silk Sarees
-- Product 100 -> Bridal Sarees
--
-- The product itself is stored only once.
-- ============================================================

CREATE TABLE product_category (
    tenant_id           BIGINT NOT NULL,
    product_id          BIGINT NOT NULL,
    category_id         BIGINT NOT NULL,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT pk_product_category
        PRIMARY KEY (
            tenant_id,
            product_id,
            category_id
        ),

    -- Guarantees product belongs to the same tenant.
    CONSTRAINT fk_product_category_product
        FOREIGN KEY (
            tenant_id,
            product_id
        )
        REFERENCES product(
            tenant_id,
            id
        )
        ON DELETE CASCADE,

    -- Guarantees category belongs to the same tenant.
    CONSTRAINT fk_product_category_category
        FOREIGN KEY (
            tenant_id,
            category_id
        )
        REFERENCES category(
            tenant_id,
            id
        )
        ON DELETE CASCADE
);

-- Helps category -> products queries.
CREATE INDEX idx_product_category_category
    ON product_category(
        tenant_id,
        category_id,
        product_id
    );


-- ============================================================
-- 8. COLLECTION
--
-- One generic feature handles:
-- - NEW_ARRIVAL
-- - TRENDING
-- - FESTIVAL (Onam / Diwali / etc.)
-- - FEATURED
--
-- Festival name is stored in 'name'.
-- Example:
-- name = 'Onam Collection 2026'
-- collection_type = 'FESTIVAL'
-- ============================================================

CREATE TABLE collection (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    tenant_id       BIGINT NOT NULL,

    name            VARCHAR(150) NOT NULL,
    slug            VARCHAR(160) NOT NULL,

    collection_type VARCHAR(30) NOT NULL,

    description     TEXT,

    image_key       VARCHAR(500),

    start_at        TIMESTAMPTZ,
    end_at          TIMESTAMPTZ,

    display_order   INTEGER NOT NULL DEFAULT 0,

    status          VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_collection_tenant
        FOREIGN KEY (tenant_id)
        REFERENCES tenant(id),

    -- Required for tenant-safe collection_product FK.
    CONSTRAINT uk_collection_tenant_id_id
        UNIQUE (
            tenant_id,
            id
        ),

    CONSTRAINT uk_collection_tenant_slug
        UNIQUE (
            tenant_id,
            slug
        ),

    CONSTRAINT chk_collection_type
        CHECK (
            collection_type IN (
                'NEW_ARRIVAL',
                'TRENDING',
                'FESTIVAL',
                'FEATURED'
            )
        ),

    CONSTRAINT chk_collection_status
        CHECK (
            status IN (
                'ACTIVE',
                'INACTIVE'
            )
        ),

    CONSTRAINT chk_collection_display_order
        CHECK (
            display_order >= 0
        ),

    CONSTRAINT chk_collection_dates
        CHECK (
            start_at IS NULL
            OR end_at IS NULL
            OR end_at >= start_at
        )
);

CREATE INDEX idx_collection_tenant_type
    ON collection(
        tenant_id,
        collection_type
    );

CREATE INDEX idx_collection_tenant_status
    ON collection(
        tenant_id,
        status
    );

CREATE INDEX idx_collection_tenant_display_order
    ON collection(
        tenant_id,
        display_order
    );


-- ============================================================
-- 9. COLLECTION PRODUCT
--
-- Many-to-many relation.
--
-- A product can simultaneously be:
-- - New Arrival
-- - Trending
-- - Festival
-- - Featured
--
-- display_order controls product ordering inside a collection.
-- ============================================================

CREATE TABLE collection_product (
    tenant_id       BIGINT NOT NULL,
    collection_id   BIGINT NOT NULL,
    product_id      BIGINT NOT NULL,

    display_order   INTEGER NOT NULL DEFAULT 0,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT pk_collection_product
        PRIMARY KEY (
            tenant_id,
            collection_id,
            product_id
        ),

    CONSTRAINT fk_collection_product_collection
        FOREIGN KEY (
            tenant_id,
            collection_id
        )
        REFERENCES collection(
            tenant_id,
            id
        )
        ON DELETE CASCADE,

    CONSTRAINT fk_collection_product_product
        FOREIGN KEY (
            tenant_id,
            product_id
        )
        REFERENCES product(
            tenant_id,
            id
        )
        ON DELETE CASCADE,

    CONSTRAINT chk_collection_product_display_order
        CHECK (
            display_order >= 0
        )
);

CREATE INDEX idx_collection_product_collection
    ON collection_product(
        tenant_id,
        collection_id,
        display_order
    );

CREATE INDEX idx_collection_product_product
    ON collection_product(
        tenant_id,
        product_id
    );


-- ============================================================
-- 10. AUTOMATIC updated_at HANDLING
--
-- Any UPDATE on these tables automatically refreshes updated_at.
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


CREATE TRIGGER trg_tenant_updated_at
BEFORE UPDATE ON tenant
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();


CREATE TRIGGER trg_app_user_updated_at
BEFORE UPDATE ON app_user
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();


CREATE TRIGGER trg_category_updated_at
BEFORE UPDATE ON category
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();


CREATE TRIGGER trg_brand_updated_at
BEFORE UPDATE ON brand
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();


CREATE TRIGGER trg_product_updated_at
BEFORE UPDATE ON product
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();


CREATE TRIGGER trg_collection_updated_at
BEFORE UPDATE ON collection
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- END OF MVP SCHEMA
-- ============================================================