import { expect, test } from '@playwright/test';

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@example.com';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'ChangeMe123!';

test.describe('End-to-end Inventory & Order Management workflow', () => {
  test('redirects unauthenticated visitors and displays non-technical auth feedback', async ({ page }) => {
    await page.goto('/products');
    await expect(page).toHaveURL(/\/login\?next=%2Fproducts/);

    await page.getByLabel('Email').fill(ADMIN_EMAIL);
    await page.getByLabel('Password').fill('WrongPass123');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByText(/invalid email or password/i)).toBeVisible();
  });

  test('runs complete business lifecycle: purchase -> receive -> sell -> pay -> complete -> return -> verify inventory & reports', async ({
    page,
  }) => {
    const suffix = Date.now().toString().slice(-6);
    const sku = `E2E-${suffix}`;
    const productName = `E2E Widget ${suffix}`;
    const supplierName = `E2E Supplier ${suffix}`;
    const customerName = `E2E Customer ${suffix}`;

    // 1. Login
    await page.goto('/login');
    await page.getByLabel('Email').fill(ADMIN_EMAIL);
    await page.getByLabel('Password').fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { name: 'Operational Dashboard' })).toBeVisible();

    // 2. Create product
    await page.goto('/products');
    await page.getByRole('button', { name: 'New Product' }).click();
    await page.locator('#prod-sku').fill(sku);
    await page.locator('#prod-name').fill(productName);
    await page.locator('#prod-price').fill('50.00');
    const costInput = page.locator('#prod-cost');
    if (await costInput.count()) {
      await costInput.fill('20.00');
    }
    await page.locator('#prod-reorder').fill('5');
    await page.locator('#prod-opening').fill('0');
    await page.getByRole('button', { name: 'Create Product' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await page.goto(`/products?search=${sku}`);
    await expect(page.getByText(sku)).toBeVisible();

    // 3. Create supplier
    await page.goto('/suppliers');
    await page.getByRole('button', { name: 'New Supplier' }).click();
    await page.locator('#sup-name').fill(supplierName);
    await page.locator('#sup-contact').fill('Alex Vendor');
    await page.locator('#sup-phone').fill('555-0199');
    await page.getByRole('button', { name: 'Create Supplier' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await page.goto(`/suppliers?search=${encodeURIComponent(supplierName)}`);
    await expect(page.getByText(supplierName)).toBeVisible();

    // 4. Create purchase -> confirm -> receive stock (10 units)
    await page.goto('/purchases/new');
    const purchaseTriggers = page.locator('button[role="combobox"]');
    await purchaseTriggers.first().click();
    await page.getByRole('option', { name: supplierName }).click();

    await page.locator('table button[role="combobox"]').first().click();
    await page.getByRole('option', { name: new RegExp(sku) }).click();
    await page.locator('table input[type="number"]').first().fill('10');
    await page.locator('table tbody tr').first().locator('input').nth(1).fill('20.00');
    await page.getByRole('button', { name: 'Create Draft Purchase' }).click();

    await expect(page).toHaveURL(/\/purchases\/[0-9a-f-]+$/);
    await page.getByRole('button', { name: 'Confirm Order' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Confirm Order' }).click();
    await expect(page.getByText('Ordered', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Receive Goods' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Record Goods Receipt' }).click();
    await expect(page.getByText('Received', { exact: true })).toBeVisible();

    // 5. Verify inventory increased to 10
    await page.goto(`/inventory?search=${sku}`);
    await expect(page.getByRole('row', { name: new RegExp(sku) })).toContainText('10 pcs');

    // 6. Create customer & customer order -> confirm -> record payment -> complete -> check invoice
    await page.goto('/customers');
    await page.getByRole('button', { name: 'New Customer' }).click();
    await page.locator('#cust-name').fill(customerName);
    await page.locator('#cust-phone').fill('555-0123');
    await page.getByRole('button', { name: 'Create Customer' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await page.goto(`/customers?search=${encodeURIComponent(customerName)}`);
    await expect(page.getByText(customerName)).toBeVisible();

    await page.goto('/orders/new');
    await page.locator('button[role="combobox"]').first().click();
    await page.getByRole('option', { name: customerName }).click();

    await page.locator('table button[role="combobox"]').first().click();
    await page.getByRole('option', { name: new RegExp(sku) }).click();
    await page.locator('table input[type="number"]').first().fill('4');
    await page.getByRole('button', { name: 'Create Draft Order' }).click();

    await expect(page).toHaveURL(/\/orders\/[0-9a-f-]+$/);
    const orderUrl = page.url();

    await page.getByRole('button', { name: 'Confirm Order' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Confirm' }).click();
    await expect(page.getByText('Confirmed', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Record Payment' }).click();
    await expect(page.locator('#pay-amount')).not.toHaveValue('');
    await page.getByRole('dialog').getByRole('button', { name: 'Record Payment' }).click();
    await expect(page.getByText('Paid', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Complete' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Confirm' }).click();
    await expect(page.getByText('Completed', { exact: true })).toBeVisible();

    await page.getByRole('link', { name: 'Invoice' }).click();
    await expect(page).toHaveURL(/\/orders\/[0-9a-f-]+\/invoice$/);
    await expect(page.getByText(customerName)).toBeVisible();

    // 7. Process resalable return (1 unit) and verify restock
    await page.goto(orderUrl);
    await page.getByRole('link', { name: 'Request Return' }).click();
    await expect(page).toHaveURL(/\/sales-returns\/new/);
    await page.locator('table input[type="number"]').first().fill('1');
    await page.locator('#ret-reason').fill('E2E workflow return verification');
    await page.getByRole('button', { name: 'Submit Return Request' }).click();

    await expect(page).toHaveURL(/\/sales-returns\/[0-9a-f-]+$/);
    await page.getByRole('button', { name: 'Approve & Complete' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Complete Return' }).click();
    await expect(page.getByText('Completed', { exact: true })).toBeVisible();
    await expect(page.getByText('SALE_RETURN')).toBeVisible();

    // 8. Verify inventory net balance = 10 - 4 + 1 = 7 and reports reflect data cleanly
    await page.goto(`/inventory?search=${sku}`);
    await expect(page.getByRole('row', { name: new RegExp(sku) })).toContainText('7 pcs');

    await page.goto('/reports?tab=sales');
    await expect(page.getByRole('heading', { name: 'Reports & Analytics' })).toBeVisible();
    await expect(page.getByText('Sales by Product')).toBeVisible();
  });
});
