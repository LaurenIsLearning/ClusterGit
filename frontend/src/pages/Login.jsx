import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { User, Mail, Lock, AlertCircle } from 'lucide-react';
import { useToast } from '../context/ToastContext';

export default function Login() {
    const { login, register, isLoading } = useApp();
    const navigate = useNavigate();
    const { addToast } = useToast();

    const [isRegisterMode, setIsRegisterMode] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (!email || !password) {
            setError('Please fill in all fields');
            return;
        }

        if (password.length < 6) {
            setError('Password must be at least 6 characters');
            return;
        }

        const result = isRegisterMode
            ? await register(email, password)
            : await login(email, password);

        if (result.success) {
            addToast(
                isRegisterMode
                    ? 'Account created successfully! Welcome to ClusterGit.'
                    : 'Welcome back!',
                'success'
            );
            navigate('/dashboard');
        } else {
            setError(result.error || 'Authentication failed');
        }
    };

    return (
        <div className="flex items-center justify-center min-h-[80vh] px-4">
            <div className="w-full max-w-md">
                <div className="rounded-2xl border border-[--border-color] bg-[--bg-secondary] p-8">
                    <div className="flex flex-col items-center text-center space-y-4 mb-8">
                        <div className="h-16 w-16 rounded-2xl bg-[--bg-tertiary] flex items-center justify-center">
                            <User className="h-8 w-8 text-[--accent-primary]" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold mb-2">
                                {isRegisterMode ? 'Create Account' : 'Student Login'}
                            </h2>
                            <p className="text-[--text-secondary]">
                                {isRegisterMode
                                    ? 'Sign up to access your ClusterGit portal'
                                    : 'Sign in to access your projects and repositories'}
                            </p>
                        </div>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {error && (
                            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500">
                                <AlertCircle className="h-5 w-5 flex-shrink-0" />
                                <span className="text-sm">{error}</span>
                            </div>
                        )}

                        <div>
                            <label className="block text-sm font-medium mb-2">Email</label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-[--text-muted]" />
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="student@university.edu"
                                    className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-[--border-color] bg-[--bg-tertiary] focus:outline-none focus:ring-2 focus:ring-[--accent-primary]"
                                    disabled={isLoading}
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-2">Password</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-[--text-muted]" />
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-[--border-color] bg-[--bg-tertiary] focus:outline-none focus:ring-2 focus:ring-[--accent-primary]"
                                    disabled={isLoading}
                                />
                            </div>
                            {isRegisterMode && (
                                <p className="text-xs text-[--text-muted] mt-1">
                                    Must be at least 6 characters
                                </p>
                            )}
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="btn btn-primary w-full"
                        >
                            {isLoading
                                ? 'Processing...'
                                : isRegisterMode
                                    ? 'Create Account'
                                    : 'Sign In'}
                        </button>
                    </form>

                    <div className="mt-6 text-center">
                        <button
                            onClick={() => {
                                setIsRegisterMode(!isRegisterMode);
                                setError('');
                                setEmail('');
                                setPassword('');
                            }}
                            className="text-sm text-[--accent-primary] hover:underline"
                            disabled={isLoading}
                        >
                            {isRegisterMode
                                ? 'Already have an account? Sign in'
                                : "Don't have an account? Sign up"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
