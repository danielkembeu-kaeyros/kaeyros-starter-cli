import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted">
      <nav className="border-b">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <h1 className="text-xl font-bold">Next.js Boilerplate</h1>
          <div className="flex gap-4">
            <Link href="/login">
              <Button variant="ghost">Sign in</Button>
            </Link>
            <Link href="/dashboard">
              <Button>Dashboard</Button>
            </Link>
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-16">
        <div className="mx-auto max-w-3xl space-y-8 text-center">
          <div className="space-y-4">
            <h2 className="text-4xl font-bold tracking-tight sm:text-6xl">
              Welcome to Your Next.js Startup
            </h2>
            <p className="text-xl text-muted-foreground">
              A production-ready boilerplate with authentication, type safety, and best practices
              built in.
            </p>
          </div>

          <div className="flex justify-center gap-4">
            <Link href="/login">
              <Button size="lg">Get Started</Button>
            </Link>
            <Link href="https://github.com" target="_blank">
              <Button size="lg" variant="outline">
                View on GitHub
              </Button>
            </Link>
          </div>

          <div className="grid gap-6 pt-12 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>TypeScript</CardTitle>
                <CardDescription>Fully typed with strict mode enabled</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Catch errors early with comprehensive type checking
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Authentication</CardTitle>
                <CardDescription>Secure auth with token refresh</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Built-in JWT auth with automatic token refresh logic
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Best Practices</CardTitle>
                <CardDescription>Industry-standard patterns</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  ESLint, Prettier, and pre-push hooks configured
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      <footer className="border-t py-6">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          Built with Next.js, TypeScript, and shadcn/ui
        </div>
      </footer>
    </div>
  );
}
