'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { apiFetch, ApiError, swrFetcher, type ApiResult } from '@/lib/client/api';
import type { InventoryRow } from '@/lib/client/types';
import { formatNumber } from '@/lib/format';

/**
 * The single UI entry point for changing stock levels — mirrors the domain
 * rule that quantities only move through recorded stock movements.
 * When `item` is provided the item selector is hidden (row-level action);
 * otherwise the user picks an item first.
 */
export function RecordMovementDialog({
  open,
  item,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  item: InventoryRow | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {/* Remounted per open/target so the form always starts from props. */}
        {open && (
          <MovementForm key={item?.id ?? 'pick'} item={item} onOpenChange={onOpenChange} onSaved={onSaved} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function MovementForm({
  item,
  onOpenChange,
  onSaved,
}: {
  item: InventoryRow | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [type, setType] = useState<'INBOUND' | 'OUTBOUND'>('INBOUND');
  const [itemId, setItemId] = useState(item?.id ?? '');
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  // Item picker data, only fetched when no item was preselected.
  const { data: itemsData } = useSWR<ApiResult<InventoryRow[]>>(
    item ? null : '/api/v1/inventory?page=1&pageSize=100&sortBy=sku&sortDir=asc',
    swrFetcher<InventoryRow[]>,
  );
  const selectableItems = itemsData?.data ?? [];
  const selected = item ?? selectableItems.find((i) => i.id === itemId) ?? null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    setBusy(true);
    try {
      await apiFetch('/api/v1/movements', {
        method: 'POST',
        body: JSON.stringify({
          inventoryItemId: selected.id,
          type,
          quantity: Number(quantity),
          ...(note.trim() ? { note: note.trim() } : {}),
        }),
      });
      toast.success(
        `${type === 'INBOUND' ? 'Received' : 'Shipped'} ${formatNumber(Number(quantity))} × ${selected.sku}.`,
      );
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to record movement.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Record stock movement</DialogTitle>
        <DialogDescription>
          {selected
            ? `${selected.sku} — ${selected.name} · ${formatNumber(selected.quantity)} on hand at ${selected.warehouseName}`
            : 'Choose an item, direction, and quantity.'}
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        {!item && (
          <div className="space-y-2">
            <Label>Item</Label>
            <Select value={itemId} onValueChange={(v) => setItemId(v ?? '')}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select an item" />
              </SelectTrigger>
              <SelectContent>
                {selectableItems.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.sku} · {i.name} ({i.warehouseName})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-2">
          <Label>Direction</Label>
          <Tabs value={type} onValueChange={(v) => setType(v as 'INBOUND' | 'OUTBOUND')}>
            <TabsList className="w-full">
              <TabsTrigger value="INBOUND" className="flex-1">
                Inbound — receive
              </TabsTrigger>
              <TabsTrigger value="OUTBOUND" className="flex-1">
                Outbound — ship
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div className="space-y-2">
          <Label htmlFor="mv-qty">Quantity</Label>
          <Input
            id="mv-qty"
            type="number"
            min={1}
            max={type === 'OUTBOUND' && selected ? selected.quantity : undefined}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            required
          />
          {type === 'OUTBOUND' && selected && (
            <p className="text-xs text-muted-foreground">
              Up to {formatNumber(selected.quantity)} units available.
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="mv-note">Note (optional)</Label>
          <Input
            id="mv-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="PO number, carrier, reason…"
            maxLength={500}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || !selected}>
            {busy ? 'Recording…' : 'Record movement'}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
