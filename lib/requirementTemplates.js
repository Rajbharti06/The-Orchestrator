function templatesForPrompt(prompt) {
  const p = String(prompt || '').toLowerCase();
  const out = [];
  const add = (type, value, priority) => out.push({ type, value, priority });
  const has = (...keys) => keys.some(k => p.includes(k));

  if (has('auth', 'login', 'register', 'password', 'jwt', 'signup')) {
    add('endpoint', '/login',    'critical');
    add('endpoint', '/register', 'critical');
    add('endpoint', '/refresh',  'high');
    add('endpoint', '/reset',    'high');
    add('capability', 'jwt',              'critical');
    add('capability', 'password-hashing', 'critical');
    add('schema',     'users',            'high');
  }

  if (has('chat', 'messag', 'dm', 'channel', 'realtime', 'real-time')) {
    add('endpoint', '/messages', 'high');
    add('endpoint', '/rooms',    'medium');
    add('capability', 'websocket', 'high');
    add('capability', 'database',  'high');
    add('schema', 'users',    'high');
    add('schema', 'messages', 'high');
  }

  if (has('fintech', 'finance', 'bank', 'payment', 'transaction', 'wallet')) {
    add('endpoint', '/transactions', 'high');
    add('endpoint', '/accounts',     'high');
    add('endpoint', '/balance',      'medium');
    add('capability', 'database', 'high');
    add('schema', 'users',        'high');
    add('schema', 'transactions', 'high');
    add('schema', 'accounts',     'high');
  }

  if (has('ecommerce', 'store', 'cart', 'product', 'checkout', 'shop')) {
    add('endpoint', '/products',  'high');
    add('endpoint', '/cart',      'high');
    add('endpoint', '/checkout',  'high');
    add('endpoint', '/orders',    'high');
    add('capability', 'database', 'high');
    add('schema', 'products', 'high');
    add('schema', 'orders',   'high');
    add('schema', 'users',    'high');
  }

  if (has('blog', 'post', 'article', 'cms', 'content')) {
    add('endpoint', '/posts',       'high');
    add('endpoint', '/categories',  'medium');
    add('endpoint', '/tags',        'low');
    add('capability', 'database',   'high');
    add('schema', 'posts',      'high');
    add('schema', 'categories', 'medium');
    add('schema', 'users',      'high');
  }

  if (has('social', 'follow', 'feed', 'like', 'comment', 'profile')) {
    add('endpoint', '/feed',       'high');
    add('endpoint', '/profile',    'high');
    add('endpoint', '/follow',     'medium');
    add('endpoint', '/likes',      'medium');
    add('endpoint', '/comments',   'medium');
    add('capability', 'database',  'high');
    add('schema', 'users',   'high');
    add('schema', 'posts',   'high');
    add('schema', 'follows', 'medium');
  }

  if (has('saas', 'dashboard', 'analytics', 'metric', 'report', 'chart')) {
    add('endpoint', '/dashboard',   'high');
    add('endpoint', '/analytics',   'high');
    add('endpoint', '/reports',     'medium');
    add('capability', 'database',   'high');
    add('schema', 'users',   'high');
    add('schema', 'events',  'medium');
    add('schema', 'metrics', 'medium');
  }

  if (has('ai', 'ml', 'predict', 'inference', 'model', 'classify')) {
    add('endpoint', '/predict', 'high');
    add('endpoint', '/infer',   'high');
    add('endpoint', '/jobs',    'medium');
    add('capability', 'database', 'medium');
    add('schema', 'predictions', 'high');
    add('schema', 'jobs',        'medium');
  }

  if (has('todo', 'task', 'project management', 'kanban', 'board')) {
    add('endpoint', '/tasks',    'high');
    add('endpoint', '/projects', 'high');
    add('endpoint', '/boards',   'medium');
    add('capability', 'database', 'high');
    add('schema', 'tasks',    'high');
    add('schema', 'projects', 'high');
    add('schema', 'users',    'high');
  }

  return out;
}

module.exports = { templatesForPrompt };
