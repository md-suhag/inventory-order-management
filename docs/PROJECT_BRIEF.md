# Project Brief (original, verbatim)

> This is the owner's original project brief, preserved unchanged as the root source of requirements and working rules.
> Decisions made later (Phase 1 review, 2026-11-08) override parts of it — see **AGENTS.md §4** and
> `docs/architecture/TECHNICAL_DECISIONS.md`. Notable overrides: stable dependency versions (not latest),
> bcrypt for password hashing, Next.js native data fetching (no TanStack Query), hand-written OpenAPI,
> custom list query builder, commit after each completed task.

---

# Project: Mini Inventory & Order Management System

Act as a Senior Full-Stack Software Engineer, Backend Architect, Database Designer, and Technical Lead.

Your responsibility is to design, implement, test, document, and prepare a production-ready Mini Inventory & Order Management System.

This is a real portfolio-grade software project. Build it with professional engineering standards, realistic business logic, maintainable architecture, and practical features that demonstrate real-world development experience.

## 1. Project Execution Philosophy

This is primarily an implementation-focused project, not a tutorial.

My approximate preference:

- 70–80% actual implementation and problem-solving.
- 20–30% technical explanations, architectural decisions, and learning.

Follow these rules:

1. I already have practical experience with JavaScript, TypeScript, Node.js, Express.js, React, Next.js, MongoDB, REST APIs, authentication, and deployment.
2. Do not explain basic programming concepts or technologies I already know.
3. Do not turn every implementation step into a tutorial.
4. Work independently on implementation tasks without asking for approval after every small change.
5. Explain important architectural and technical decisions briefly, especially when there are multiple valid approaches.
6. Ask for clarification only when a business requirement is genuinely ambiguous or a decision could significantly affect the architecture.
7. Do not introduce unnecessary abstractions, design patterns, libraries, or infrastructure.
8. Prefer simple, modular, maintainable solutions over overengineering.
9. Do not create placeholder implementations for features that are expected to work.
10. Do not claim a feature is complete unless it is implemented and appropriately tested.

Use major checkpoints for review and approval, especially for requirements, database design, architecture, and critical business workflows.

## 2. Product Overview

Build a Mini Inventory & Order Management System for a small or medium-sized business.

The system should allow business owners and employees to:

- Manage products and categories.
- Manage customers and suppliers.
- Record purchases from suppliers.
- Track inventory and stock movements.
- Create and manage customer orders.
- Record payments and outstanding balances.
- Process sales returns.
- Monitor business activities through dashboards.
- Generate useful business reports.
- Control access through role-based permissions.

The application should demonstrate how a real inventory and order management system works.

### Main user roles

Implement these roles:

**Admin**
- Full system access.
- Manage users and roles.
- Manage business settings.
- Access all modules and reports.
- View audit logs.

**Manager**
- Manage products, suppliers, customers, purchases, and orders.
- Manage inventory operations.
- Access business reports.
- Cannot perform restricted administrative operations.

**Staff**
- Access permitted operational features.
- Create and process orders.
- View products and stock.
- Manage customers where permitted.
- Cannot access administrative settings or restricted reports.

Implement permission checks on the backend. Hiding frontend UI elements is not sufficient authorization.

## 3. Technology Stack

Use the following stack unless a genuine technical limitation requires a documented change.

### Backend
- Node.js
- Express.js
- TypeScript
- PostgreSQL
- Prisma ORM
- Zod for request validation
- REST API architecture

### Frontend
- Next.js
- React
- TypeScript
- Tailwind CSS
- shadcn/ui

### Testing
- Vitest
- Supertest
- Playwright for important end-to-end workflows

### Infrastructure and Tools
- Docker
- Docker Compose
- Git
- GitHub Actions
- Swagger UI / OpenAPI

Use stable, compatible package versions. Avoid unnecessary dependencies.

## 4. Complete Functional Requirements

Implement the following modules with their relevant operations, validations, business logic, and user interfaces.

### Module 1: Authentication & Account Management

