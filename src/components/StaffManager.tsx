import React, { useState } from 'react';
import { ArrowLeft, Plus, UserCheck, UserX, Users, X, Pencil, Globe } from 'lucide-react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { supabase } from '../lib/supabase';
import { useMerchants } from '../hooks/useMerchants';

interface StaffManagerProps {
  onBack: () => void;
}

const StaffManager: React.FC<StaffManagerProps> = ({ onBack }) => {
  const staffList = useQuery(api.staff.listAll);
  const createStaff = useMutation(api.staff.create);
  const updateStaff = useMutation(api.staff.update);
  const deactivateStaff = useMutation(api.staff.deactivate);
  const activateStaff = useMutation(api.staff.activate);
  const { merchants } = useMerchants();

  const [showAddForm, setShowAddForm] = useState(false);
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    merchantIds: [] as string[],
    allMerchants: false,
  });

  // Edit form state (merchant assignments only)
  const [editMerchantIds, setEditMerchantIds] = useState<string[]>([]);
  const [editAllMerchants, setEditAllMerchants] = useState(false);

  const merchantMap = new Map(merchants.map((m) => [m.id, m.name]));

  const resetForm = () => {
    setFormData({ name: '', email: '', password: '', merchantIds: [], allMerchants: false });
    setShowAddForm(false);
  };

  const toggleMerchantId = (id: string, current: string[], setter: (ids: string[]) => void) => {
    setter(current.includes(id) ? current.filter((x) => x !== id) : [...current, id]);
  };

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!formData.allMerchants && formData.merchantIds.length === 0) {
      setError('Select at least one merchant or enable "All Merchants".');
      return;
    }

    setIsSubmitting(true);

    try {
      const { data: currentSession } = await supabase.auth.getSession();

      let supabaseUserId: string | undefined;

      try {
        const { data: adminData, error: adminError } = await supabase.auth.admin.createUser({
          email: formData.email,
          password: formData.password,
          user_metadata: { role: 'staff', name: formData.name },
          email_confirm: true,
        });
        if (adminError) throw adminError;
        supabaseUserId = adminData.user?.id;
      } catch {
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email: formData.email,
          password: formData.password,
          options: { data: { role: 'staff', name: formData.name } },
        });
        if (signUpError) throw signUpError;
        supabaseUserId = signUpData.user?.id;
      }

      if (!supabaseUserId) {
        throw new Error('Failed to create Supabase user — no user ID returned.');
      }

      await createStaff({
        supabaseUserId,
        email: formData.email,
        name: formData.name,
        merchantIds: formData.merchantIds,
        allMerchants: formData.allMerchants,
      });

      if (currentSession?.session) {
        await supabase.auth.setSession({
          access_token: currentSession.session.access_token,
          refresh_token: currentSession.session.refresh_token,
        });
      }

      setSuccess(`Staff account created for ${formData.name} (${formData.email})`);
      resetForm();
    } catch (err) {
      console.error('Error creating staff:', err);
      setError(err instanceof Error ? err.message : 'Failed to create staff account');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartEdit = (staff: any) => {
    const ids = staff.merchantIds ?? (staff.merchantId ? [staff.merchantId] : []);
    setEditMerchantIds(ids);
    setEditAllMerchants(staff.allMerchants ?? false);
    setEditingStaffId(staff._id);
  };

  const handleSaveEdit = async (staffId: string) => {
    if (!editAllMerchants && editMerchantIds.length === 0) {
      setError('Select at least one merchant or enable "All Merchants".');
      return;
    }
    try {
      setError(null);
      await updateStaff({
        staffId: staffId as any,
        merchantIds: editMerchantIds,
        allMerchants: editAllMerchants,
      });
      setEditingStaffId(null);
      setSuccess('Staff merchant assignments updated.');
    } catch (err) {
      console.error('Error updating staff:', err);
      setError(err instanceof Error ? err.message : 'Failed to update staff');
    }
  };

  const handleToggleActive = async (staffId: string, isActive: boolean) => {
    try {
      setError(null);
      if (isActive) {
        await deactivateStaff({ staffId: staffId as any });
      } else {
        await activateStaff({ staffId: staffId as any });
      }
    } catch (err) {
      console.error('Error toggling staff status:', err);
      setError(err instanceof Error ? err.message : 'Failed to update staff status');
    }
  };

  /** Resolve merchant display for a staff record (backward compat) */
  const getStaffMerchantDisplay = (staff: any) => {
    if (staff.allMerchants) return null; // handled separately with badge
    const ids: string[] = staff.merchantIds ?? (staff.merchantId ? [staff.merchantId] : []);
    return ids.map((id: string) => merchantMap.get(id) || id).join(', ') || 'No merchant';
  };

  // ---- Merchant checkbox list (reused in create + edit) ----
  const MerchantCheckboxList = ({
    selectedIds,
    onToggle,
    allMerchants: am,
    onToggleAll,
  }: {
    selectedIds: string[];
    onToggle: (id: string) => void;
    allMerchants: boolean;
    onToggleAll: (val: boolean) => void;
  }) => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">Merchant Access</label>
      <label className="flex items-center gap-2 mb-3 cursor-pointer">
        <input
          type="checkbox"
          checked={am}
          onChange={(e) => onToggleAll(e.target.checked)}
          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
        />
        <Globe className="h-4 w-4 text-indigo-600" />
        <span className="text-sm font-medium text-indigo-700">All Merchants</span>
      </label>
      <div className={`space-y-2 ${am ? 'opacity-40 pointer-events-none' : ''}`}>
        {merchants.map((m) => (
          <label key={m.id} className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={selectedIds.includes(m.id)}
              onChange={() => onToggle(m.id)}
              disabled={am}
              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm text-gray-700">{m.name}</span>
          </label>
        ))}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <button
                onClick={onBack}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="h-5 w-5 text-gray-600" />
              </button>
              <h1 className="text-xl font-semibold text-gray-900">Staff Management</h1>
              {staffList && (
                <span className="bg-gray-100 text-gray-600 text-sm px-2 py-1 rounded-full">
                  {staffList.length} staff
                </span>
              )}
            </div>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="flex items-center space-x-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
            >
              {showAddForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              <span>{showAddForm ? 'Cancel' : 'Add Staff'}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Error Banner */}
        {error && (
          <div className="mb-4 flex items-center justify-between bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            <span>{error}</span>
            <button onClick={() => setError(null)}>
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Success Banner */}
        {success && (
          <div className="mb-4 flex items-center justify-between bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
            <span>{success}</span>
            <button onClick={() => setSuccess(null)}>
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Add Staff Form */}
        {showAddForm && (
          <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Create New Staff Account</h2>
            <form onSubmit={handleCreateStaff} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="Enter full name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="Enter email address"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="Minimum 6 characters"
                />
              </div>
              <MerchantCheckboxList
                selectedIds={formData.merchantIds}
                onToggle={(id) => toggleMerchantId(id, formData.merchantIds, (ids) => setFormData({ ...formData, merchantIds: ids }))}
                allMerchants={formData.allMerchants}
                onToggleAll={(val) => setFormData({ ...formData, allMerchants: val })}
              />
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-indigo-600 text-white py-2 px-4 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSubmitting ? 'Creating...' : 'Create Staff Account'}
              </button>
            </form>
          </div>
        )}

        {/* Staff List */}
        {staffList === undefined ? (
          <div className="text-center py-12 text-gray-500">Loading staff...</div>
        ) : staffList.length === 0 ? (
          <div className="text-center py-12">
            <Users className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg">No staff members yet</p>
            <p className="text-gray-400 text-sm mt-1">Click "Add Staff" to create the first staff account.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {staffList.map((staff) => (
              <div
                key={staff._id}
                className="bg-white rounded-xl shadow-sm p-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-medium text-gray-900 truncate">{staff.name}</h3>
                    <p className="text-sm text-gray-500 truncate">{staff.email}</p>
                    {staff.allMerchants ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800 mt-1">
                        <Globe className="h-3 w-3" />
                        All Merchants
                      </span>
                    ) : (
                      <p className="text-sm text-gray-400 mt-1">{getStaffMerchantDisplay(staff)}</p>
                    )}
                  </div>
                  <div className="flex items-center space-x-2 ml-4">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        staff.isActive
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {staff.isActive ? 'Active' : 'Inactive'}
                    </span>
                    <button
                      onClick={() => handleStartEdit(staff)}
                      className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                      title="Edit merchants"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleToggleActive(staff._id, staff.isActive)}
                      className={`p-2 rounded-lg transition-colors ${
                        staff.isActive
                          ? 'text-red-600 hover:bg-red-50'
                          : 'text-green-600 hover:bg-green-50'
                      }`}
                      title={staff.isActive ? 'Deactivate' : 'Activate'}
                    >
                      {staff.isActive ? (
                        <UserX className="h-5 w-5" />
                      ) : (
                        <UserCheck className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Inline edit panel */}
                {editingStaffId === staff._id && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <MerchantCheckboxList
                      selectedIds={editMerchantIds}
                      onToggle={(id) => toggleMerchantId(id, editMerchantIds, setEditMerchantIds)}
                      allMerchants={editAllMerchants}
                      onToggleAll={setEditAllMerchants}
                    />
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => handleSaveEdit(staff._id)}
                        className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingStaffId(null)}
                        className="px-4 py-2 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default StaffManager;
