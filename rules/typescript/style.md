# TypeScript Rules — Always Follow

## Type Safety

- `strict: true` in tsconfig.json — non-negotiable
- No `any` types without a `// eslint-disable` comment explaining why
- Use `unknown` instead of `any` for truly unknown types
- No type assertions (`as X`) without a comment explaining why it's safe
- Prefer `interface` over `type` for object shapes (better error messages)
- Use `type` for unions, intersections, and utility types

## Function Signatures

```typescript
// Always explicit return types on exported functions
export async function createUser(input: CreateUserInput): Promise<User> { }

// Use object params for 3+ args
function buildQuery({ table, where, limit }: QueryOptions): string { }

// Never: positional params for 3+ args
function buildQuery(table: string, where: object, limit: number): string { }
```

## Null Safety

```typescript
// Use optional chaining
const city = user?.address?.city;

// Use nullish coalescing
const name = user?.name ?? 'Anonymous';

// Never use non-null assertion (!) without a comment
const el = document.getElementById('app')!; // always present in index.html
```

## Async/Await

```typescript
// Always try/catch in async functions
async function fetchUser(id: string): Promise<User> {
  try {
    const res = await api.get(`/users/${id}`);
    return res.data;
  } catch (err) {
    throw new AppError(`Failed to fetch user ${id}`, { cause: err });
  }
}

// Never floating promises — always await or .catch()
await fireAndForget().catch(logger.error);
```

## Exports

- Named exports preferred over default exports (better refactoring support)
- One class/interface per file for complex types
- Barrel files (`index.ts`) only for public APIs, not internal modules

## Error Types

```typescript
// Custom error classes for domain errors
class ValidationError extends Error {
  constructor(public field: string, message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}
```

## File Size Limits

- Files: ≤800 lines
- Functions: ≤50 lines
- Classes: ≤300 lines
- Complexity (cyclomatic): ≤10 per function