Features:

- User registration (only if enabled by the business configuration; otherwise admin-created accounts).
- Login and logout.
- Access token and refresh token management.
- Secure password hashing.
- Refresh token rotation and revocation.
- Forgot password and password reset.
- Authenticated user profile.
- Update profile information.
- Change password.
- Account activation/deactivation.
- Protected frontend routes.
- Backend authentication middleware.

Security requirements:

- Never store plain-text passwords.
- Validate all authentication inputs.
- Implement secure cookie/token handling appropriate to the chosen authentication architecture.
- Protect against brute-force login attempts.
- Revoke relevant sessions when necessary.
- Never expose sensitive user information in API responses.

### Module 2: User Management & RBAC

Features:

- Create users.
- Update user information.
- Activate/deactivate users.
- Assign roles.
- View users with pagination and search.
- Enforce role-based permissions.
- Prevent unauthorized role changes.
- Prevent accidental removal or deactivation of the last active administrator.

Use centralized authorization logic.

### Module 3: Dashboard

Provide a useful business dashboard containing:

- Total products.
- Total customers.
- Total suppliers.
- Total orders.
- Total purchase value.
- Total sales.
- Estimated profit.
- Current inventory value.
- Low-stock product count.
- Pending orders.
- Outstanding customer payments.
- Recent orders.
- Recent purchases.
- Low-stock alerts.
- Sales overview with date-based filtering.

Dashboard calculations must be based on actual database records, not hardcoded values.

Define the financial calculations and their limitations clearly.

### Module 4: Product Management

Features:

- Create product.
- Update product.
- View product details.
- Delete or archive product.
- List products with pagination.
- Search by name, SKU, or barcode.
- Filter by category and status.
- Upload product images.
- Assign category.
- Define SKU.
- Define barcode field.
- Define product description.
- Define unit of measurement.
- Define cost price.
- Define selling price.
- Define minimum stock threshold.
- Track active/inactive status.

Validations:

- SKU must be unique within the business.
- Barcode uniqueness should be enforced when provided.
- Prices and quantities must be valid non-negative values.
- Prevent deletion of products referenced by historical transactions; use archive/deactivation where appropriate.
- Do not allow product updates to modify historical order or purchase records.

### Module 5: Product Category Management

Features:

- Create category.
- Update category.
- Delete or archive category.
- List categories.
- Search categories.
- Prevent invalid category references.
- Handle products associated with a category safely.

### Module 6: Supplier Management

Features:

- Create supplier.
- Update supplier.
- View supplier details.
- Archive supplier.
- Search and paginate suppliers.
- Store supplier name, contact person, phone, email, address, and notes.
- View supplier purchase history.
- View supplier-related purchase information.
- Track outstanding supplier balances if supported by the purchase/payment workflow.

### Module 7: Customer Management

Features:

- Create customer.
- Update customer.
- View customer details.
- Archive customer.
- Search and paginate customers.
- Store customer name, phone, email, address, and notes.
- View customer order history.
- View payment history.
- View outstanding customer balances.

Support a walk-in customer for orders where appropriate.

### Module 8: Purchase Management

This module handles purchasing inventory from suppliers.

Features:

- Create purchase.
- Select supplier.
- Add multiple products to a purchase.
- Set product quantities.
- Set purchase unit prices.
- Calculate subtotal and total.
- Apply discounts and taxes where configured.
- Add notes.
- Save purchase as draft.
- Confirm purchase.
- Receive purchased stock.
- View purchase details.
- List and filter purchases.
- Track purchase status.
- Record supplier payments.
- View purchase payment history.

Purchase statuses should be clearly defined, for example:

- DRAFT
- ORDERED
- PARTIALLY_RECEIVED
- RECEIVED
- CANCELLED

Business rules:

- Creating a draft purchase must not increase inventory.
- Confirming a purchase must not automatically increase physical stock.
- Stock increases only when goods are actually received.
- Support partial receiving if included in the final design.
- Prevent receiving more than the remaining purchase quantity.
- Each stock receipt must create an inventory movement.
- Repeated receive requests must not duplicate stock.
- Historical purchase prices must remain unchanged.
- Cancelled or received purchases must follow controlled transition rules.

