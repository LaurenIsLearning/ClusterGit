import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { GitBranch, HardDrive, Shield, ArrowRight, Github, Cpu, Thermometer, Activity } from 'lucide-react';
import { publicService } from '../services/publicService';

function formatBytes(bytes) {
    const value = Number(bytes) || 0;
    if (value >= 1024 ** 4) return `${(value / (1024 ** 4)).toFixed(2)} TB`;
    if (value >= 1024 ** 3) return `${(value / (1024 ** 3)).toFixed(2)} GB`;
    if (value >= 1024 ** 2) return `${(value / (1024 ** 2)).toFixed(1)} MB`;
    return `${value} B`;
}

function formatHeartbeat(value) {
    if (!value) return 'No recent heartbeat';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Unknown heartbeat';
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
}

function formatTemperature(value) {
    if (value == null || Number.isNaN(Number(value))) return 'N/A';
    return `${Number(value).toFixed(1)}°C`;
}

export default function Landing() {
    const [nodes, setNodes] = useState([]);
    const [nodesError, setNodesError] = useState('');

    useEffect(() => {
        let isMounted = true;

        const loadNodes = async () => {
            try {
                const data = await publicService.getNodes();
                if (!isMounted) return;
                setNodes(data || []);
                setNodesError('');
            } catch (error) {
                if (!isMounted) return;
                setNodesError(error.message || 'Failed to load cluster telemetry');
            }
        };

        loadNodes();
        const interval = setInterval(loadNodes, 15000);

        return () => {
            isMounted = false;
            clearInterval(interval);
        };
    }, []);

    const clusterSummary = useMemo(() => {
        const online = nodes.filter((node) => node.status === 'online').length;
        const warning = nodes.filter((node) => node.status === 'warning').length;
        const totalStorageBytes = nodes.reduce((sum, node) => sum + (Number(node.storageTotalBytes) || 0), 0);
        const usedStorageBytes = nodes.reduce((sum, node) => sum + (Number(node.storageUsedBytes) || 0), 0);

        return {
            online,
            warning,
            total: nodes.length,
            totalStorageBytes,
            usedStorageBytes,
        };
    }, [nodes]);

    return (
        <div className="flex flex-col min-h-screen bg-white">
            {/* Hero Section */}
            <section className="relative w-full pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden flex flex-col items-center">
                {/* Background Effects */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full max-w-7xl opacity-10 pointer-events-none">
                    <div className="absolute top-20 left-10 w-72 h-72 bg-emerald-400 rounded-full blur-[128px]" />
                    <div className="absolute top-40 right-10 w-96 h-96 bg-green-300 rounded-full blur-[128px]" />
                </div>

                <div className="w-full max-w-7xl mx-auto px-6 relative z-10 flex flex-col items-center text-center">


                    <h1 className="max-w-5xl mx-auto text-5xl md:text-7xl font-bold tracking-tight text-slate-900 mb-8 leading-tight">
                        Distributed Storage for <br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-green-500">
                            Git Workflows
                        </span>
                    </h1>

                    <p className="max-w-3xl mx-auto text-lg md:text-xl text-slate-600 mb-12 leading-relaxed">
                        ClusterGit solves the file size limit problem by seamlessly offloading large assets to a distributed Raspberry Pi cluster while keeping your git history clean.
                    </p>

                    <div className="flex flex-col sm:flex-row items-center justify-center gap-6 w-full">
                        <Link to="/login" className="whitespace-nowrap group relative inline-flex items-center justify-center px-8 py-4 text-lg font-semibold text-white bg-emerald-600 rounded-full hover:bg-emerald-700 transition-all duration-200 shadow-xl hover:shadow-2xl hover:-translate-y-0.5">
                            <span>Get Started</span>
                            <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                        </Link>
                        <a href="https://github.com/LaurenIsLearning/ClusterGit" target="_blank" rel="noreferrer" className="whitespace-nowrap inline-flex items-center justify-center px-8 py-4 text-lg font-medium text-slate-600 bg-slate-100 border border-slate-200 rounded-full hover:bg-slate-200 hover:text-slate-900 transition-all backdrop-blur-sm">
                            <Github className="w-5 h-5 mr-3" />
                            View on GitHub
                        </a>
                    </div>
                </div>
            </section>

            {/* Stats/Showcase Divider */}
            <div className="border-y border-slate-200 bg-slate-50">
                <div className="max-w-7xl mx-auto px-4 py-12">
                    <div className="flex flex-col gap-8">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
                            <Stat label="Nodes Online" value={`${clusterSummary.online}/${clusterSummary.total || 5}`} />
                            <Stat label="Warning Nodes" value={String(clusterSummary.warning)} />
                            <Stat label="Cluster Capacity" value={formatBytes(clusterSummary.totalStorageBytes || 0)} />
                            <Stat label="Storage In Use" value={formatBytes(clusterSummary.usedStorageBytes || 0)} />
                        </div>

                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                            {nodes.map((node) => (
                                <LandingNodeCard key={node.id} node={node} />
                            ))}
                        </div>

                        {nodesError ? (
                            <div className="text-sm text-red-600 text-center">{nodesError}</div>
                        ) : null}
                    </div>
                </div>
            </div>

            {/* Features Grid */}
            <section id="features" className="py-24 bg-white">
                <div className="max-w-7xl mx-auto px-4">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl font-bold text-slate-900 mb-4">Architecture Highlights</h2>
                        <p className="text-slate-600 max-w-2xl mx-auto">
                            Built to simulate a production-grade distributed file system for academic research.
                        </p>
                    </div>

                    <div className="grid md:grid-cols-3 gap-8">
                        <FeatureCard
                            icon={HardDrive}
                            title="Shared Storage"
                            desc="Files are split into fixed-size chunks and distributed across nodes using consistent hashing."
                            color="text-emerald-600"
                            bg="bg-emerald-50"
                        />
                        <FeatureCard
                            icon={GitBranch}
                            title="Git Integration"
                            desc="CLI tools intercept large file commits and replace them with pointer files automatically."
                            color="text-green-600"
                            bg="bg-green-50"
                        />
                        <FeatureCard
                            icon={Shield}
                            title="Quota Management"
                            desc="Role-based access control with real-time storage quota enforcement for students."
                            color="text-emerald-500"
                            bg="bg-emerald-50/50"
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
            <div className="text-3xl font-bold text-slate-900 mb-1">{value}</div>
            <div className="text-sm text-slate-500 uppercase tracking-wider font-medium">{label}</div>
        </div>
    );
}

function FeatureCard({ icon: Icon, title, desc, color, bg }) {
    return (
        <div className="group p-8 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors shadow-sm hover:shadow-md">
            <div className={`h-14 w-14 rounded-xl ${bg} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform`}>
                <Icon className={`h-7 w-7 ${color}`} />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-3">{title}</h3>
            <p className="text-slate-600 leading-relaxed">{desc}</p>
        </div>
    );
}

function LandingNodeCard({ node }) {
    const statusTone = node.status === 'online'
        ? 'text-emerald-600 bg-emerald-50 border-emerald-100'
        : node.status === 'warning'
            ? 'text-amber-600 bg-amber-50 border-amber-100'
            : 'text-red-600 bg-red-50 border-red-100';

    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                    <h3 className="text-base font-semibold text-slate-900">{node.id}</h3>
                    <p className="text-xs text-slate-500">Cluster node status</p>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase border ${statusTone}`}>
                    {node.status}
                </span>
            </div>

            <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                    <span className="inline-flex items-center gap-2 text-slate-600">
                        <HardDrive className="w-4 h-4" />
                        Storage
                    </span>
                    <span className="font-mono text-slate-900">{node.storageUsedPercent}%</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-green-500"
                        style={{ width: `${node.storageUsedPercent}%` }}
                    />
                </div>
                <div className="text-xs text-slate-500">
                    {formatBytes(node.storageUsedBytes)} of {formatBytes(node.storageTotalBytes)}
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                    <div className="rounded-xl bg-slate-50 p-3">
                        <div className="inline-flex items-center gap-2 text-xs text-slate-500 mb-1">
                            <Cpu className="w-4 h-4" />
                            CPU
                        </div>
                        <div className="font-mono text-sm font-semibold text-slate-900">
                            {node.cpuPercent.toFixed(1)}%
                        </div>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3">
                        <div className="inline-flex items-center gap-2 text-xs text-slate-500 mb-1">
                            <Thermometer className="w-4 h-4" />
                            Temp
                        </div>
                        <div className="font-mono text-sm font-semibold text-slate-900">
                            {formatTemperature(node.temperatureC)}
                        </div>
                    </div>
                </div>

                <div className="inline-flex items-center gap-2 text-xs text-slate-500 pt-1">
                    <Activity className="w-4 h-4" />
                    Last heartbeat: {node.uptimeLabel || formatHeartbeat(node.heartbeatAt)}
                </div>
            </div>
        </div>
    );
}
