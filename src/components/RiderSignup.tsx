import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Bike } from 'lucide-react';
import { supabase } from '../lib/supabase';

const RiderSignup: React.FC = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
    plateNumber: '',
    vehicleType: 'motorcycle' as 'motorcycle' | 'bicycle' | 'car',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const update = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: { role: 'rider', name: form.name },
      },
    });

    if (signUpError || !signUpData.user) {
      setError(signUpError?.message ?? 'Signup failed');
      setLoading(false);
      return;
    }

    const { error: insertError } = await supabase.from('riders').insert({
      id: signUpData.user.id,
      name: form.name,
      phone: form.phone,
      plate_number: form.plateNumber,
      vehicle_type: form.vehicleType,
    });

    if (insertError) {
      setError(insertError.message);
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-xl shadow-lg p-8 w-full max-w-md text-center">
          <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
            <Bike className="h-8 w-8 text-green-600" />
          </div>
          <h1 className="text-xl font-semibold text-black mb-2">Application received</h1>
          <p className="text-gray-600 mb-6">
            Your rider account is awaiting admin approval. We'll notify you by email once approved.
          </p>
          <button
            onClick={() => navigate('/rider/login')}
            className="w-full bg-red-600 text-white py-3 rounded-lg hover:bg-red-700"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-8">
      <div className="bg-white rounded-xl shadow-lg p-8 w-full max-w-md">
        <div className="text-center mb-6">
          <div className="mx-auto w-16 h-16 bg-red-600 rounded-full flex items-center justify-center mb-4">
            <Bike className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-playfair font-semibold text-black">Become a Rider</h1>
          <p className="text-gray-600 mt-1 text-sm">Sign up and wait for admin approval</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Full name" value={form.name} onChange={(v) => update('name', v)} required />
          <Field label="Email" type="email" value={form.email} onChange={(v) => update('email', v)} required />
          <Field label="Password" type="password" value={form.password} onChange={(v) => update('password', v)} required />
          <Field label="Phone number" value={form.phone} onChange={(v) => update('phone', v)} required placeholder="+639..." />
          <Field label="Plate number" value={form.plateNumber} onChange={(v) => update('plateNumber', v)} required />
          <div>
            <label className="block text-sm font-medium text-black mb-2">Vehicle type</label>
            <select
              value={form.vehicleType}
              onChange={(e) => update('vehicleType', e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-600 focus:border-transparent"
            >
              <option value="motorcycle">Motorcycle</option>
              <option value="bicycle">Bicycle</option>
              <option value="car">Car</option>
            </select>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-red-600 text-white py-3 rounded-lg hover:bg-red-700 disabled:opacity-50"
          >
            {loading ? 'Creating account...' : 'Create Rider Account'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <Link to="/rider/login" className="text-gray-600 hover:text-gray-800 text-sm">
            Already a rider? Log in
          </Link>
        </div>
      </div>
    </div>
  );
};

interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
}

const Field: React.FC<FieldProps> = ({ label, value, onChange, type = 'text', required, placeholder }) => (
  <div>
    <label className="block text-sm font-medium text-black mb-2">{label}</label>
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      placeholder={placeholder}
      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-600 focus:border-transparent"
    />
  </div>
);

export default RiderSignup;