### Module 9: Inventory Management

This is one of the most important modules.

Features:

- View current stock for each product.
- View inventory overview.
- Search and filter inventory.
- View low-stock products.
- View out-of-stock products.
- Manually adjust stock with a reason.
- View stock movement history.
- View movement details.
- Filter movements by product, type, date, and reference.
- View opening stock where applicable.

Inventory movement types should include:

- PURCHASE_RECEIPT
- SALE
- SALE_RETURN
- ADJUSTMENT_IN
- ADJUSTMENT_OUT

Each movement should contain relevant information:

- Product.
- Movement type.
- Quantity.
- Previous stock.
- Resulting stock.
- Reference transaction.
- Reason or notes.
- User who performed the operation.
- Timestamp.

Critical rules:

- Every physical stock change must have an immutable movement record.
- Do not allow arbitrary direct stock updates that bypass inventory history.
- Prevent negative stock unless explicitly supported by business configuration.
- Manual adjustments must require a reason.
- Inventory movements must be created in the same database transaction as the corresponding stock update.
- Historical movements must not be silently edited or deleted.

### Module 10: Order Management

This module handles customer sales.

Features:

- Create customer order.
- Select customer or walk-in customer.
- Add multiple products.
- Set product quantities.
- Retrieve current product selling prices.
- Support line-item discounts where permitted.
- Support order-level discounts where permitted.
- Calculate subtotal.
- Calculate tax if configured.
- Calculate final total.
- Add notes.
- Save order as draft.
- Confirm order.
- View order details.
- List and search orders.
- Filter by date, customer, and status.
- Cancel order.
- Complete order.
- Generate a printable invoice.

Order statuses should be explicitly defined, for example:

- DRAFT
- CONFIRMED
- COMPLETED
- CANCELLED

Define the stock reservation/deduction strategy before implementation.

For the initial MVP, prefer a straightforward approach:

- Draft orders do not affect physical stock.
- Confirming an order validates and deducts stock atomically.
- Cancelling a confirmed order restores the deducted quantity exactly once.
- Completing an order does not deduct stock again.

Business rules:

- Never allow overselling.
- Validate stock availability at confirmation time, not only when the order is drafted.
- Preserve the product name, SKU, unit price, discount, and tax snapshot in each order item.
- Later product price changes must not affect historical orders.
- A cancellation must not restore stock more than once.
- All stock changes must generate inventory movements.
- Use database transactions and appropriate concurrency control.

### Module 11: Payment Management

Support recording payments against customer orders and supplier purchases.

Features:

- Record payment.
- Support cash, bank transfer, and other configurable payment methods.
- Support full payment.
- Support partial payment.
- View payment history.
- View payment details.
- Track paid amount.
- Track due amount.
- Track payment status.
- Record payment reference and notes.
- Handle payment reversal or refund through controlled operations.

Payment statuses:

- UNPAID
- PARTIALLY_PAID
- PAID
- REFUNDED
- PARTIALLY_REFUNDED

Keep payment status separate from order or purchase status.

Business rules:

- Validate payment amount against the remaining payable balance.
- Prevent duplicate payment records on retried requests.
- Never allow accidental overpayment unless explicitly supported.
- Use immutable financial records and controlled reversal operations.
- Store who recorded the payment and when.
- Calculate outstanding balances from reliable transaction records.

For the MVP, implement payment recording rather than integrating a live payment gateway.

### Module 12: Sales Returns

Features:

- Initiate a return against an existing completed or eligible order.
- Select returned order items.
- Specify returned quantities.
- Validate that returned quantities do not exceed purchased quantities minus previous returns.
- Calculate refundable amounts.
- Record return reason.
- Approve or process a return according to role permissions.
- Record refund information.
- View return history.

Business rules:

