import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../../src/context/AuthContext';
import { useLiveQuery } from '../../../src/hooks/useLiveQuery';
import { useMerchants } from '../../../src/hooks/useMerchants';
import { useOrderTracking } from '../../../src/hooks/useOrderTracking';
import { adminOrdersApi } from '../../../src/lib/adminOrdersApi';
import { OrderRouteMap } from '../../../src/components/map/OrderRouteMap';
import { toMapPoint } from '../../../src/lib/map/orderPoints';
import type { RiderSummary, StaffOrderStatus } from '../../../src/lib/adminTypes';
import { canAssignRider, canUnassignRider } from '../../../src/lib/orderActions';
import { statusStyle } from '../../../src/lib/statusColors';
import { formatDateTime, serviceTypeLabel, shortOrderId } from '../../../src/lib/formatters';
import { colors, formatPeso, radius, spacing } from '../../../src/theme';
import { Badge, Button, EmptyState } from '../../../src/components/ui';
import { StatusActionBar } from '../../../src/components/admin/StatusActionBar';
import { AssignRiderSheet } from '../../../src/components/admin/AssignRiderSheet';

const OFFER_POLL_MS = 15_000;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} selectable>
        {value}
      </Text>
    </View>
  );
}

export default function StaffOrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { merchants } = useMerchants();
  const { isViewingAs } = useAuth();
  const [pendingStatus, setPendingStatus] = useState<StaffOrderStatus | null>(null);
  const [isRiderBusy, setIsRiderBusy] = useState(false);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [riderName, setRiderName] = useState<string | null>(null);

  const fetcher = useCallback(() => adminOrdersApi.getById(id ?? ''), [id]);
  const { data: order, isLoading, error, refetch } = useLiveQuery(fetcher, [id], {
    enabled: !!id,
    realtime: id ? [{ table: 'orders', filter: `id=eq.${id}` }] : [],
  });

  const offersFetcher = useCallback(() => adminOrdersApi.pendingOfferCount(id ?? ''), [id]);
  const needsOffers = !!order && order.serviceType === 'delivery' && !order.assignedRiderId && order.status === 'ready';
  const { data: pendingOffers } = useLiveQuery(offersFetcher, [id], {
    enabled: needsOffers,
    pollMs: OFFER_POLL_MS,
    realtime: id ? [{ table: 'order_offers', filter: `order_id=eq.${id}` }] : [],
  });

  const merchant = useMemo(
    () => merchants.find((m) => m.id === order?.merchantId),
    [merchants, order?.merchantId]
  );
  const merchantName = merchant?.name;

  // The assigned rider's live position, so an admin can see a stalled delivery
  // rather than having to ring the rider to find out.
  const { presence } = useOrderTracking({
    riderId: order?.assignedRiderId ?? null,
    isAwaitingRider: false,
  });

  useEffect(() => {
    if (!order?.assignedRiderId) {
      setRiderName(null);
      return;
    }
    let cancelled = false;
    adminOrdersApi
      .riderName(order.assignedRiderId)
      .then((name) => {
        if (!cancelled) setRiderName(name);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [order?.assignedRiderId]);

  const changeStatus = useCallback(
    async (status: StaffOrderStatus) => {
      if (!order || isViewingAs) return;
      const run = async () => {
        setPendingStatus(status);
        try {
          await adminOrdersApi.updateStatus(order.id, status);
          await refetch();
        } catch (err) {
          Alert.alert('Update failed', err instanceof Error ? err.message : 'Please try again.');
        } finally {
          setPendingStatus(null);
        }
      };
      if (status === 'cancelled') {
        Alert.alert('Cancel this order?', 'The customer will be notified.', [
          { text: 'Keep order', style: 'cancel' },
          { text: 'Cancel order', style: 'destructive', onPress: run },
        ]);
        return;
      }
      await run();
    },
    [order, isViewingAs, refetch]
  );

  const assignRider = useCallback(
    async (rider: RiderSummary) => {
      if (!order || isViewingAs) return;
      await adminOrdersApi.assignRider(order.id, rider.id);
      await refetch();
    },
    [order, isViewingAs, refetch]
  );

  const unassignRider = useCallback(() => {
    if (!order || isViewingAs) return;
    Alert.alert('Remove rider?', 'Auto-dispatch will look for another rider if the order is ready.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setIsRiderBusy(true);
          try {
            await adminOrdersApi.unassignRider(order.id);
            await refetch();
          } catch (err) {
            Alert.alert('Could not remove rider', err instanceof Error ? err.message : 'Please try again.');
          } finally {
            setIsRiderBusy(false);
          }
        },
      },
    ]);
  }, [order, isViewingAs, refetch]);

  if (!order) {
    return (
      <View style={styles.screen}>
        <Stack.Screen options={{ title: 'Order' }} />
        {isLoading ? null : (
          <EmptyState emoji="🔍" title="Order not found" body={error?.message ?? 'It may belong to another merchant.'} />
        )}
      </View>
    );
  }

  const status = statusStyle(order.status);

  const riderPoint = toMapPoint(presence?.latitude, presence?.longitude);
  const pickup = toMapPoint(merchant?.latitude, merchant?.longitude);
  const dropOff = toMapPoint(order.deliveryLatitude, order.deliveryLongitude);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Stack.Screen options={{ title: `#${shortOrderId(order.id)}` }} />
      <View style={styles.headerRow}>
        <Badge label={status.label} color={status.color} backgroundColor={status.background} />
        <Text style={styles.time}>{formatDateTime(order.createdAt)}</Text>
      </View>
      {!!merchantName && <Text style={styles.merchant}>{merchantName}</Text>}
      {!!error && <Text style={styles.error}>{error.message}</Text>}

      <Section title="Next step">
        {isViewingAs ? (
          <Text style={styles.hint}>Read-only preview — order actions are disabled.</Text>
        ) : (
          <StatusActionBar order={order} pendingStatus={pendingStatus} onSelect={changeStatus} />
        )}
        {order.status === 'out_for_delivery' && (
          <Text style={styles.hint}>The rider marks this order delivered from their app.</Text>
        )}
      </Section>

      {order.serviceType === 'delivery' && (
        <Section title="Rider">
          {order.assignedRiderId ? (
            <Text style={styles.body}>
              🛵 {riderName ?? 'Assigned rider'}
              {order.riderAssignedAt ? ` · since ${formatDateTime(order.riderAssignedAt)}` : ''}
            </Text>
          ) : (
            <Text style={styles.body}>
              {needsOffers
                ? `No rider yet · ${pendingOffers ?? 0} pending offer${pendingOffers === 1 ? '' : 's'}`
                : 'No rider assigned'}
            </Text>
          )}
          <View style={styles.actions}>
            {!isViewingAs && canAssignRider(order) && (
              <Button
                label={order.assignedRiderId ? 'Reassign rider' : 'Assign rider'}
                variant="secondary"
                size="sm"
                onPress={() => setIsSheetOpen(true)}
                disabled={isRiderBusy}
              />
            )}
            {!isViewingAs && canUnassignRider(order) && (
              <Button label="Remove rider" variant="danger" size="sm" onPress={unassignRider} isLoading={isRiderBusy} />
            )}
          </View>
        </Section>
      )}

      {order.serviceType === 'delivery' && (
        <Section title="Route">
          <OrderRouteMap rider={riderPoint} merchant={pickup} destination={dropOff} />
        </Section>
      )}

      <Section title="Items">
        {order.order_items.map((item) => (
          <View key={item.id} style={styles.item}>
            <Text style={styles.itemQty}>{item.quantity}×</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemName}>{item.name}</Text>
              {!!item.variation && typeof item.variation === 'object' && 'name' in item.variation && (
                <Text style={styles.itemMeta}>{String((item.variation as { name: unknown }).name)}</Text>
              )}
            </View>
            <Text style={styles.itemPrice}>{formatPeso(item.subtotal)}</Text>
          </View>
        ))}
        <View style={[styles.item, styles.totalRow]}>
          <Text style={styles.totalLabel}>Delivery fee</Text>
          <Text style={styles.itemPrice}>{formatPeso(order.deliveryFee ?? 0)}</Text>
        </View>
        <View style={styles.item}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.total}>{formatPeso(order.total)}</Text>
        </View>
      </Section>

      <Section title="Customer">
        <Row label="Name" value={order.customerName} />
        <Row label="Phone" value={order.contactNumber} />
        <Row label="Service" value={serviceTypeLabel(order.serviceType)} />
        <Row label="Address" value={order.address} />
        <Row label="Pickup time" value={order.pickupTime} />
        <Row label="Party size" value={order.partySize ? String(order.partySize) : null} />
        <Row label="Notes" value={order.notes} />
      </Section>

      <Section title="Payment">
        <Row label="Method" value={order.paymentMethod} />
        <Row label="Reference" value={order.referenceNumber} />
      </Section>

      <AssignRiderSheet
        isVisible={isSheetOpen}
        currentRiderId={order.assignedRiderId}
        onClose={() => setIsSheetOpen(false)}
        onAssign={assignRider}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  time: { fontSize: 12, color: colors.textMuted },
  merchant: { fontSize: 15, fontWeight: '700', color: colors.text },
  error: { color: colors.danger, fontSize: 13 },
  section: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.lg, gap: spacing.sm },
  sectionTitle: { fontSize: 12, fontWeight: '800', color: colors.textSecondary, textTransform: 'uppercase' },
  hint: { fontSize: 12, color: colors.textMuted },
  body: { fontSize: 15, color: colors.text },
  actions: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  itemQty: { width: 32, fontWeight: '800', color: colors.primary },
  itemName: { fontSize: 15, color: colors.text },
  itemMeta: { fontSize: 12, color: colors.textSecondary },
  itemPrice: { fontSize: 14, fontWeight: '600', color: colors.text },
  totalRow: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: spacing.sm },
  totalLabel: { flex: 1, fontSize: 14, color: colors.textSecondary },
  total: { fontSize: 18, fontWeight: '800', color: colors.primary },
  row: { flexDirection: 'row', gap: spacing.md },
  rowLabel: { width: 90, fontSize: 13, color: colors.textSecondary },
  rowValue: { flex: 1, fontSize: 14, color: colors.text },
});
