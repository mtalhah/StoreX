'use client';

import { Loader2 } from 'lucide-react';
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
import { FieldError } from '@/components/ui/field-error';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiFetch, ApiError } from '@/lib/client/api';
import { useFieldErrors } from '@/lib/client/validation';
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
  const { errors, setErrors, clearErrors, applyApiError } = useFieldErrors();

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = 'Name is required.';
    else if (name.trim().length > 120) next.name = 'Name must be 120 characters or fewer.';
    if (!location.trim()) next.location = 'Location is required.';
    else if (location.trim().length > 200) next.location = 'Location must be 200 characters or fewer.';
    const capacityNum = Number(capacity);
    if (!capacity.trim() || !Number.isInteger(capacityNum) || capacityNum <= 0) {
      next.capacity = 'Capacity must be a positive whole number.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearErrors();
    if (!validate()) return;
    setBusy(true);
    try {
      const body = { name: name.trim(), location: location.trim(), capacity: Number(capacity) };
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
      if (!applyApiError(err)) {
        toast.error(err instanceof ApiError ? err.message : 'Something went wrong.');
      }
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
          <Input
            id="wh-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            aria-invalid={!!errors.name}
          />
          <FieldError message={errors.name} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="wh-location">Location</Label>
          <Input
            id="wh-location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="City, Country"
            maxLength={200}
            aria-invalid={!!errors.location}
          />
          <FieldError message={errors.location} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="wh-capacity">Capacity (storage units)</Label>
          <Input
            id="wh-capacity"
            type="number"
            min={1}
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            aria-invalid={!!errors.capacity}
          />
          <FieldError message={errors.capacity} />
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
            {busy && <Loader2 className="size-4 animate-spin" />}
            {busy ? 'Saving…' : isEdit ? 'Save changes' : 'Create warehouse'}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