- Returned stock should be restored only when the returned goods are considered resalable.
- Non-resalable items must not increase available stock.
- Every stock restoration must create a SALE_RETURN inventory movement.
- Prevent duplicate returns for the same quantity.
- Keep original order and payment history intact.
- Handle partial returns correctly.

### Module 13: Reports & Analytics

Provide practical reports:

**Sales Reports**
- Daily sales.
- Weekly sales.
- Monthly sales.
- Custom date range.
- Sales by product.
- Sales by customer.
- Sales by order status.

**Purchase Reports**
- Purchase history.
- Purchases by supplier.
- Purchase totals by date range.

**Inventory Reports**
- Current stock.
- Low-stock products.
- Out-of-stock products.
- Inventory movement history.
- Inventory valuation.

**Financial Reports**
- Sales revenue.
- Purchase cost.
- Estimated gross profit.
- Outstanding customer balances.
- Outstanding supplier balances.
- Payment summaries.

Requirements:

- Support date-range filters.
- Support pagination where needed.
- Use efficient database queries.
- Clearly define the formula used for each financial metric.
- Do not label revenue as profit.
- Do not present estimated gross profit as audited net profit.
- Do not double-count returns, discounts, or payments.

### Module 14: Audit Logs

Track important system operations:

- User creation and updates.
- Role and permission changes.
- Product changes.
- Purchase creation and receiving.
- Order creation, confirmation, and cancellation.
- Payment recording and reversal.
- Inventory adjustments.
- Sales returns.
- Business setting changes.

Each audit record should include:

- Actor/user.
- Action.
- Entity type.
- Entity ID.
- Relevant metadata.
- Timestamp.

Audit records should be protected from ordinary user modification or deletion.

### Module 15: Business Settings

Features:

- Business name.
- Business address.
- Contact information.
- Currency.
- Timezone.
- Tax configuration.
- Default invoice settings.
- Default low-stock behavior.
- Payment method configuration.

Use a configurable currency and timezone. Avoid hardcoding Bangladesh-specific currency or formatting into business logic.

## 5. Non-Functional Requirements

Implement the application with these quality standards:

### Maintainability
- Modular architecture.
- Clear separation of responsibilities.
- Reusable components and utilities.
- Consistent naming conventions.
- No unnecessary code duplication.
- Avoid oversized controllers and service classes.

### Performance
- Database indexes for frequently queried fields.
- Pagination for list endpoints.
- Efficient filtering and sorting.
- Avoid unnecessary database queries.
- Avoid N+1 query problems.
- Use database aggregation where appropriate.

### Security
- Authentication and authorization.
- Input validation.
- Secure password hashing.
- Rate limiting for sensitive endpoints.
- Safe error responses.
- CORS configuration.
- Security headers.
- SQL injection protection through safe ORM usage.
- File upload validation.
- Secrets through environment variables.
- No sensitive data in logs.
- Validate permissions at the backend.

### Reliability
- Database transactions for critical workflows.
- Concurrency-safe inventory updates.
- Idempotency for critical operations.
- Consistent financial and inventory records.
- Centralized error handling.
- Structured logging.
- Graceful shutdown.
- Health-check endpoints.

## 6. Architecture & Backend Engineering

Use a modular monolith architecture.

Organize backend code by business domain rather than putting all logic into generic folders.

Suggested structure:

```text
backend/
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── src/
│   ├── config/
│   ├── common/
│   │   ├── errors/
│   │   ├── middleware/
│   │   ├── utils/
│   │   └── types/
│   ├── modules/
│   │   ├── auth/
│   │   ├── users/
│   │   ├── roles/
│   │   ├── dashboard/
│   │   ├── products/
│   │   ├── categories/
│   │   ├── suppliers/
│   │   ├── customers/
│   │   ├── purchases/
│   │   ├── inventory/
│   │   ├── orders/
│   │   ├── payments/
│   │   ├── returns/
│   │   ├── reports/
│   │   ├── audit-logs/
│   │   └── settings/
│   ├── app.ts
│   └── server.ts
├── tests/
├── Dockerfile
└── package.json
```

