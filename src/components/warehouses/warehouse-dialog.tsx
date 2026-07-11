'use client';

import { useState } from 'react';
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
import { apiFetch, ApiError } from '@/lib/client/api';
import type { WarehouseRow } from '@/lib/client/types';

export function WarehouseDialog({
  open,
  warehouse,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  warehouse: WarehouseRow | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {/* Remounted per open/target so the form always starts from props. */}
        {open && (
          <WarehouseForm
            key={warehouse?.id ?? 'new'}
            warehouse={warehouse}
            onOpenChange={onOpenChange}
            onSaved={onSaved}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function WarehouseForm({
  warehouse,
  onOpenChange,
  onSaved,
}: {
  warehouse: WarehouseRow | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const isEdit = warehouse !== null;
  const [name, setName] = useState(warehouse?.name ?? '');
  const [location, setLocation] = useState(warehouse?.location ?? '');
  const [capacity, setCapacity] = useState(warehouse ? String(warehouse.capacity) : '');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = { name, location, capacity: Number(capacity) };
      if (isEdit) {
        await apiFetch(`/api/v1/warehouses/${warehouse.id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        toast.success('Warehouse updated.');
      } else {
        await apiFetch('/api/v1/warehouses', { method: 'POST', body: JSON.stringify(body) });
        toast.success('Warehouse created.');
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
        <DialogTitle>{isEdit ? 'Edit warehouse' : 'New warehouse'}</DialogTitle>
        <DialogDescription>
          {isEdit
            ? 'Update the warehouse details. Capacity cannot drop below storage units currently in use.'
            : 'Add a warehouse to your organization.'}
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="wh-name">Name</Label>
          <Input id="wh-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="wh-location">Location</Label>
          <Input
            id="wh-location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="City, Country"
            required
            maxLength={200}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="wh-capacity">Capacity (storage units)</Label>
          <Input
            id="wh-capacity"
            type="number"
            min={1}
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            required
          />
          <p className="text-xs text-muted-foreground">
            Total storage units available. Each inventory item consumes some number of storage
            units per unit on hand — set that ratio when creating or editing the item.
          </p>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'Saving…' : isEdit ? 'Save changes' : 'Create warehouse'}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
