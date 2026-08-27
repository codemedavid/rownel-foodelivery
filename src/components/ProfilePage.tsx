import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { LogOut, ReceiptText, Shield, Truck, User, UtensilsCrossed } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

type AuthMode = 'signin' | 'register';

function GuestProfile() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<AuthMode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setNotice('');
    setIsSubmitting(true);

    const { error } =
      mode === 'signin'
        ? await signIn(email, password)
        : await signUp(email, password, name.trim());

    setIsSubmitting(false);
    if (error) {
      setFormError(error.message);
      return;
    }
    if (mode === 'register') {
      setNotice('Account created! Check your email if confirmation is required.');
    }
  };

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setFormError('');
    setNotice('');
  };

  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <div className="text-center mb-6">
        <div className="mx-auto w-16 h-16 bg-red-600 rounded-full flex items-center justify-center mb-4">
          <User className="h-8 w-8 text-white" />
        </div>
        <h2 className="text-xl font-semibold text-gray-900">
          {mode === 'signin' ? 'Welcome back' : 'Create your account'}
        </h2>
        <p className="text-gray-500 text-sm mt-2">
          An account is optional — you can order as a guest anytime. Signing in keeps your
          order history on every device.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        {mode === 'register' && (
          <div className="mb-4">
            <label htmlFor="profile-name" className="block text-sm font-medium text-black mb-2">
              Name
            </label>
            <input
              id="profile-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
              placeholder="Your name"
              required
            />
          </div>
        )}

        <div className="mb-4">
          <label htmlFor="profile-email" className="block text-sm font-medium text-black mb-2">
            Email
          </label>
          <input
            id="profile-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
            placeholder="you@example.com"
            required
          />
        </div>

        <div className="mb-4">
          <label htmlFor="profile-password" className="block text-sm font-medium text-black mb-2">
            Password
          </label>
          <input
            id="profile-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
            placeholder="Your password"
            minLength={6}
            required
          />
        </div>

        {formError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-600 text-sm">{formError}</p>
          </div>
        )}
        {notice && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-green-700 text-sm">{notice}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-3 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition-colors disabled:opacity-60"
        >
          {mode === 'signin' ? 'Sign In' : 'Create Account'}
        </button>
      </form>

      <div className="text-center mt-4">
        {mode === 'signin' ? (
          <button
            type="button"
            onClick={() => switchMode('register')}
            className="text-sm text-red-600 font-medium hover:underline"
          >
            New here? Create account
          </button>
        ) : (
          <button
            type="button"
            onClick={() => switchMode('signin')}
            className="text-sm text-red-600 font-medium hover:underline"
          >
            Already have an account? Sign in
          </button>
        )}
      </div>
    </div>
  );
}

function SignedInProfile() {
  const { user, signOut, isAdmin, isStaff, isRider } = useAuth();
  const displayName =
    (user?.user_metadata?.full_name as string | undefined) || user?.email || 'Account';

  const shortcuts = [
    isAdmin && { to: '/admin', label: 'Admin Dashboard', icon: Shield },
    isStaff && { to: '/staff/orders', label: 'Staff Orders', icon: UtensilsCrossed },
    isRider && { to: '/rider/dashboard', label: 'Rider Dashboard', icon: Truck },
  ].filter(Boolean) as Array<{ to: string; label: string; icon: React.ElementType }>;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow-sm p-6 text-center">
        <div className="mx-auto w-16 h-16 bg-red-600 rounded-full flex items-center justify-center mb-4">
          <User className="h-8 w-8 text-white" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900">{displayName}</h2>
        <p className="text-gray-500 text-sm">{user?.email}</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
        <Link
          to="/orders"
          className="flex items-center gap-3 px-5 py-4 text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <ReceiptText size={20} className="text-red-600" />
          <span className="font-medium">My Orders</span>
        </Link>
        {shortcuts.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className="flex items-center gap-3 px-5 py-4 text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <Icon size={20} className="text-red-600" />
            <span className="font-medium">{label}</span>
          </Link>
        ))}
        <button
          type="button"
          onClick={() => signOut()}
          className="w-full flex items-center gap-3 px-5 py-4 text-red-600 hover:bg-red-50 transition-colors"
        >
          <LogOut size={20} />
          <span className="font-medium">Sign Out</span>
        </button>
      </div>
    </div>
  );
}

/** Customer profile tab: optional sign in / registration, account shortcuts. */
const ProfilePage: React.FC = () => {
  const { user, loading } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <h1 className="text-xl font-bold text-gray-800">Profile</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6">
        {loading ? (
          <div className="bg-white rounded-xl shadow-sm p-8 text-center">
            <div className="animate-spin w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full mx-auto" />
          </div>
        ) : user ? (
          <SignedInProfile />
        ) : (
          <GuestProfile />
        )}
      </div>
    </div>
  );
};

export default ProfilePage;
