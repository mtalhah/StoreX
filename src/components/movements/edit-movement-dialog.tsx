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
import type { MovementRow } from '@/lib/client/types';
import { formatNumber } from '@/lib/format';

/**
 * Quantity and note are the only editable fields — type/item/warehouse are
 * not, since changing which item or direction a movement represents is
 * really a different movement (see StockMovementService.update).
 */
export function EditMovementDialog({
  open,
  movement,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  movement: MovementRow | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {/* Remounted per open/target so the form always starts from props. */}
        {open && movement && (
          <EditMovementForm key={movement.id} movement={movement} onOpenChange={onOpenChange} onSaved={onSaved} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditMovementForm({
  movement,
  onOpenChange,
  onSaved,
}: {
  movement: MovementRow;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [quantity, setQuantity] = useState(String(movement.quantity));
  const [note, setNote] = useState(movement.note ?? '');
  const [busy, setBusy] = useState(false);
  const { errors, setErrors, clearErrors, applyApiError } = useFieldErrors();

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    const qty = Number(quantity);
    if (!quantity.trim() || !Number.isInteger(qty) || qty <= 0) {
      next.quantity = 'Quantity must be a positive whole number.';
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
      await apiFetch(`/api/v1/movements/${movement.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ quantity: Number(quantity), note: note.trim() }),
      });
      toast.success('Movement updated.');
      onSaved();
      onOpenChange(false);
    } catch (err) {
      if (!applyApiError(err)) {
        toast.error(err instanceof ApiError ? err.message : 'Failed to update movement.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit movement</DialogTitle>
        <DialogDescription>
          {movement.sku} — {movement.itemName} · {movement.type === 'INBOUND' ? 'Inbound' : 'Outbound'} at{' '}
          {movement.warehouseName}
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="mv-edit-qty">Quantity</Label>
          <Input
            id="mv-edit-qty"
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            aria-invalid={!!errors.quantity}
          />
          <FieldError message={errors.quantity} />
          <p className="text-xs text-muted-foreground">
            Originally recorded as {formatNumber(movement.quantity)}. Correcting this atomically adjusts the
            item&rsquo;s quantity on hand by the difference.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="mv-edit-note">Note</Label>
          <Input
            id="mv-edit-note"
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
          <Button type="submit" disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            {busy ? 'Saving…' : 'Save changes'}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
