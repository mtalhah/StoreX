'use client';

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export interface DetailField {
  label: string;
  value: React.ReactNode;
}

/**
 * Read-only "full row" view for mobile, where the grid only shows 3-4
 * columns. Tapping a row opens this with every field the desktop table has.
 */
export function RowDetailsDialog({
  open,
  onOpenChange,
  title,
  fields,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  fields: DetailField[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <dl className="min-w-0 divide-y divide-border text-sm">
          {fields.map((f) => (
            <div key={f.label} className="flex items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
              <dt className="text-muted-foreground">{f.label}</dt>
              <dd
                className="min-w-0 truncate text-right font-medium"
                title={typeof f.value === 'string' ? f.value : undefined}
              >
                {f.value}
              </dd>
            </div>
          ))}
        </dl>
        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  );
}
