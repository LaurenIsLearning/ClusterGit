import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { useToast } from '../../context/ToastContext';
import { Save, User, Key, Bell, Shield } from 'lucide-react';

export default function StudentSettings() {
    const { user } = useApp();
    const { addToast } = useToast();
    const navigate = useNavigate();
    const [apiKey, setApiKey] = useState('cg_sk_live_51M...');
    const [showKey, setShowKey] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(apiKey);
        addToast('API Token copied to clipboard', 'success');
    };

    const handleRegenerate = () => {
        addToast('Token regenerated successfully', 'success');
        setApiKey('cg_sk_live_' + Math.random().toString(36).substring(7));
    };

    const handleSave = () => {
        addToast('Settings saved successfully', 'success');
    };

    const handleCancel = () => {
        addToast('Changes discarded', 'info');
        navigate('/dashboard');
    };

    const handleAvatar = () => {
        addToast('Avatar upload feature coming soon', 'info');
    };

    return (
        <div className="max-w-2xl space-y-8">
            <div>
                <h1 className="text-3xl font-bold mb-2">Account Settings</h1>
                <p className="text-[--text-secondary]">Manage your profile and git credentials.</p>
            </div>

            {/* Profile Section */}
            <div className="card p-6 space-y-6">
                <h2 className="text-xl font-bold flex items-center gap-2">
                    <User className="w-5 h-5" /> Profile Information
                </h2>

                <div className="flex items-center gap-4 mb-6">
                    <div className="h-16 w-16 rounded-full bg-[--bg-tertiary] flex items-center justify-center text-xl font-bold border border-[--border-color]">
                        {user?.avatar || 'ST'}
                    </div>
                    <div>
                        <button onClick={handleAvatar} className="text-sm text-[--accent-primary] hover:underline font-medium">Change Avatar</button>
                        <p className="text-xs text-[--text-secondary]">JPG, GIF or PNG. 1MB max.</p>
                    </div>
                </div>

                <div className="grid gap-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Display Name</label>
                        <input
                            type="text"
                            defaultValue={user?.name}
                            className="w-full p-2 rounded-md bg-[--bg-primary] border border-[--border-color] focus:border-[--accent-primary] outline-none"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Email Address</label>
                        <input
                            type="email"
                            defaultValue={user?.email}
                            disabled
                            className="w-full p-2 rounded-md bg-[--bg-tertiary] border border-[--border-color] text-[--text-muted] cursor-not-allowed"
                        />
                    </div>
                </div>
            </div>

            {/* Git Credentials */}
            <div className="card p-6 space-y-6">
                <h2 className="text-xl font-bold flex items-center gap-2">
                    <Key className="w-5 h-5" /> Git Credentials
                </h2>

                <div className="p-4 bg-[--bg-tertiary]/50 rounded-lg border border-[--border-color]">
                    <div className="flex justify-between items-center mb-2">
                        <label className="text-sm font-medium">Personal Access Token</label>
                        <button
                            onClick={() => setShowKey(!showKey)}
                            className="text-xs text-[--accent-primary] hover:underline"
                        >
                            {showKey ? 'Hide' : 'Reveal'}
                        </button>
                    </div>
                    <div className="flex gap-2">
                        <code className="flex-1 p-2 bg-black/30 rounded border border-[--border-color] font-mono text-sm text-[--text-muted]">
                            {showKey ? apiKey : 'cg_sk_live_•••••••••••••••••••••'}
                        </code>
                        <button onClick={handleCopy} className="btn btn-secondary text-xs">Copy</button>
                    </div>
                    <p className="text-xs text-[--text-secondary] mt-2">
                        Use this token to authenticate when pushing large files via the CLI.
                    </p>
                </div>

                <button onClick={handleRegenerate} className="btn btn-secondary w-full">Regenerate Token</button>
            </div>

            {/* Notifications */}
            <div className="card p-6 space-y-6">
                <h2 className="text-xl font-bold flex items-center gap-2">
                    <Bell className="w-5 h-5" /> Notifications
                </h2>

                <div className="space-y-4">
                    <label className="flex items-center justify-between cursor-pointer">
                        <span className="text-sm">Email me when uploads complete</span>
                        <input type="checkbox" defaultChecked className="toggle" />
                    </label>
                    <label className="flex items-center justify-between cursor-pointer">
                        <span className="text-sm">Email me about quota warnings</span>
                        <input type="checkbox" defaultChecked className="toggle" />
                    </label>
                </div>
            </div>

            <div className="flex justify-end gap-4">
                <button onClick={handleCancel} className="btn btn-ghost">Cancel</button>
                <button onClick={handleSave} className="btn btn-primary gap-2">
                    <Save className="w-4 h-4" /> Save Changes
                </button>
            </div>
        </div>
    );
}
