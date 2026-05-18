---
name: frontend-patterns
description: Frontend component patterns for React, Vue, Next.js, and Svelte — state management, API integration, form handling, auth flows, and performance optimization.
version: 1.0.0
triggers: [frontend, react, vue, nextjs, svelte, component, state, ui-patterns]
tags: [frontend, react, vue, nextjs, svelte, ui, patterns]
---

# Frontend Patterns Skill

Production patterns for the 4 supported frontend frameworks.

## Universal Patterns

### API Client (Framework-Agnostic)
```javascript
class ApiClient {
  constructor(baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000') {
    this.baseUrl = baseUrl;
  }
  
  async request(path, { method = 'GET', body, token } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    
    const res = await fetch(`${this.baseUrl}${path}`, {
      method, headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(err.message || 'Request failed');
    }
    
    return res.json();
  }
}
```

### Auth Context Pattern (React)
```jsx
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      api.getMe(token).then(setUser).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);
  
  const login = async (credentials) => {
    const { token, user } = await api.login(credentials);
    localStorage.setItem('token', token);
    setUser(user);
  };
  
  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };
  
  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>;
}
```

### Form with Validation
```jsx
function LoginForm({ onSubmit }) {
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  
  const validate = (data) => {
    const errs = {};
    if (!data.email.includes('@')) errs.email = 'Invalid email';
    if (data.password.length < 8) errs.password = 'Min 8 characters';
    return errs;
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    const errs = validate(data);
    if (Object.keys(errs).length) { setErrors(errs); return; }
    
    setLoading(true);
    try { await onSubmit(data); }
    catch (err) { setErrors({ form: err.message }); }
    finally { setLoading(false); }
  };
}
```

## Framework-Specific Patterns

### React
- Use `useState` + `useReducer` for local state
- Use React Query / TanStack Query for server state
- Use React Router v6 with `<Outlet>` pattern
- Lazy load routes: `const Page = lazy(() => import('./Page'))`

### Vue 3
- Use Composition API (`<script setup>`)
- Use `Pinia` for state management (not Vuex)
- Use `vue-router` with navigation guards for auth
- Use `vee-validate` for form validation

### Next.js
- Use App Router with server components by default
- Use `next-auth` for authentication
- Use `SWR` for client-side data fetching
- Use `next/image` for all images (optimization)
- API routes in `app/api/route.ts`

### Svelte 5
- Use runes (`$state`, `$derived`, `$effect`)
- Use `svelte-query` for async data
- Use `@sveltejs/kit` route groups for auth layout
