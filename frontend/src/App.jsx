import React, { useState } from 'react';

const API = 'http://localhost:8000/api/auth';

function App() {
  const [view, setView] = useState('login'); // login | register | dashboard | reset
  const [form, setForm] = useState({ email: '', password: '', username: '' });
  const [token, setToken] = useState(() => localStorage.getItem('access_token') || '');
  const [user, setUser] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  function set(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }));
  }

  async function post(path, body) {
    const res = await fetch(`${API}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Request failed');
    return data;
  }

  async function get(path, accessToken) {
    const res = await fetch(`${API}${path}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Request failed');
    return data;
  }

  async function handleLogin(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const data = await post('/login', { email: form.email, password: form.password });
      localStorage.setItem('access_token', data.access_token);
      localStorage.setItem('refresh_token', data.refresh_token);
      setToken(data.access_token);
      const me = await get('/me', data.access_token);
      setUser(me);
      setView('dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const data = await post('/register', { email: form.email, password: form.password, username: form.username });
      localStorage.setItem('access_token', data.access_token);
      localStorage.setItem('refresh_token', data.refresh_token);
      setToken(data.access_token);
      const me = await get('/me', data.access_token);
      setUser(me);
      setView('dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleReset(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const data = await post('/reset', { email: form.email });
      setMsg(data.msg);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    setToken('');
    setUser(null);
    setView('login');
    setForm({ email: '', password: '', username: '' });
  }

  const inputCls = 'w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
  const btnCls = 'w-full bg-blue-600 text-white py-2 rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition';
  const linkCls = 'text-blue-600 text-sm hover:underline cursor-pointer';

  if (view === 'dashboard') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white shadow rounded-lg p-8 w-80 text-center space-y-4">
          <h1 className="text-xl font-bold text-gray-800">Welcome{user ? `, ${user.username}` : ''}!</h1>
          <p className="text-sm text-gray-500">{user?.email}</p>
          <button onClick={handleLogout} className="w-full border border-red-400 text-red-500 py-2 rounded text-sm hover:bg-red-50 transition">
            Sign out
          </button>
        </div>
      </div>
    );
  }

  if (view === 'reset') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white shadow rounded-lg p-8 w-80 space-y-4">
          <h1 className="text-xl font-bold text-gray-800">Reset Password</h1>
          {msg && <p className="text-green-600 text-sm">{msg}</p>}
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <form onSubmit={handleReset} className="space-y-3">
            <input type="email" placeholder="Email" value={form.email} onChange={set('email')} required className={inputCls} />
            <button type="submit" disabled={loading} className={btnCls}>{loading ? 'Sending…' : 'Send Reset Link'}</button>
          </form>
          <p className="text-center"><span className={linkCls} onClick={() => { setView('login'); setMsg(''); setError(''); }}>Back to login</span></p>
        </div>
      </div>
    );
  }

  if (view === 'register') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white shadow rounded-lg p-8 w-80 space-y-4">
          <h1 className="text-xl font-bold text-gray-800">Create account</h1>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <form onSubmit={handleRegister} className="space-y-3">
            <input type="text" placeholder="Username (optional)" value={form.username} onChange={set('username')} className={inputCls} />
            <input type="email" placeholder="Email" value={form.email} onChange={set('email')} required className={inputCls} />
            <input type="password" placeholder="Password" value={form.password} onChange={set('password')} required className={inputCls} />
            <button type="submit" disabled={loading} className={btnCls}>{loading ? 'Creating…' : 'Register'}</button>
          </form>
          <p className="text-center text-sm text-gray-500">
            Already have an account?{' '}
            <span className={linkCls} onClick={() => { setView('login'); setError(''); }}>Sign in</span>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white shadow rounded-lg p-8 w-80 space-y-4">
        <h1 className="text-xl font-bold text-gray-800">Sign in</h1>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <form onSubmit={handleLogin} className="space-y-3">
          <input type="email" placeholder="Email" value={form.email} onChange={set('email')} required className={inputCls} />
          <input type="password" placeholder="Password" value={form.password} onChange={set('password')} required className={inputCls} />
          <button type="submit" disabled={loading} className={btnCls}>{loading ? 'Signing in…' : 'Login'}</button>
        </form>
        <div className="flex justify-between text-sm">
          <span className={linkCls} onClick={() => { setView('register'); setError(''); }}>Create account</span>
          <span className={linkCls} onClick={() => { setView('reset'); setError(''); }}>Forgot password?</span>
        </div>
      </div>
    </div>
  );
}

export default App;
