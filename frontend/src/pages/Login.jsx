import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { User, ShieldCheck } from 'lucide-react';
import { useToast } from '../context/ToastContext';

export default function Login() {
    const { login, isLoading } = useApp();
    const navigate = useNavigate();
    const { addToast } = useToast();

    const handleLogin = async (role) => {
        await login(role);
        addToast(`Welcome back, ${role === 'student' ? 'Student' : 'Administrator'}`, 'success');
        navigate(role === 'student' ? '/dashboard' : '/admin');
    };



    return (
        <div className="flex items-center justify-center min-h-[80vh] px-4">
            <div className="w-full max-w-4xl grid md:grid-cols-2 gap-8">
                {/* Student Login Card */}
                <div
                    onClick={() => handleLogin('student')}
                    className="group relative cursor-pointer overflow-hidden rounded-2xl border border-[--border-color] bg-[--bg-secondary] p-8 hover:border-[--accent-primary] transition-all"
                >
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                    <div className="relative z-10 flex flex-col items-center text-center space-y-6">
                        <div className="h-20 w-20 rounded-2xl bg-[--bg-tertiary] flex items-center justify-center group-hover:scale-110 transition-transform">
                            <User className="h-10 w-10 text-[--accent-primary]" />
                        </div>

                        <div>
                            <h2 className="text-2xl font-bold mb-2">Student Access</h2>
                            <p className="text-[--text-secondary]">
                                Manage your project files, view quotas, and access your repositories.
                            </p>
                        </div>

                        <button disabled={isLoading} className="btn btn-secondary w-full group-hover:bg-[--accent-primary] group-hover:text-white">
                            {isLoading ? 'Connecting...' : 'Continue as Student'}
                        </button>
                    </div>
                </div>

                {/* Admin Login Card */}
                <div
                    onClick={() => handleLogin('admin')}
                    className="group relative cursor-pointer overflow-hidden rounded-2xl border border-[--border-color] bg-[--bg-secondary] p-8 hover:border-[--status-warning] transition-all"
                >
                    <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                    <div className="relative z-10 flex flex-col items-center text-center space-y-6">
                        <div className="h-20 w-20 rounded-2xl bg-[--bg-tertiary] flex items-center justify-center group-hover:scale-110 transition-transform">
                            <ShieldCheck className="h-10 w-10 text-[--status-warning]" />
                        </div>

                        <div>
                            <h2 className="text-2xl font-bold mb-2">Admin Console</h2>
                            <p className="text-[--text-secondary]">
                                Monitor cluster health, manage nodes, and configure user allocations.
                            </p>
                        </div>

                        <button disabled={isLoading} className="btn btn-secondary w-full group-hover:bg-[--status-warning] group-hover:text-white">
                            {isLoading ? 'Connecting...' : 'Continue as Admin'}
                        </button>
                    </div>
                </div>
            </div>

        </div>
    );
}
