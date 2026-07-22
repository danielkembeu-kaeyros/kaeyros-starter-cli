# Next.js Startup Boilerplate

A production-ready Next.js 15 boilerplate with TypeScript, authentication, and best practices built in. Perfect for quickly starting new projects with a solid foundation and consistent patterns.

## Features

- ⚡️ **Next.js 15** - App Router, Server Components, React 19
- 🔷 **TypeScript** - Strict mode with recommended rules
- 🎨 **Tailwind CSS** - Utility-first styling
- 🧩 **shadcn/ui** - High-quality component library
- 🔐 **Authentication** - JWT with access/refresh token logic
- 📝 **Form Handling** - react-hook-form with Zod validation
- 🗂️ **State Management** - Zustand for global state
- 🔄 **Data Fetching** - TanStack Query (React Query) with caching
- 🌐 **API Client** - Axios with interceptors and auto token refresh
- ✅ **Code Quality** - ESLint, Prettier, Husky pre-push hooks
- 📁 **Well-Structured** - Organized folder patterns

## Getting Started

### Prerequisites

- Node.js 18+ and npm

### Installation

1. Clone or use this boilerplate:

```bash
git clone <your-repo-url>
cd nextjs-startup-boilerplate
```

2. Install dependencies:

```bash
npm install
```

3. Set up environment variables:

```bash
cp .env.example .env
```

Edit `.env` and configure your API URL:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api
```

4. Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

## Project Structure

```
nextjs-startup-boilerplate/
├── app/                        # Next.js App Router pages
│   ├── dashboard/             # Protected dashboard pages
│   ├── login/                 # Login page
│   ├── layout.tsx             # Root layout with providers
│   ├── page.tsx               # Landing page
│   └── globals.css            # Global styles
├── components/                # React components
│   ├── ui/                    # shadcn/ui components
│   ├── auth/                  # Auth-specific components
│   └── layout/                # Layout components
├── hooks/                     # Custom React hooks
│   └── use-auth.ts            # Authentication hook
├── lib/                       # Utilities and configurations
│   ├── utils.ts               # Helper functions (cn, etc.)
│   ├── constants.ts           # App constants
│   ├── validations.ts         # Zod schemas
│   └── react-query.tsx        # React Query provider
├── services/                  # API services
│   ├── api.service.ts         # Axios instance with interceptors
│   └── auth.service.ts        # Auth API calls
├── stores/                    # Zustand stores
│   └── auth.store.ts          # Auth state management
└── types/                     # TypeScript types
    └── index.ts               # Shared types
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint errors
- `npm run format` - Format code with Prettier
- `npm run format:check` - Check code formatting
- `npm run type-check` - Run TypeScript compiler check

## Architecture Patterns

### Authentication Flow

1. **Login**: User submits credentials → `authService.login()` → tokens stored in localStorage
2. **API Requests**: Axios interceptor adds access token to all requests
3. **Token Refresh**: On 401 error, refresh token is used to get new access token
4. **Logout**: Tokens cleared from localStorage and user redirected to login

### State Management

- **Zustand** for global state (auth user, UI state)
- **React Query** for server state (API data, caching, revalidation)
- Avoid prop drilling by using hooks (`useAuth`, `useQuery`)

### Form Handling

Forms use **react-hook-form** with **Zod** validation:

```typescript
const {
  register,
  handleSubmit,
  formState: { errors },
} = useForm({
  resolver: zodResolver(loginSchema),
});
```

### API Services

Centralized API calls in `services/` folder:

```typescript
// services/auth.service.ts
export const authService = {
  login: async (credentials) => { ... },
  logout: async () => { ... },
};
```

Axios instance with automatic token refresh in `services/api.service.ts`.

### Route Protection

Protected routes use the `ProtectedRoute` component:

```typescript
// app/dashboard/layout.tsx
export default function DashboardLayout({ children }) {
  return <ProtectedRoute>{children}</ProtectedRoute>;
}
```

