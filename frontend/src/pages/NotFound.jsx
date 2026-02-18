import { Link } from 'react-router-dom';
import { FileQuestion, Home } from 'lucide-react';

export default function NotFound() {
    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
            <div className="bg-[--bg-secondary] p-4 rounded-full mb-6">
                <FileQuestion className="w-16 h-16 text-[--text-muted]" />
            </div>

            <h1 className="text-4xl font-bold mb-4">Page Not Found</h1>
            <p className="text-[--text-secondary] max-w-md mb-8">
                The page you are looking for might have been removed, had its name changed, or is temporarily unavailable.
            </p>

            <Link to="/" className="btn btn-primary flex items-center gap-2">
                <Home className="w-4 h-4" />
                Return Home
            </Link>
        </div>
    );
}
