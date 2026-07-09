import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-6">
      <p className="text-5xl font-semibold tracking-tight text-muted-foreground/40">404</p>
      <div className="space-y-1 text-center">
        <h2 className="text-lg font-semibold">Page not found</h2>
        <p className="text-sm text-muted-foreground">
          The page you are looking for doesn&apos;t exist or you don&apos;t have access to it.
        </p>
      </div>
      <Button variant="outline" nativeButton={false} render={<Link href="/dashboard" />}>
        Back to dashboard
      </Button>
    </div>
  );
}