Adapt the structure when necessary, but maintain clear module boundaries.

For each backend module, separate responsibilities appropriately:

- Routes.
- Controllers.
- Services.
- Repositories or data-access layer where justified.
- Validation schemas.
- Types.
- Tests.

Do not create unnecessary abstractions just to follow a pattern.

## 7. Database Design & ERD

Design a normalized PostgreSQL relational database.

The database design must support the full feature scope and preserve transactional integrity.

Consider entities such as:

- Business
- User
- Role
- Permission
- RolePermission
- Category
- Product
- Supplier
- Customer
- Purchase
- PurchaseItem
- PurchaseReceipt
- PurchaseReceiptItem
- Order
- OrderItem
- Payment
- SalesReturn
- SalesReturnItem
- InventoryMovement
- AuditLog
- BusinessSetting
- RefreshToken

You may add, merge, or adjust entities based on sound database design. Do not blindly follow this list.

Requirements:

1. Define primary keys and foreign keys.
2. Define appropriate unique constraints.
3. Define indexes.
4. Define nullable and non-nullable fields.
5. Define appropriate PostgreSQL data types.
6. Use decimal/numeric types for financial amounts; do not use floating-point types for money.
7. Define relationships and cardinality.
8. Use appropriate deletion behavior.
9. Preserve historical transaction snapshots.
10. Consider database-level constraints where appropriate.
11. Avoid storing redundant data unless there is a clear consistency strategy.
12. Ensure the schema supports safe concurrent inventory operations.

### Professional editable ERD — mandatory

Do NOT use Mermaid as the primary ERD deliverable.

Create a professional, editable ERD using diagrams.net (draw.io).

Required files:

```text
docs/diagrams/
├── ERD.drawio
├── ERD.svg
└── ERD.png
```

The `.drawio` file must be the actual editable diagrams.net XML source, not an image embedded in a diagram.

ERD design requirements:

- Use proper Crow's Foot notation.
- Clearly show one-to-one, one-to-many, and many-to-many relationships.
- Display table names.
- Display important columns with PostgreSQL data types.
- Identify primary keys and foreign keys.
- Mark unique constraints where relevant.
- Group related entities logically.
- Use consistent spacing, alignment, typography, and visual hierarchy.
- Avoid overlapping tables and relationship lines.
- Keep the diagram readable at normal zoom.
- Use multiple diagrams if a single complete ERD becomes too crowded.

Create separate diagrams where appropriate, such as:

1. Core business and user management.
2. Product, supplier, and purchase management.
3. Orders, payments, and returns.
4. Inventory and audit history.

Also provide a complete database overview diagram if the detailed ERDs are split.

### ERD consistency

The diagrams must remain consistent with:

- Prisma schema.
- PostgreSQL migrations.
- Actual database relationships.
- API and business logic.

Whenever database structure changes, update the editable `.drawio` source and regenerate SVG/PNG exports.

Do not claim exports were generated unless the files actually exist and have been checked.

If diagrams.net CLI or another reliable export method is unavailable, preserve the valid editable source and document the exact export procedure.

## 8. API Design & Documentation

Design REST APIs before implementing the corresponding modules.

Use consistent:

- URL naming.
- HTTP methods.
- HTTP status codes.
- Request validation.
- Response structures.
- Pagination.
- Filtering.
- Sorting.
- Error handling.
- Authentication and authorization.

Example endpoint structure:

```text
/api/v1/auth
/api/v1/users
/api/v1/roles
/api/v1/dashboard
/api/v1/products
/api/v1/categories
/api/v1/suppliers
/api/v1/customers
/api/v1/purchases
/api/v1/inventory
/api/v1/orders
/api/v1/payments
/api/v1/returns
/api/v1/reports
/api/v1/audit-logs
/api/v1/settings
```

### Mandatory API documentation

Create:

```text
docs/api/
├── API_DESIGN.md
└── openapi.yaml
```

Requirements:

