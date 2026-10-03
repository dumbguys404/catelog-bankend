-- Tenant users authenticate after the hostname resolves their tenant, so the
-- same email may safely exist in different tenants. Platform administrator
-- emails remain globally unique among platform administrators.
DROP INDEX uk_app_user_email;

CREATE UNIQUE INDEX uk_app_user_tenant_email
    ON app_user (tenant_id, LOWER(email))
    WHERE user_type = 'TENANT_USER';

CREATE UNIQUE INDEX uk_app_user_platform_email
    ON app_user (LOWER(email))
    WHERE user_type = 'PLATFORM_ADMIN';
