import { useState } from 'react';
import { Users, Search, Database, AlertTriangle, HelpCircle } from 'lucide-react';
import ConfirmationModal from '../../components/ConfirmationModal';
import { useToast } from '../../context/ToastContext';

export default function AdminUsers() {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState(null);
    const { addToast } = useToast();

    // Mock User Data
    const users = [
        { id: 1, name: 'Alice Smith', email: 'alice@univ.edu', used: 12.4, quota: 20, lastActive: '2 mins ago' },
        { id: 2, name: 'Bob Jones', email: 'bob@univ.edu', used: 4.1, quota: 20, lastActive: '1 day ago' },
        { id: 3, name: 'Charlie Day', email: 'charlie@univ.edu', used: 18.9, quota: 20, lastActive: '5 hours ago' },
        { id: 4, name: 'Dana White', email: 'dana@univ.edu', used: 0.5, quota: 50, lastActive: '1 week ago' },
    ];

    const handleResetQuotaClick = (user) => {
        setSelectedUser(user);
        setIsModalOpen(true);
    };

    const handleConfirmReset = () => {
        addToast(`Quota reset for ${selectedUser.name}`, 'success');
        setIsModalOpen(false);
        // User data update logic would go here
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold">User Allocations</h1>
                <button className="btn btn-primary" onClick={() => addToast('Feature coming soon', 'info')}>Add Student</button>
            </div>

            <div className="card">
                {/* Toolbar */}
                <div className="p-4 border-b border-[--border-color] flex justify-between items-center bg-[--bg-secondary]">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[--text-muted]" />
                        <input
                            type="text"
                            placeholder="Search students..."
                            className="pl-9 pr-4 py-2 rounded-md bg-[--bg-primary] border border-[--border-color] text-sm focus:outline-none focus:border-[--accent-primary]"
                        />
                    </div>
                    <div className="flex gap-2">
                        <span className="text-sm text-[--text-secondary] flex items-center gap-1" title="Total active students">
                            <Users className="w-4 h-4" /> {users.length} Total Users
                        </span>
                    </div>
                </div>

                {/* Table */}
                <table className="w-full text-left">
                    <thead className="text-xs uppercase text-[--text-muted] bg-[--bg-tertiary]">
                        <tr>
                            <th className="px-6 py-3">Student</th>
                            <th className="px-6 py-3 flex items-center gap-1 group cursor-help" title="Percentage of assigned storage currently consumed">
                                Storage Usage
                                <HelpCircle className="w-3 h-3 opacity-50 group-hover:opacity-100" />
                            </th>
                            <th className="px-6 py-3">Last Active</th>
                            <th className="px-6 py-3 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[--border-color]">
                        {users.map(user => (
                            <tr key={user.id} className="hover:bg-[--bg-tertiary]/20">
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-blue-500/20 text-blue-500 flex items-center justify-center font-bold text-xs">
                                            {user.name.charAt(0)}
                                        </div>
                                        <div>
                                            <p className="font-medium text-sm">{user.name}</p>
                                            <p className="text-xs text-[--text-secondary]">{user.email}</p>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="w-48">
                                        <div className="flex justify-between text-xs mb-1">
                                            <span>{user.used} GB</span>
                                            <span className="text-[--text-muted]">of {user.quota} GB</span>
                                        </div>
                                        <div className="h-1.5 w-full bg-[--bg-primary] rounded-full overflow-hidden">
                                            <div
                                                className={`h-full rounded-full ${user.used / user.quota > 0.9 ? 'bg-[--status-error]' : 'bg-[--accent-primary]'}`}
                                                style={{ width: `${(user.used / user.quota) * 100}%` }}
                                            ></div>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-sm text-[--text-secondary]">
                                    {user.lastActive}
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <button
                                        onClick={() => handleResetQuotaClick(user)}
                                        className="text-[--status-error] text-sm hover:underline hover:text-red-400"
                                    >
                                        Reset Quota
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <ConfirmationModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onConfirm={handleConfirmReset}
                title="Reset Storage Quota?"
                message={`Are you sure you want to reset the storage quota for ${selectedUser?.name}? This will delete all their non-permanent files.`}
                confirmText="Reset Quota"
                confirmStyle="danger"
            />
        </div>
    );
}
