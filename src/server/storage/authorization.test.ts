import { describe, expect, it, vi } from 'vitest';
import {
  authorizeStorageAction,
  type StorageActor,
  type StorageRepository,
} from './authorization';

const actor = (role: StorageActor['role'], id = `${role}-1`): StorageActor => ({ id, role });

const repository = (overrides: Partial<StorageRepository> = {}): StorageRepository => ({
  getStaff: vi.fn().mockResolvedValue(null),
  getOrder: vi.fn().mockResolvedValue(null),
  getRider: vi.fn().mockResolvedValue(null),
  ...overrides,
});

describe('authorizeStorageAction', () => {
  it('allows an admin to upload a global public asset', async () => {
    await expect(
      authorizeStorageAction(repository(), actor('admin'), 'create-upload', 'site-logo', {}),
    ).resolves.toEqual({ allowed: true });
  });

  describe('merchant-scoped public assets', () => {
    it.each([
      {
        name: 'matching merchant',
        access: { active: true, allMerchants: false, merchantIds: ['merchant-1'] },
        merchantId: 'merchant-1',
        allowed: true,
      },
      {
        name: 'different merchant',
        access: { active: true, allMerchants: false, merchantIds: ['merchant-2'] },
        merchantId: 'merchant-1',
        allowed: false,
      },
      {
        name: 'all merchants',
        access: { active: true, allMerchants: true, merchantIds: [] },
        merchantId: 'merchant-1',
        allowed: true,
      },
      {
        name: 'inactive staff',
        access: { active: false, allMerchants: true, merchantIds: ['merchant-1'] },
        merchantId: 'merchant-1',
        allowed: false,
      },
    ])('authorizes active staff for $name', async ({ access, merchantId, allowed }) => {
      const repo = repository({ getStaff: vi.fn().mockResolvedValue(access) });

      await expect(
        authorizeStorageAction(repo, actor('staff'), 'create-upload', 'menu-item', {
          merchantId,
        }),
      ).resolves.toEqual({ allowed });
    });

    it('denies missing merchant context without querying staff access', async () => {
      const repo = repository();

      await expect(
        authorizeStorageAction(repo, actor('staff'), 'delete', 'merchant-logo', {}),
      ).resolves.toEqual({ allowed: false });
      expect(repo.getStaff).not.toHaveBeenCalled();
    });

    it('treats a payment QR without merchant context as global and admin-only', async () => {
      const repo = repository({
        getStaff: vi.fn().mockResolvedValue({
          active: true,
          allMerchants: true,
          merchantIds: [],
        }),
      });

      await expect(
        authorizeStorageAction(repo, actor('staff'), 'import-url', 'payment-qr', {}),
      ).resolves.toEqual({ allowed: false });
      expect(repo.getStaff).not.toHaveBeenCalled();
    });

    it.each(['staff', 'rider', 'customer'] as const)(
      'denies %s access to global public assets without repository calls',
      async (role) => {
        const repo = repository();
        await expect(
          authorizeStorageAction(repo, actor(role), 'create-upload', 'promotion', {}),
        ).resolves.toEqual({ allowed: false });
        expect(repo.getStaff).not.toHaveBeenCalled();
      },
    );

    it.each(['rider', 'customer'] as const)(
      'denies a %s merchant-public mutations without repository calls',
      async (role) => {
        const repo = repository();
        await expect(
          authorizeStorageAction(repo, actor(role), 'delete', 'payment-qr', {
            merchantId: 'merchant-1',
          }),
        ).resolves.toEqual({ allowed: false });
        expect(repo.getStaff).not.toHaveBeenCalled();
      },
    );

    it.each(['create-upload', 'import-url', 'delete'] as const)(
      'allows admin to perform %s',
      async (action) => {
        await expect(
          authorizeStorageAction(repository(), actor('admin'), action, 'merchant-cover', {}),
        ).resolves.toEqual({ allowed: true });
      },
    );

    it('denies public downloads for every role without querying the repository', async () => {
      for (const role of ['admin', 'staff', 'rider', 'customer'] as const) {
        const repo = repository();
        await expect(
          authorizeStorageAction(repo, actor(role), 'create-download', 'menu-item', {
            merchantId: 'merchant-1',
          }),
        ).resolves.toEqual({ allowed: false });
        expect(repo.getStaff).not.toHaveBeenCalled();
      }
    });
  });

  describe('rider photos', () => {
    it.each(['create-upload', 'import-url', 'delete'] as const)(
      'allows an owning rider to perform %s but denies another rider',
      async (action) => {
        await expect(
          authorizeStorageAction(repository(), actor('rider', 'rider-1'), action, 'rider-photo', {
            riderId: 'rider-1',
          }),
        ).resolves.toEqual({ allowed: true });
        await expect(
          authorizeStorageAction(repository(), actor('rider', 'rider-2'), action, 'rider-photo', {
            riderId: 'rider-1',
          }),
        ).resolves.toEqual({ allowed: false });
      },
    );

    it('denies staff photo mutations without querying staff access', async () => {
      const repo = repository({
        getStaff: vi.fn().mockResolvedValue({
          active: true,
          allMerchants: true,
          merchantIds: [],
        }),
      });

      await expect(
        authorizeStorageAction(repo, actor('staff'), 'delete', 'rider-photo', {
          riderId: 'rider-1',
        }),
      ).resolves.toEqual({ allowed: false });
      expect(repo.getStaff).not.toHaveBeenCalled();
      expect(repo.getRider).not.toHaveBeenCalled();
    });

    it('denies a non-owning rider download without querying the rider record', async () => {
      const repo = repository();

      await expect(
        authorizeStorageAction(repo, actor('rider', 'rider-2'), 'create-download', 'rider-photo', {
          riderId: 'rider-1',
        }),
      ).resolves.toEqual({ allowed: false });
      expect(repo.getRider).not.toHaveBeenCalled();
    });

    it.each(['admin', 'rider', 'staff'] as const)(
      'returns the repository photo key when an authorized %s downloads',
      async (role) => {
        const repo = repository({
          getRider: vi.fn().mockResolvedValue({
            id: 'rider-1',
            photoObjectKey: 'rider-photos/rider-1/trusted.webp',
          }),
          getStaff: vi.fn().mockResolvedValue({
            active: true,
            allMerchants: false,
            merchantIds: [],
          }),
        });

        await expect(
          authorizeStorageAction(
            repo,
            actor(role, role === 'rider' ? 'rider-1' : `${role}-1`),
            'create-download',
            'rider-photo',
            { riderId: 'rider-1' },
          ),
        ).resolves.toEqual({
          allowed: true,
          objectKey: 'rider-photos/rider-1/trusted.webp',
        });
      },
    );

    it('requires a customer-owned order assigned to the requested rider', async () => {
      const photo = {
        id: 'rider-1',
        photoObjectKey: 'rider-photos/rider-1/trusted.webp',
      };
      const ownedAssignedOrder = {
        id: 'order-1',
        merchantId: 'merchant-1',
        customerUserId: 'customer-1',
        assignedRiderId: 'rider-1',
        receiptObjectKey: null,
      };

      await expect(
        authorizeStorageAction(
          repository({
            getRider: vi.fn().mockResolvedValue(photo),
            getOrder: vi.fn().mockResolvedValue(ownedAssignedOrder),
          }),
          actor('customer', 'customer-1'),
          'create-download',
          'rider-photo',
          { riderId: 'rider-1', orderId: 'order-1' },
        ),
      ).resolves.toEqual({ allowed: true, objectKey: photo.photoObjectKey });

      for (const mismatch of [
        { ...ownedAssignedOrder, customerUserId: 'customer-2' },
        { ...ownedAssignedOrder, assignedRiderId: 'rider-2' },
      ]) {
        await expect(
          authorizeStorageAction(
            repository({
              getRider: vi.fn().mockResolvedValue(photo),
              getOrder: vi.fn().mockResolvedValue(mismatch),
            }),
            actor('customer', 'customer-1'),
            'create-download',
            'rider-photo',
            { riderId: 'rider-1', orderId: 'order-1' },
          ),
        ).resolves.toEqual({ allowed: false });
      }
    });

    it.each([null, { id: 'rider-1', photoObjectKey: null }])(
      'denies downloads when the rider record or key is missing',
      async (rider) => {
        const repo = repository({ getRider: vi.fn().mockResolvedValue(rider) });

        await expect(
          authorizeStorageAction(repo, actor('admin'), 'create-download', 'rider-photo', {
            riderId: 'rider-1',
          }),
        ).resolves.toEqual({ allowed: false });
      },
    );

    it('denies inactive staff photo downloads', async () => {
      const repo = repository({
        getRider: vi.fn().mockResolvedValue({
          id: 'rider-1',
          photoObjectKey: 'rider-photos/rider-1/trusted.webp',
        }),
        getStaff: vi.fn().mockResolvedValue({
          active: false,
          allMerchants: true,
          merchantIds: [],
        }),
      });

      await expect(
        authorizeStorageAction(repo, actor('staff'), 'create-download', 'rider-photo', {
          riderId: 'rider-1',
        }),
      ).resolves.toEqual({ allowed: false });
    });

    it('ignores client-supplied object-key-like context data', async () => {
      const repo = repository({
        getRider: vi.fn().mockResolvedValue({
          id: 'rider-1',
          photoObjectKey: 'rider-photos/rider-1/trusted.webp',
        }),
      });
      const maliciousContext = {
        riderId: 'rider-1',
        objectKey: 'rider-photos/rider-1/attacker.webp',
      } as Parameters<typeof authorizeStorageAction>[4];

      await expect(
        authorizeStorageAction(
          repo,
          actor('rider', 'rider-1'),
          'create-download',
          'rider-photo',
          maliciousContext,
        ),
      ).resolves.toEqual({
        allowed: true,
        objectKey: 'rider-photos/rider-1/trusted.webp',
      });
    });
  });

  describe('receipts', () => {
    const receiptOrder = {
      id: 'order-1',
      merchantId: 'merchant-1',
      customerUserId: 'customer-1',
      assignedRiderId: 'rider-1',
      receiptObjectKey: 'receipts/customer-1/order-1/trusted.png',
    };

    it.each(['create-upload', 'import-url'] as const)(
      'allows a customer to perform %s for an existing owned order',
      async (action) => {
        await expect(
          authorizeStorageAction(
            repository({ getOrder: vi.fn().mockResolvedValue(receiptOrder) }),
            actor('customer', 'customer-1'),
            action,
            'receipt',
            { orderId: 'order-1' },
          ),
        ).resolves.toEqual({ allowed: true });

        await expect(
          authorizeStorageAction(
            repository({ getOrder: vi.fn().mockResolvedValue(receiptOrder) }),
            actor('customer', 'customer-2'),
            action,
            'receipt',
            { orderId: 'order-1' },
          ),
        ).resolves.toEqual({ allowed: false });
      },
    );

    it('returns the trusted receipt key when its owning customer downloads it', async () => {
      await expect(
        authorizeStorageAction(
          repository({ getOrder: vi.fn().mockResolvedValue(receiptOrder) }),
          actor('customer', 'customer-1'),
          'create-download',
          'receipt',
          { orderId: 'order-1' },
        ),
      ).resolves.toEqual({
        allowed: true,
        objectKey: receiptOrder.receiptObjectKey,
      });
    });

    it('allows the owning customer to delete without returning an object key', async () => {
      await expect(
        authorizeStorageAction(
          repository({ getOrder: vi.fn().mockResolvedValue(receiptOrder) }),
          actor('customer', 'customer-1'),
          'delete',
          'receipt',
          { orderId: 'order-1' },
        ),
      ).resolves.toEqual({ allowed: true });
    });

    it.each(['create-download', 'delete'] as const)(
      'denies another customer attempting to perform %s',
      async (action) => {
        await expect(
          authorizeStorageAction(
            repository({ getOrder: vi.fn().mockResolvedValue(receiptOrder) }),
            actor('customer', 'customer-2'),
            action,
            'receipt',
            { orderId: 'order-1' },
          ),
        ).resolves.toEqual({ allowed: false });
      },
    );

    it.each(['create-download', 'delete'] as const)(
      'allows scoped active staff to perform %s but denies wrong-merchant staff',
      async (action) => {
        const matchingStaff = repository({
          getOrder: vi.fn().mockResolvedValue(receiptOrder),
          getStaff: vi.fn().mockResolvedValue({
            active: true,
            allMerchants: false,
            merchantIds: ['merchant-1'],
          }),
        });
        const wrongMerchantStaff = repository({
          getOrder: vi.fn().mockResolvedValue(receiptOrder),
          getStaff: vi.fn().mockResolvedValue({
            active: true,
            allMerchants: false,
            merchantIds: ['merchant-2'],
          }),
        });

        await expect(
          authorizeStorageAction(matchingStaff, actor('staff'), action, 'receipt', {
            orderId: 'order-1',
          }),
        ).resolves.toEqual(
          action === 'create-download'
            ? { allowed: true, objectKey: receiptOrder.receiptObjectKey }
            : { allowed: true },
        );
        await expect(
          authorizeStorageAction(wrongMerchantStaff, actor('staff'), action, 'receipt', {
            orderId: 'order-1',
          }),
        ).resolves.toEqual({ allowed: false });
      },
    );

    it('denies staff receipt uploads and rider receipt access without repository calls', async () => {
      for (const [role, action] of [
        ['staff', 'create-upload'],
        ['rider', 'create-upload'],
        ['rider', 'create-download'],
        ['rider', 'delete'],
      ] as const) {
        const repo = repository();
        await expect(
          authorizeStorageAction(repo, actor(role), action, 'receipt', {
            orderId: 'order-1',
          }),
        ).resolves.toEqual({ allowed: false });
        expect(repo.getOrder).not.toHaveBeenCalled();
        expect(repo.getStaff).not.toHaveBeenCalled();
      }
    });

    it.each([
      { action: 'create-download' as const, order: null },
      { action: 'create-download' as const, order: { ...receiptOrder, receiptObjectKey: null } },
      { action: 'delete' as const, order: null },
    ])('denies $action when its required record data is missing', async ({ action, order }) => {
      await expect(
        authorizeStorageAction(
          repository({ getOrder: vi.fn().mockResolvedValue(order) }),
          actor('admin'),
          action,
          'receipt',
          { orderId: 'order-1' },
        ),
      ).resolves.toEqual({ allowed: false });
    });

    it.each([
      { role: 'customer' as const, id: 'customer-1' },
      { role: 'admin' as const, id: 'admin-1' },
      { role: 'staff' as const, id: 'staff-1' },
    ])('allows an authorized $role to delete when the stored key is null', async ({ role, id }) => {
      const repo = repository({
        getOrder: vi.fn().mockResolvedValue({ ...receiptOrder, receiptObjectKey: null }),
        getStaff: vi.fn().mockResolvedValue({
          active: true,
          allMerchants: false,
          merchantIds: ['merchant-1'],
        }),
      });

      await expect(
        authorizeStorageAction(repo, actor(role, id), 'delete', 'receipt', {
          orderId: 'order-1',
        }),
      ).resolves.toEqual({ allowed: true });
    });

    it('allows admin receipt operations only when the required order data exists', async () => {
      const repo = repository({ getOrder: vi.fn().mockResolvedValue(receiptOrder) });

      await expect(
        authorizeStorageAction(repo, actor('admin'), 'create-upload', 'receipt', {
          orderId: 'order-1',
        }),
      ).resolves.toEqual({ allowed: true });
      await expect(
        authorizeStorageAction(repo, actor('admin'), 'create-download', 'receipt', {
          orderId: 'order-1',
        }),
      ).resolves.toEqual({ allowed: true, objectKey: receiptOrder.receiptObjectKey });
    });

    it('requires an existing order for receipt uploads', async () => {
      await expect(
        authorizeStorageAction(repository(), actor('admin'), 'create-upload', 'receipt', {
          orderId: 'missing-order',
        }),
      ).resolves.toEqual({ allowed: false });
    });
  });

  describe('safe denial behavior', () => {
    it.each([
      ['create-upload', 'receipt', {}],
      ['create-download', 'rider-photo', {}],
    ] as const)('denies incomplete context for %s %s', async (action, category, context) => {
      const repo = repository();
      await expect(
        authorizeStorageAction(repo, actor('admin'), action, category, context),
      ).resolves.toEqual({ allowed: false });
      expect(repo.getOrder).not.toHaveBeenCalled();
      expect(repo.getRider).not.toHaveBeenCalled();
    });

    it('denies unknown categories and actions without throwing or querying', async () => {
      const repo = repository();

      await expect(
        authorizeStorageAction(
          repo,
          actor('admin'),
          'create-upload',
          'unknown' as Parameters<typeof authorizeStorageAction>[3],
          {},
        ),
      ).resolves.toEqual({ allowed: false });
      await expect(
        authorizeStorageAction(
          repo,
          actor('admin'),
          'unknown' as Parameters<typeof authorizeStorageAction>[2],
          'site-logo',
          {},
        ),
      ).resolves.toEqual({ allowed: false });
      expect(repo.getStaff).not.toHaveBeenCalled();
      expect(repo.getOrder).not.toHaveBeenCalled();
      expect(repo.getRider).not.toHaveBeenCalled();
    });

    it('propagates repository infrastructure errors', async () => {
      const failure = new Error('database unavailable');
      const repo = repository({ getOrder: vi.fn().mockRejectedValue(failure) });

      await expect(
        authorizeStorageAction(repo, actor('admin'), 'create-download', 'receipt', {
          orderId: 'order-1',
        }),
      ).rejects.toBe(failure);
    });
  });
});
