# Go Rules — Always Follow

## Code Style

- Run `gofmt` and `golangci-lint` — no exceptions
- Package names: lowercase, single word, no underscores
- Use `go vet` to catch common bugs
- Error wrapping: `fmt.Errorf("creating user: %w", err)`

## Error Handling

```go
// Always handle errors — never ignore them
user, err := repo.GetUser(ctx, id)
if err != nil {
    return fmt.Errorf("getting user %d: %w", id, err)
}

// Custom error types for domain errors
type NotFoundError struct {
    Resource string
    ID       any
}

func (e *NotFoundError) Error() string {
    return fmt.Sprintf("%s %v not found", e.Resource, e.ID)
}

// Sentinel errors for known conditions
var ErrNotFound = errors.New("not found")
```

## Context Propagation

```go
// Always pass ctx as first param, never store in struct
func (s *UserService) GetUser(ctx context.Context, id int64) (*User, error) {
    return s.repo.Get(ctx, id)
}

// Use context for cancellation and timeouts
ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
defer cancel()
```

## Goroutines & Channels

```go
// Always handle goroutine cleanup
var wg sync.WaitGroup
wg.Add(2)
go func() { defer wg.Done(); doWork1() }()
go func() { defer wg.Done(); doWork2() }()
wg.Wait()

// Use errgroup for parallel tasks with error propagation
g, ctx := errgroup.WithContext(ctx)
g.Go(func() error { return fetchUsers(ctx) })
g.Go(func() error { return fetchPosts(ctx) })
if err := g.Wait(); err != nil { ... }
```

## Gin Patterns

```go
// Middleware order: recovery → logger → cors → ratelimit → auth
r := gin.New()
r.Use(gin.Recovery(), gin.Logger(), corsMiddleware(), rateLimiter(), authMiddleware())

// Input binding with validation
type CreateUserRequest struct {
    Email    string `json:"email" binding:"required,email"`
    Password string `json:"password" binding:"required,min=8"`
}

func createUser(c *gin.Context) {
    var req CreateUserRequest
    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(400, gin.H{"error": err.Error()})
        return
    }
}
```

## Project Layout (Standard)

```
cmd/
  server/
    main.go       # Entry point
internal/
  handler/        # HTTP handlers
  service/        # Business logic
  repository/     # DB access
  model/          # Domain models
pkg/
  middleware/     # Reusable middleware
  config/         # Configuration
```