- Document all implemented endpoints.
- Include HTTP method and URL.
- Include authentication requirements.
- Include required permissions.
- Include request parameters and validation.
- Include request body examples.
- Include success response examples.
- Include error response examples.
- Document pagination and filtering.
- Document important business rules.
- Use OpenAPI 3.x.
- Integrate Swagger UI into the backend.

Keep documentation synchronized with actual implementation.

## 9. Frontend Requirements

Build a clean, professional, responsive business dashboard.

The UI should prioritize usability and operational workflows over decorative design.

Required screens:

- Login.
- Dashboard.
- Products list and product form.
- Categories list and form.
- Suppliers list and form.
- Customers list and form.
- Purchases list and purchase creation.
- Purchase details and receiving.
- Inventory overview.
- Inventory movement history.
- Orders list and order creation.
- Order details and invoice.
- Payment records.
- Sales returns.
- Reports.
- User management.
- Role management.
- Audit logs.
- Business settings.
- User profile.

Frontend requirements:

- Responsive layout.
- Consistent navigation.
- Sidebar dashboard layout.
- Reusable forms and tables.
- Loading states.
- Empty states.
- Error states.
- Confirmation dialogs for destructive actions.
- Form validation.
- Search, pagination, and filtering.
- Permission-aware navigation and UI.
- Accessible form controls.
- Clear success and error feedback.

Do not build fake dashboard data or non-functional buttons.

## 10. Critical Business Logic & Data Integrity

Treat these rules as high priority.

### Inventory consistency

- All inventory changes must go through controlled inventory operations.
- Each physical stock change must create a corresponding immutable inventory movement.
- Use database transactions.
- Use concurrency-safe stock deduction.
- Prevent negative stock by default.
- Do not rely on frontend stock validation.

### Order consistency

- Draft orders do not change stock.
- Confirmed orders deduct stock exactly once.
- Cancelled confirmed orders restore stock exactly once.
- Completing an order must not deduct stock again.
- Historical order prices must remain unchanged.

### Purchase consistency

- Draft or ordered purchases do not increase physical stock.
- Receiving goods increases stock.
- Partial receiving must update the remaining receivable quantity correctly.
- Repeated receiving requests must not duplicate stock.

### Payment consistency

- Payment records must be traceable.
- Payment and order status must remain separate.
- Validate payable balance inside a transaction.
- Use idempotency for payment recording.
- Reversals must preserve the original financial history.

### Returns consistency

- Prevent returning more quantity than originally purchased, accounting for prior returns.
- Restore inventory only for resalable items.
- Record refunds and stock movements separately.
- Prevent duplicate return processing.

### Concurrency

For operations that can be executed simultaneously:

- Use appropriate PostgreSQL transactions and locking or atomic conditional updates.
- Ensure stock cannot be deducted below the permitted quantity.
- Ensure payment balances cannot be exceeded by concurrent requests.
- Ensure repeated requests cannot create duplicate business operations.

Document the chosen strategy and test it.

## 11. Testing Requirements

Implement meaningful tests, not just tests that confirm an endpoint returns HTTP 200.

### Unit tests

Test:

- Business calculations.
- Order totals.
- Discount and tax calculations.
- Payment balance calculations.
- Purchase receiving logic.
- Inventory calculations.
- Return quantity validation.
- Role and permission checks.

### Integration tests

Test:

- Authentication.
- Product CRUD.
- Purchase receiving.
- Order confirmation.
- Order cancellation.
- Payment recording.
- Sales returns.
- Inventory movements.
- Unauthorized access.
- Invalid input handling.

### Critical scenario tests

Explicitly test:

1. Two concurrent orders attempting to purchase the last available stock.
2. Repeated order confirmation.
3. Repeated order cancellation.
4. Repeated purchase receiving.
5. Concurrent payments against the same outstanding balance.
6. Returning more quantity than permitted.
7. Unauthorized users attempting restricted operations.
8. Transaction rollback when part of a critical operation fails.

### End-to-end tests

Cover the most important user workflows:

