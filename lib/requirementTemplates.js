function templatesForPrompt(prompt) {
  const p = String(prompt || '').toLowerCase();
  const out = [];
  const add = (type, value, priority) => out.push({ type, value, priority });
  const has = (...keys) => keys.some(k => p.includes(k));
  if (has('auth', 'login', 'register', 'password', 'jwt')) {
    add('endpoint', '/login', 'critical');
    add('endpoint', '/register', 'critical');
    add('endpoint', '/refresh', 'high');
    add('endpoint', '/reset', 'high');
    add('capability', 'jwt', 'critical');
    add('capability', 'password-hashing', 'critical');
    add('schema', 'users', 'high');
  }
  if (has('chat', 'messag', 'dm', 'channel')) {
    add('endpoint', '/messages', 'high');
    add('endpoint', '/rooms', 'medium');
    add('capability', 'websocket', 'high');
    add('capability', 'database', 'high');
    add('schema', 'users', 'high');
    add('schema', 'messages', 'high');
  }
  if (has('fintech', 'finance', 'bank', 'payment', 'transaction')) {
    add('endpoint', '/transactions', 'high');
    add('endpoint', '/accounts', 'high');
    add('capability', 'database', 'high');
    add('schema', 'users', 'high');
    add('schema', 'transactions', 'high');
    add('schema', 'accounts', 'high');
  }
  if (has('ecommerce', 'store', 'cart', 'product', 'checkout')) {
    add('endpoint', '/products', 'high');
    add('endpoint', '/cart', 'high');
    add('endpoint', '/checkout', 'high');
    add('capability', 'database', 'high');
    add('schema', 'products', 'high');
    add('schema', 'orders', 'high');
    add('schema', 'users', 'high');
  }
  return out;
}
module.exports = { templatesForPrompt };
