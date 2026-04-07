/**
 * E2E / UI: luồng cơ bản trên Chromium (Automation + smoke UI)
 */
const { test, expect } = require('@playwright/test');

test.describe('SPA & routing', () => {
  test('trang chủ chưa đăng nhập chuyển tới form đăng nhập', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('button', { name: 'Đăng nhập' })).toBeVisible();
    await expect(page.locator('#login_email')).toBeVisible();
  });

  test('/director chưa đăng nhập chuyển tới đăng nhập', async ({ page }) => {
    await page.goto('/director');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('button', { name: 'Đăng nhập' })).toBeVisible();
  });

  test('/login hiển thị form đăng nhập', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('button', { name: 'Đăng nhập' })).toBeVisible();
    await expect(page.locator('#login_email')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Đăng ký' }).first()).toBeVisible();
  });

  test('/register hiển thị form đăng ký', async ({ page }) => {
    await page.goto('/register');
    await expect(page.getByRole('button', { name: 'Đăng ký' })).toBeVisible();
    await expect(page.locator('#reg_email')).toBeVisible();
  });
});

test.describe('Luồng đăng ký → form PM (UI automation)', () => {
  test('đăng ký thành công và thấy checklist', async ({ page }) => {
    const email = `e2e_${Date.now()}@example.com`;
    await page.goto('/register');
    await page.fill('#reg_email', email);
    await page.fill('#reg_name', 'E2E User');
    await page.fill('#reg_password', 'password123');
    await page.getByRole('button', { name: 'Đăng ký' }).click();
    await expect(page.getByText(/Thông tin buổi báo cáo|Checklist tuần/i).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/Đăng xuất|E2E User/i).first()).toBeVisible();
  });
});
