# Catalog backend

Node.js 24, Fastify, TypeScript, and PostgreSQL. Tenant routing data is loaded from the `tenant` table before the server listens. Active tenants resolve through an in-process registry. The tenant `code` maps to `<code>.<TENANT_BASE_DOMAIN>`, and the optional `tenant.domain` maps to that exact custom hostname. The platform hostname is reserved.

Copy `.env.example` to `.env` and set the database URL, tenant base domain, platform host, and platform Basic Auth credentials. Run migrations with `npm run db:migrate`, then start with `npm run dev` or `npm run build && npm start`.

The tenant table and user table are real. The existing platform tenant create/update/delete endpoints remain dummy and do not write to PostgreSQL or reload the registry. The platform tenant list/detail endpoints also still return scaffold data. For an existing tenant ID, a platform admin can create the first tenant user through `POST /api/admin/users` with `X-Platform-Tenant-Id`. A tenant inserted directly into PostgreSQL requires an application restart or a call to `TenantRegistry.reload()` from future persistence code to become routable.

Tenant Basic Auth uses the user's **email** as the username. The user schema has no separate username column. Passwords are stored as bcrypt hashes; plaintext passwords and hashes are not returned by the API. The platform administrator continues to use separate environment-based Basic Auth. No token, session, or server-side logout exists. The frontend logs out by clearing its Basic Auth credentials.

## Requests

Replace hosts, IDs, and credentials with configured values. A custom domain works only when the exact hostname is stored in `tenant.domain`.

```bash
curl -H 'Host: royal-fashion.ourdomain.com' http://localhost:3000/api/catalog/tenant
curl -H 'Host: www.royalfashion.com' http://localhost:3000/api/catalog/tenant
curl -H 'Host: royal-fashion.ourdomain.com' -u 'admin@example.com:password' http://localhost:3000/api/auth/me
curl -H 'Host: royal-fashion.ourdomain.com' -u 'admin@example.com:password' http://localhost:3000/api/admin/users
curl -H 'Host: royal-fashion.ourdomain.com' http://localhost:3000/api/admin/users
curl -H 'Host: platform.ourdomain.com' -u 'platform-admin:platform-password' http://localhost:3000/api/platform/tenants
curl -H 'Host: platform.ourdomain.com' -H 'X-Platform-Tenant-Id: 12' -u 'platform-admin:platform-password' http://localhost:3000/api/admin/users
```

The request without credentials returns 401. To create a tenant user, send `email`, `password`, and `role` (`OWNER`, `ADMIN`, or `EDITOR`) to `POST /api/admin/users`; `firstName` and `lastName` are optional. `tenantId` is rejected. OWNER and ADMIN can manage users; EDITOR can authenticate but cannot access admin routes. `GET /api/auth/me` validates tenant credentials without issuing a token.

The schema allows one custom domain per tenant. Tenant-user emails are unique within each tenant, so the same email can belong to different tenants and is authenticated against the tenant resolved from the hostname. Platform-administrator emails remain globally unique among platform administrators. Catalog, product, category, brand, collection, and image routes remain scaffolding with dummy responses and no tenant-owned database queries. The in-process registry does not synchronize across multiple backend instances. Failed reloads preserve the previous snapshot.

## Verification

Run `npm test`, `npm run typecheck`, and `npm run build`. With a local migrated PostgreSQL container and `.env` configured, run `node --env-file=.env --import tsx test/runtime-smoke.mjs` for a temporary live HTTP and database smoke test. The script creates two tenant fixtures and removes them in `finally`.
