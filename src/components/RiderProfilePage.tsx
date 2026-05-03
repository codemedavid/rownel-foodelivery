import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Camera, Loader2, Star, Bike } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useRiderProfile, ratingAverage } from '../hooks/useRiderProfile';
import { compressImage, uploadRiderPhotoToCloudinary } from '../lib/cloudinary';

const VEHICLE_LABELS: Record<string, string> = {
  motorcycle: 'Motorcycle',
  bicycle: 'Bicycle',
  car: 'Car',
};

const RiderProfilePage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile, loading, updateProfile } = useRiderProfile();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Sync form fields when profile loads
  React.useEffect(() => {
    if (profile) {
      setName(profile.name);
      setPhone(profile.phone);
    }
  }, [profile]);

  const handlePhotoClick = () => fileInputRef.current?.click();

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setError('');
    setUploadingPhoto(true);
    try {
      const compressed = await compressImage(file, 800, 0.85);
      const url = await uploadRiderPhotoToCloudinary(compressed, user.id);
      await updateProfile({ photo_url: url });
      setSuccess('Profile photo updated.');
    } catch (err: any) {
      setError(err?.message ?? 'Failed to upload photo.');
    } finally {
      setUploadingPhoto(false);
      e.target.value = '';
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('Name is required.'); return; }
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      await updateProfile({ name: name.trim(), phone: phone.trim() });
      setSuccess('Profile saved.');
    } catch (err: any) {
      setError(err?.message ?? 'Failed to save profile.');
    } finally {
      setSaving(false);
    }
  };

  const avg = ratingAverage(profile);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-red-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate('/rider/dashboard')} className="p-2 -ml-2 text-gray-500 hover:text-gray-800">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="font-semibold text-black">My Profile</h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Photo section */}
        <div className="flex flex-col items-center gap-3">
          <div className="relative">
            <div className="w-24 h-24 rounded-full overflow-hidden bg-red-600 flex items-center justify-center">
              {profile?.photo_url ? (
                <img src={profile.photo_url} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <Bike className="h-10 w-10 text-white" />
              )}
            </div>
            <button
              onClick={handlePhotoClick}
              disabled={uploadingPhoto}
              className="absolute bottom-0 right-0 bg-white border border-gray-300 rounded-full p-1.5 shadow hover:bg-gray-50 disabled:opacity-50"
              aria-label="Change photo"
            >
              {uploadingPhoto ? (
                <Loader2 className="h-4 w-4 animate-spin text-red-600" />
              ) : (
                <Camera className="h-4 w-4 text-gray-700" />
              )}
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handlePhotoChange}
          />
          <p className="text-xs text-gray-500">Tap the camera icon to change your photo</p>
        </div>

        {/* Rating */}
        {profile && (
          <div className="bg-white rounded-xl shadow-sm p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />
              <span className="font-semibold text-black">
                {avg ? avg.toFixed(1) : '—'}
              </span>
              <span className="text-sm text-gray-500">
                ({profile.rating_count} {profile.rating_count === 1 ? 'rating' : 'ratings'})
              </span>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Vehicle</p>
              <p className="text-sm font-medium text-black">{VEHICLE_LABELS[profile.vehicle_type] ?? profile.vehicle_type}</p>
            </div>
          </div>
        )}

        {/* Editable fields */}
        <form onSubmit={handleSave} className="bg-white rounded-xl shadow-sm p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              placeholder="Your name"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              placeholder="+63 9XX XXX XXXX"
            />
          </div>

          {/* Read-only fields */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Plate Number</label>
            <input
              type="text"
              value={profile?.plate_number ?? ''}
              disabled
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="text"
              value={user?.email ?? ''}
              disabled
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-500"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}
          {success && (
            <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">{success}</p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-red-600 text-white py-2.5 rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2 font-medium"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </form>
      </main>
    </div>
  );
};

export default RiderProfilePage;
