'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
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
import { apiFetch, ApiError } from '@/lib/client/api';
import type { InventoryRow } from '@/lib/client/types';
import { formatDecimal } from '@/lib/format';

type RatioMode = 'storageUnitsPerItem' | 'itemsPerStorageUnit';

export function InventoryItemDialog({
  open,
  item,
  warehouses,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  item: InventoryRow | null;
  warehouses: Array<{ id: string; name: string }>;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {/* Remounted per open/target so the form always starts from props. */}
        {open && (
          <InventoryItemForm
            key={item?.id ?? 'new'}
            item={item}
            warehouses={warehouses}
            onOpenChange={onOpenChange}
            onSaved={onSaved}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function InventoryItemForm({
  item,
  warehouses,
  onOpenChange,
  onSaved,
}: {
  item: InventoryRow | null;
  warehouses: Array<{ id: string; name: string }>;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const isEdit = item !== null;
  const [warehouseId, setWarehouseId] = useState(item?.warehouseId ?? '');
  const [sku, setSku] = useState(item?.sku ?? '');
  const [name, setName] = useState(item?.name ?? '');
  const [mode, setMode] = useState<RatioMode>('storageUnitsPerItem');
  const [ratioValue, setRatioValue] = useState(item ? String(item.storageUnitsPerItem) : '');
  const [busy, setBusy] = useState(false);

  // Switching modes converts the displayed number to its equivalent in the
  // new unit, so the ratio the user actually means stays constant across
  // the toggle instead of silently changing.
  const handleModeChange = (next: string) => {
    const nextMode = next as RatioMode;
    if (nextMode === mode) return;
    const n = Number(ratioValue);
    if (Number.isFinite(n) && n > 0) setRatioValue(String(1 / n));
    setMode(nextMode);
  };

  const derived = useMemo(() => {
    const n = Number(ratioValue);
    if (!ratioValue.trim() || !Number.isFinite(n) || n <= 0) return null;
    const inverse = 1 / n;
    const label = mode === 'storageUnitsPerItem' ? 'items per storage unit' : 'storage units per item';
    return `≈ ${formatDecimal(inverse)} ${label}`;
  }, [mode, ratioValue]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const ratio = ratioValue.trim() ? { [mode]: Number(ratioValue) } : {};
      if (isEdit) {
        await apiFetch(`/api/v1/inventory/${item.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ sku, name, ...ratio }),
        });
        toast.success('Item updated.');
      } else {
        await apiFetch('/api/v1/inventory', {
          method: 'POST',
          body: JSON.stringify({ warehouseId, sku, name, ...ratio }),
        });
        toast.success('Item created. Record an inbound movement to add stock.');
      }
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{isEdit ? 'Edit item' : 'New inventory item'}</DialogTitle>
        <DialogDescription>
          {isEdit
            ? 'Update the SKU, display name, or storage ratio. Quantities change only through stock movements.'
            : 'Items start at zero stock; record an inbound movement to receive units.'}
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        {!isEdit && (
          <div className="space-y-2">
            <Label>Warehouse</Label>
            <Select value={warehouseId} onValueChange={(v) => setWarehouseId(v ?? '')}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a warehouse" />
              </SelectTrigger>
              <SelectContent>
                {warehouses.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="item-sku">SKU</Label>
          <Input
            id="item-sku"
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            placeholder="ELC-1001"
            required
            maxLength={64}
            pattern="[A-Za-z0-9._-]+"
            title="Letters, digits, dots, underscores, and dashes."
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="item-name">Name</Label>
          <Input id="item-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={200} />
        </div>
        <div className="space-y-2">
          <Label>Storage ratio</Label>
          <Tabs value={mode} onValueChange={handleModeChange}>
            <TabsList className="w-full">
              <TabsTrigger value="storageUnitsPerItem" className="flex-1">
                Storage units per item
              </TabsTrigger>
              <TabsTrigger value="itemsPerStorageUnit" className="flex-1">
                Items per storage unit
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Input
            type="number"
            min={0}
            step="any"
            value={ratioValue}
            onChange={(e) => setRatioValue(e.target.value)}
            placeholder="Default: 1 storage unit per item"
          />
          <p className="min-h-4 text-xs text-muted-foreground">
            {derived ?? 'Determines how much of a warehouse’s capacity each unit of this SKU consumes.'}
          </p>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || (!isEdit && !warehouseId)}>
            {busy ? 'Saving…' : isEdit ? 'Save changes' : 'Create item'}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