- Login.
- Create product.
- Create supplier.
- Create purchase.
- Receive stock.
- Create customer order.
- Confirm order.
- Record payment.
- Complete order.
- Process return.
- Verify inventory and reports.

## 12. Production Readiness

Prepare the application for production deployment.

Requirements:

- Dockerfile for backend and frontend.
- Docker Compose for local development.
- Production Docker Compose configuration where appropriate.
- PostgreSQL configuration.
- Environment variable management.
- Environment validation.
- Database migrations.
- Database seeding.
- Health-check endpoint.
- Structured application logging.
- Centralized error handling.
- Graceful shutdown.
- Production build configuration.
- Security configuration.
- CI pipeline using GitHub Actions.
- README with setup and deployment instructions.
- Database backup and restore documentation.

Do not commit real secrets or production credentials.

Do not run destructive production database operations without explicit approval.

## 13. Documentation Structure

Maintain the following project documentation:

```text
docs/
├── requirements/
│   ├── PROJECT_OVERVIEW.md
│   ├── FUNCTIONAL_REQUIREMENTS.md
│   ├── NON_FUNCTIONAL_REQUIREMENTS.md
│   └── BUSINESS_RULES.md
├── architecture/
│   ├── SYSTEM_ARCHITECTURE.md
│   ├── TECHNICAL_DECISIONS.md
│   └── system-architecture.mmd
├── diagrams/
│   ├── ERD.drawio
│   ├── ERD.svg
│   ├── ERD.png
│   └── order-flow.mmd
├── database/
│   └── DATABASE_DESIGN.md
├── api/
│   ├── API_DESIGN.md
│   └── openapi.yaml
├── security/
│   └── SECURITY.md
├── testing/
│   └── TESTING_STRATEGY.md
└── deployment/
    └── DEPLOYMENT.md
```

Add or adjust documentation when necessary.

Mermaid is acceptable for architecture, sequence, or workflow diagrams. It is not a replacement for the editable Draw.io ERD.

Also maintain:

```text
PROJECT_PROGRESS.md
```

This file should track:

- Completed phases.
- Completed modules.
- Pending tasks.
- Known issues.
- Important technical decisions.
- Test status.
- Documentation status.

Update it as implementation progresses.

## 14. Implementation Phases

Follow these phases in order. You can adjust task ordering when there is a clear technical reason, but do not silently remove requirements.

### Phase 0: Project Inspection & Requirements

- Inspect the current repository.
- Identify existing files, dependencies, and setup.
- Understand existing conventions.
- Avoid overwriting useful existing work.
- Finalize functional requirements.
- Finalize non-functional requirements.
- Define business rules.
- Identify ambiguities and important assumptions.
- Prepare implementation milestones.

Deliverables:
- Project overview.
- Functional requirements.
- Non-functional requirements.
- Business rules.
- Project progress tracker.

### Phase 1: Architecture & Database Design

- Define system architecture.
- Define backend and frontend structure.
- Design PostgreSQL schema.
- Define relationships, constraints, and indexes.
- Define inventory and financial transaction strategies.
- Create professional editable Draw.io ERD.
- Generate SVG and PNG exports where supported.
- Prepare Prisma schema.
- Review the database design against all feature requirements.

Deliverables:
- System architecture documentation.
- Database design documentation.
- Prisma schema.
- Editable ERD source and exports.
- Technical decisions.

Stop for a major design review before implementing the core business workflows.

### Phase 2: Backend Foundation

- Initialize backend.
- Configure TypeScript and Express.
- Configure Prisma and PostgreSQL.
- Configure environment validation.
- Implement centralized error handling.
- Implement request validation.
- Implement logging.
- Implement authentication.
- Implement RBAC.
- Add health checks.
- Set up testing infrastructure.

### Phase 3: Core Business Modules

Implement:

- User management.
- Categories.
- Products.
- Suppliers.
- Customers.
- Dashboard foundation.

### Phase 4: Purchase & Inventory

Implement:

