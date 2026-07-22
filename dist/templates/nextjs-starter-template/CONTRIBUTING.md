# Contributing to Next.js Startup Boilerplate

Thank you for your interest in contributing! This document provides guidelines and patterns to follow when working on this boilerplate.

## Development Setup

1. Fork and clone the repository
2. Install dependencies: `npm install`
3. Copy `.env.example` to `.env` and configure
4. Run development server: `npm run dev`

## Code Standards

### TypeScript

- Use strict TypeScript - all strict mode options are enabled
- Define proper types/interfaces for all data structures
- Avoid `any` type - use `unknown` if type is truly unknown
- Use type inference where possible

```typescript
// Good
const user: User = await getUser();

// Better (with inference)
const user = await getUser(); // Returns User type
```

### Component Patterns

#### Naming Conventions

- **Components**: PascalCase (`LoginForm.tsx`, `UserProfile.tsx`)
- **Hooks**: camelCase with `use` prefix (`useAuth.ts`, `useUser.ts`)
- **Utils**: camelCase (`formatDate.ts`, `cn.ts`)
- **Types**: PascalCase (`User`, `AuthTokens`)

#### Component Structure

```typescript
// 1. Imports
import { useState } from 'react';
import { Button } from '@/components/ui/button';

// 2. Types/Interfaces
interface MyComponentProps {
  title: string;
  onSubmit: () => void;
}

// 3. Component
export function MyComponent({ title, onSubmit }: MyComponentProps) {
  // 4. Hooks
  const [isOpen, setIsOpen] = useState(false);

  // 5. Functions
  const handleClick = () => {
    setIsOpen(true);
  };

  // 6. Render
  return <div>{title}</div>;
}
```

### State Management

#### When to use Zustand

- Global UI state (sidebar open/closed, theme)
- User authentication state
- Cross-component state that doesn't come from API

#### When to use React Query

- Server data (API responses)
- Data that needs caching
- Data that auto-refreshes

### API Services

All API calls should be in `services/` folder:

```typescript
// services/posts.service.ts
import apiClient from './api.service';

export const postsService = {
  getPosts: async () => {
    const response = await apiClient.get('/posts');
    return response.data;
  },

  createPost: async (data: CreatePostDto) => {
    const response = await apiClient.post('/posts', data);
    return response.data;
  },
};
```

Then create a custom hook:

```typescript
// hooks/use-posts.ts
import { useQuery, useMutation } from '@tanstack/react-query';
import { postsService } from '@/services/posts.service';

export function usePosts() {
  return useQuery({
    queryKey: ['posts'],
    queryFn: postsService.getPosts,
  });
}
```

### Form Handling

Always use react-hook-form with Zod validation:

1. Define schema in `lib/validations.ts`:

```typescript
export const postSchema = z.object({
  title: z.string().min(3),
  content: z.string().min(10),
});
```

2. Use in component:

```typescript
const {
  register,
  handleSubmit,
  formState: { errors },
} = useForm({
  resolver: zodResolver(postSchema),
});
```

### Styling

- Use Tailwind CSS utility classes
- Use `cn()` helper for conditional classes
- Keep shadcn/ui components in `components/ui/`
- Custom components in `components/[feature]/`

```typescript
<div className={cn('flex items-center', isActive && 'bg-primary')} />
```

## Git Workflow

1. Create a feature branch from `main`:

```bash
git checkout -b feature/your-feature-name
```

2. Make your changes following the patterns above
3. Run checks before committing:

```bash
npm run type-check
npm run lint:fix
npm run format
```

4. Commit with clear messages:

```bash
git commit -m "feat: add user profile page"
```

### Commit Message Format

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `style:` Code style changes (formatting)
- `refactor:` Code refactoring
- `test:` Adding tests
- `chore:` Maintenance tasks

## Pre-push Hooks

Husky will automatically run before push:

- TypeScript type checking
- ESLint linting
- Prettier format check

If any check fails, the push will be blocked. Fix the issues and try again.

## Testing (Future)

When adding tests:

- Place test files next to the file being tested
- Name test files `*.test.ts` or `*.test.tsx`
- Use Jest and React Testing Library
- Aim for high coverage on business logic

## Adding New Features

### Adding a New Page

1. Create page in `app/` directory
2. If protected, add `ProtectedRoute` in layout
3. Update navigation if needed

### Adding shadcn/ui Components

```bash
npx shadcn@latest add [component-name]
```

### Adding a New Service

1. Create service in `services/`
2. Create types in `types/`
3. Create custom hook in `hooks/`
4. Use in components

## File Organization

```
/app              - Next.js pages & routing
/components
  /ui             - shadcn components
  /auth           - Auth-specific components
  /layout         - Layout components
  /[feature]      - Feature-specific components
/hooks            - Custom React hooks
/lib              - Utilities, configs, validations
/services         - API service layer
/stores           - Zustand stores
/types            - TypeScript type definitions
```

## Best Practices

1. **DRY** - Don't Repeat Yourself
2. **Single Responsibility** - One component, one job
3. **Composition** - Build complex UIs from simple components
4. **Error Handling** - Always handle errors gracefully
5. **Loading States** - Show loading indicators for async operations
6. **Type Safety** - Leverage TypeScript fully

## Questions?

If you're unsure about a pattern or approach, please open an issue for discussion before implementing.
