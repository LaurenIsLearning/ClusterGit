import { Link, Outlet } from 'react-router-dom';
import { Database, Github } from 'lucide-react';

export default function PublicLayout() {
    return (
        <div className="flex flex-col min-h-screen bg-[--bg-primary] text-[--text-primary]">
            <header className="h-16 border-b border-[--border-color] bg-[--bg-secondary]/50 backdrop-blur-md fixed top-0 w-full z-50">
                <div className="max-w-7xl mx-auto px-4 h-full flex items-center justify-between">
                    <Link to="/" className="flex items-center gap-2 text-xl font-bold">
                        <Database className="w-6 h-6 text-[--accent-primary]" />
                        <span>ClusterGit</span>
                    </Link>
                    <nav>
                        <Link to="/login" className="btn btn-primary whitespace-nowrap">
                            Log In
                        </Link>
                    </nav>
                </div>
            </header>

            <main className="flex-1 w-full pt-20">
                <Outlet />
            </main>

            <footer className="py-8 border-t border-[--border-color] text-center text-[--text-muted] text-sm mt-auto">
                <div className="max-w-7xl mx-auto px-4">
                    <p>© 2025 ClusterGit Prototype.</p>
                </div>
            </footer>
        </div>
    );
}