- Purchase management.
- Purchase receiving.
- Partial receiving if included.
- Inventory management.
- Inventory movement history.
- Stock adjustments.
- Low-stock reporting.

Test inventory consistency before moving forward.

### Phase 5: Orders & Payments

Implement:

- Order management.
- Order item snapshots.
- Stock deduction.
- Order cancellation and stock restoration.
- Payment recording.
- Partial payments.
- Outstanding balances.
- Invoice generation.

Test concurrency, idempotency, and transaction rollback.

### Phase 6: Returns, Reports & Audit

Implement:

- Sales returns.
- Refund records.
- Inventory restoration.
- Sales reports.
- Purchase reports.
- Inventory reports.
- Financial summaries.
- Audit logs.
- Business settings.

### Phase 7: Frontend Implementation

Implement the dashboard and all required screens.

Connect the frontend to real backend APIs.

Ensure that forms, tables, filters, permissions, and workflows function correctly.

### Phase 8: Testing & Hardening

- Complete unit tests.
- Complete integration tests.
- Complete critical scenario tests.
- Complete important end-to-end tests.
- Fix identified bugs.
- Review security.
- Review database performance.
- Review business logic consistency.

### Phase 9: Deployment Preparation

- Complete Docker configuration.
- Complete CI pipeline.
- Verify production builds.
- Verify migrations and seed process.
- Document environment variables.
- Document backup and restore.
- Prepare deployment instructions.

### Phase 10: Final Review

Perform a final review of:

- Functional requirements coverage.
- Backend architecture.
- Frontend quality.
- Database design.
- ERD consistency.
- API documentation.
- Security.
- Tests.
- Deployment readiness.
- README and project documentation.

Produce a final checklist showing what is complete, incomplete, or intentionally excluded.

## 15. Working Rules for Claude Code

While implementing:

1. Inspect existing code before changing it.
2. Do not overwrite or delete existing work without understanding its purpose.
3. Work module by module.
4. Complete backend functionality before connecting its frontend where practical.
5. Validate all external input.
6. Keep business logic out of route handlers and React components.
7. Use database transactions for critical business operations.
8. Keep Prisma schema, migrations, ERDs, and documentation synchronized.
9. Write tests alongside important business logic.
10. Use realistic seed data for local development.
11. Avoid unnecessary dependencies.
12. Do not introduce Redis, microservices, message brokers, or other infrastructure without a concrete requirement.
13. Do not add multi-tenancy, multi-warehouse, accounting, payroll, or advanced ERP features to the initial MVP unless explicitly approved.
14. Do not silently skip a feature because it is inconvenient.
15. If a requirement cannot reasonably fit the MVP, document it as a deliberate exclusion and explain the impact.
16. Report actual implementation and test results honestly.
17. Keep explanations concise and focused on important decisions.
18. Do not stop after generating documentation; continue to implementation after the relevant checkpoint is reviewed.

## 16. Start Here

Begin with Phase 0 and Phase 1 only.

First inspect the repository and understand its current state.

Then:

1. Finalize the complete functional requirements.
2. Finalize non-functional requirements.
3. Document the business rules and assumptions.
4. Define the system architecture.
5. Design the complete PostgreSQL database.
6. Create the editable diagrams.net ERD.
7. Prepare the Prisma schema.
8. Prepare the initial project progress tracker.
9. Check that the database design supports every required module.

Do not begin the full application implementation before the database and architecture review.

At the end of Phase 1, provide a concise review report containing:

- Proposed architecture.
- Module breakdown.
- Important database decisions.
- ERD deliverables and their actual file paths.
- Critical business rules.
- Open questions or assumptions.
- Any requirements that could not be represented in the current design.

After the review, wait for my approval before proceeding to Phase 2.

**Final objective:** Deliver a fully functional, well-tested, professionally documented Mini Inventory & Order Management System with a maintainable backend, usable frontend, reliable inventory and payment workflows, and an editable professional Draw.io ERD. This should be a credible real-world portfolio project, not merely a CRUD demonstration.
