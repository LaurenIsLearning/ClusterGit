import { Link } from 'react-router-dom';
import { Cloud, GitBranch, HardDrive, Shield, ArrowRight, Github } from 'lucide-react';

export default function Landing() {
    return (
        <div className="flex flex-col min-h-screen">
            {/* Hero Section */}
            <section className="relative w-full pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden flex flex-col items-center">
                {/* Background Effects */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full max-w-7xl opacity-20 pointer-events-none">
                    <div className="absolute top-20 left-10 w-72 h-72 bg-blue-500 rounded-full blur-[128px]" />
                    <div className="absolute top-40 right-10 w-96 h-96 bg-purple-500 rounded-full blur-[128px]" />
                </div>

                <div className="w-full max-w-7xl mx-auto px-6 relative z-10 flex flex-col items-center text-center">
                    <div className="inline-flex items-center gap-2 px-4 py-2 mb-8 rounded-full bg-slate-800/80 border border-slate-700 text-blue-400 text-sm font-medium backdrop-blur-md animate-fade-in shadow-lg">
                        <span className="flex h-2 w-2 rounded-full bg-blue-500 animate-pulse"></span>
                        <span>Honors Project Live Demo</span>
                    </div>

                    <h1 className="max-w-5xl mx-auto text-5xl md:text-7xl font-bold tracking-tight text-white mb-8 leading-tight drop-shadow-sm">
                        Distributed Storage for <br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">
                            Git Workflows
                        </span>
                    </h1>

                    <p className="max-w-3xl mx-auto text-lg md:text-xl text-slate-400 mb-12 leading-relaxed">
                        ClusterGit solves the file size limit problem by seamlessly offloading large assets to a distributed Raspberry Pi cluster while keeping your git history clean.
                    </p>

                    <div className="flex flex-col sm:flex-row items-center justify-center gap-6 w-full">
                        <Link to="/login" className="whitespace-nowrap group relative inline-flex items-center justify-center px-8 py-4 text-lg font-semibold text-white bg-blue-600 rounded-full hover:bg-blue-700 transition-all duration-200 shadow-xl hover:shadow-2xl hover:-translate-y-0.5">
                            <span>Start Prototyping</span>
                            <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                        </Link>
                        <a href="https://github.com" target="_blank" rel="noreferrer" className="whitespace-nowrap inline-flex items-center justify-center px-8 py-4 text-lg font-medium text-slate-300 bg-slate-800/50 border border-slate-700 rounded-full hover:bg-slate-800 hover:text-white transition-all backdrop-blur-sm hover:border-slate-500">
                            <Github className="w-5 h-5 mr-3" />
                            View on GitHub
                        </a>
                    </div>
                </div>
            </section>

            {/* Stats/Showcase Divider */}
            <div className="border-y border-slate-800 bg-slate-900/50 backdrop-blur-sm">
                <div className="max-w-7xl mx-auto px-4 py-12">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
                        <Stat label="Storage Node" value="8x RPi 4" />
                        <Stat label="Total Capacity" value="4 TB" />
                        <Stat label="Replication" value="3x Factor" />
                        <Stat label="Upload Speed" value="110 MB/s" />
                    </div>
                </div>
            </div>

            {/* Features Grid */}
            <section id="features" className="py-24 bg-slate-950">
                <div className="max-w-7xl mx-auto px-4">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl font-bold text-white mb-4">Architecture Highlights</h2>
                        <p className="text-slate-400 max-w-2xl mx-auto">
                            Built to simulate a production-grade distributed file system for academic research.
                        </p>
                    </div>

                    <div className="grid md:grid-cols-3 gap-8">
                        <FeatureCard
                            icon={HardDrive}
                            title="Sharded Storage"
                            desc="Files are split into fixed-size chunks and distributed across nodes using consistent hashing."
                            color="text-blue-400"
                            bg="bg-blue-500/10"
                        />
                        <FeatureCard
                            icon={GitBranch}
                            title="Git Integration"
                            desc="CLI tools intercept large file commits and replace them with pointer files automatically."
                            color="text-purple-400"
                            bg="bg-purple-500/10"
                        />
                        <FeatureCard
                            icon={Shield}
                            title="Quota Management"
                            desc="Role-based access control with real-time storage quota enforcement for students."
                            color="text-emerald-400"
                            bg="bg-emerald-500/10"
                        />
                    </div>
                </div>
            </section>
        </div>
    );
}

function Stat({ label, value }) {
    return (
        <div>
            <div className="text-3xl font-bold text-white mb-1">{value}</div>
            <div className="text-sm text-slate-500 uppercase tracking-wider font-medium">{label}</div>
        </div>
    );
}

function FeatureCard({ icon: Icon, title, desc, color, bg }) {
    return (
        <div className="group p-8 rounded-2xl border border-slate-800 bg-slate-900/50 hover:bg-slate-900 transition-colors">
            <div className={`h-14 w-14 rounded-xl ${bg} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform`}>
                <Icon className={`h-7 w-7 ${color}`} />
            </div>
            <h3 className="text-xl font-bold text-white mb-3">{title}</h3>
            <p className="text-slate-400 leading-relaxed">{desc}</p>
        </div>
    );
}