### Code Quality

Pre-push hooks run automatically:

- TypeScript type checking
- ESLint linting
- Prettier formatting check

## Adding New Pages

### Public Page

1. Create page in `app/` directory:

```typescript
// app/about/page.tsx
export default function AboutPage() {
  return <div>About</div>;
}
```

### Protected Page

1. Create folder in `app/` with layout:

```typescript
// app/settings/layout.tsx
import { ProtectedRoute } from '@/components/auth/protected-route';

export default function SettingsLayout({ children }) {
  return <ProtectedRoute>{children}</ProtectedRoute>;
}
```

2. Create page:

```typescript
// app/settings/page.tsx
export default function SettingsPage() {
  return <div>Settings</div>;
}
```

## Adding shadcn/ui Components

Install components using the CLI:

```bash
npx shadcn@latest add button
npx shadcn@latest add card
npx shadcn@latest add input
```

## Environment Variables

| Variable              | Description     | Default                     |
| --------------------- | --------------- | --------------------------- |
| `NEXT_PUBLIC_API_URL` | Backend API URL | `http://localhost:3001/api` |

## Backend API Requirements

Your backend API should implement these endpoints:

- `POST /auth/login` - Login with email/password, returns `{ user, tokens }`
- `POST /auth/register` - Register new user
- `POST /auth/refresh` - Refresh access token using refresh token
- `POST /auth/logout` - Logout user
- `GET /auth/me` - Get current user

Example response format:

```json
{
  "user": {
    "id": "123",
    "email": "user@example.com",
    "name": "John Doe"
  },
  "tokens": {
    "accessToken": "eyJhbGc...",
    "refreshToken": "eyJhbGc..."
  }
}
```

## Customization Tips

### Changing Theme

Edit `app/globals.css` to customize colors:

```css
:root {
  --primary: 240 5.9% 10%;
  --secondary: 240 4.8% 95.9%;
  /* ... */
}
```

### Adding a New API Service

1. Create service file in `services/`:

```typescript
// services/users.service.ts
import apiClient from './api.service';

export const usersService = {
  getUsers: async () => {
    const response = await apiClient.get('/users');
    return response.data;
  },
};
```

2. Create custom hook:

```typescript
// hooks/use-users.ts
import { useQuery } from '@tanstack/react-query';
import { usersService } from '@/services/users.service';

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: usersService.getUsers,
  });
}
```

### Adding a New Zustand Store

```typescript
// stores/ui.store.ts
import { create } from 'zustand';

interface UIState {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
}

export const useUIStore = create<UIState>(set => ({
  sidebarOpen: true,
  toggleSidebar: () => set(state => ({ sidebarOpen: !state.sidebarOpen })),
}));
```

## Tech Stack

- **Framework**: Next.js 15.1.3
- **Language**: TypeScript 5.7
- **React**: React 19.0
- **Styling**: Tailwind CSS 3.4
- **Components**: shadcn/ui (Radix UI)
- **State**: Zustand
- **Data Fetching**: TanStack Query (React Query)
- **Forms**: react-hook-form + Zod
- **HTTP Client**: Axios
- **Code Quality**: ESLint + Prettier + Husky

## Best Practices

1. **Keep components small** - Break down large components
2. **Use TypeScript strictly** - Enable all strict mode options
3. **Validate inputs** - Use Zod schemas for all forms
4. **Handle errors** - Use try/catch and error boundaries
5. **Cache strategically** - Configure React Query cache times
6. **Protect routes** - Use ProtectedRoute for authenticated pages
7. **Follow naming conventions** - PascalCase for components, camelCase for functions
8. **Comment complex logic** - Help future developers understand

## Contributing

When contributing to this boilerplate:

1. Run `npm run lint:fix` before committing
2. Ensure `npm run type-check` passes
3. Format code with `npm run format`
4. Pre-push hooks will run automatically

## License

ISC

## Support

For issues or questions, please open an issue in the repository.
