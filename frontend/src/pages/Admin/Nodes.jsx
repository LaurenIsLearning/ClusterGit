import { useState, useEffect } from 'react';
import { mockService } from '../../services/mockData';
import { Server, HardDrive, Cpu, Thermometer, AlertTriangle } from 'lucide-react';

export default function AdminNodes() {
    const [nodes, setNodes] = useState([]);
    const [loading, setLoading] = useState(true);

    // Initial load
    useEffect(() => {
        mockService.getClusterStatus().then(data => {
            setNodes(data.nodes);
            setLoading(false);
        });
    }, []);

    // Simulate live data updates
    useEffect(() => {
        if (loading) return;

        const interval = setInterval(() => {
            setNodes(prevNodes => prevNodes.map(node => {
                if (node.status === 'offline') return node;

                // Randomly perturb metrics
                const cpuChange = Math.floor(Math.random() * 11) - 5; // -5 to +5
                const tempChange = Math.floor(Math.random() * 3) - 1; // -1 to +1
                const storageChange = Math.random() > 0.8 ? 0.1 : 0; // Occasional storage increase

                return {
                    ...node,
                    cpu: Math.max(0, Math.min(100, node.cpu + cpuChange)),
                    temp: Math.max(20, Math.min(95, node.temp + tempChange)),
                    storage: {
                        ...node.storage,
                        used: Number((Math.min(100, node.storage.used + storageChange)).toFixed(1))
                    }
                };
            }));
        }, 1500); // Update every 1.5 seconds

        return () => clearInterval(interval);
    }, [loading]);

    if (loading) return <div className="p-10 text-center">Loading node telemetry...</div>;

    const onlineCount = nodes.filter(n => n.status === 'online').length;
    const warningCount = nodes.filter(n => n.status === 'warning').length;
    const offlineCount = nodes.filter(n => n.status === 'offline').length;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold">Cluster Nodes</h1>
                    <p className="text-[--text-secondary]">Real-time telemetry from all distributed units.</p>
                </div>
                <div className="flex gap-4">
                    {/* Summary Stats */}
                    <div className="flex items-center gap-2 px-4 py-2 bg-[--bg-secondary] rounded-lg border border-[--border-color]">
                        <div className="w-3 h-3 rounded-full bg-[--status-success]" />
                        <span className="font-mono font-bold">{onlineCount}</span>
                        <span className="text-sm text-[--text-secondary]">Online</span>
                    </div>
                    <div className="flex items-center gap-2 px-4 py-2 bg-[--bg-secondary] rounded-lg border border-[--border-color]">
                        <div className="w-3 h-3 rounded-full bg-[--status-warning]" />
                        <span className="font-mono font-bold">{warningCount}</span>
                        <span className="text-sm text-[--text-secondary]">Warning</span>
                    </div>
                    <div className="flex items-center gap-2 px-4 py-2 bg-[--bg-secondary] rounded-lg border border-[--border-color]">
                        <div className="w-3 h-3 rounded-full bg-[--status-error]" />
                        <span className="font-mono font-bold">{offlineCount}</span>
                        <span className="text-sm text-[--text-secondary]">Offline</span>
                    </div>
                </div>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {nodes.map(node => (
                    <NodeCard key={node.id} node={node} />
                ))}
            </div>
        </div>
    );
}

function NodeCard({ node }) {
    const isOnline = node.status === 'online';
    const isWarning = node.status === 'warning';

    const statusColor = isOnline ? 'text-[--status-success]' : isWarning ? 'text-[--status-warning]' : 'text-[--status-error]';
    const borderColor = isOnline ? 'border-[--border-color]' : isWarning ? 'border-[--status-warning]' : 'border-[--status-error]';

    return (
        <div className={`card p-6 border transition-all ${borderColor} ${!isOnline ? 'bg-opacity-50' : ''}`}>
            <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg bg-[--bg-primary] ${statusColor}`}>
                        <Server className="w-6 h-6" />
                    </div>
                    <div>
                        <h3 className="font-bold font-mono text-lg">{node.id}</h3>
                        <p className="text-xs text-[--text-muted] font-mono">{node.ip}</p>
                    </div>
                </div>
                <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${isOnline ? 'bg-emerald-500/10 text-emerald-500' :
                    isWarning ? 'bg-amber-500/10 text-amber-500' :
                        'bg-red-500/10 text-red-500'
                    }`}>
                    {node.status}
                </span>
            </div>

            {node.status !== 'offline' ? (
                <div className="space-y-4">
                    {/* Storage */}
                    <div>
                        <div className="flex justify-between text-sm mb-1">
                            <span className="flex items-center gap-1 text-[--text-secondary]">
                                <HardDrive className="w-3 h-3" /> Storage
                            </span>
                            <span className="font-mono text-xs">{node.storage.used}%</span>
                        </div>
                        <div className="h-2 w-full bg-[--bg-primary] rounded-full overflow-hidden">
                            <div
                                className="h-full bg-purple-500"
                                style={{ width: `${node.storage.used}%` }}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-2">
                        <div className="flex items-center gap-2">
                            <Cpu className="w-4 h-4 text-[--text-secondary]" />
                            <div>
                                <p className="text-xs text-[--text-secondary]">Load</p>
                                <p className="font-mono font-medium">{node.cpu}%</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Thermometer className={`w-4 h-4 ${node.temp > 50 ? 'text-[--status-warning]' : 'text-[--text-secondary]'}`} />
                            <div>
                                <p className="text-xs text-[--text-secondary]">Temp</p>
                                <p className="font-mono font-medium">{node.temp}°C</p>
                            </div>
                        </div>
                    </div>

                    <div className="text-xs text-[--text-muted] pt-2 border-t border-[--border-color] mt-2">
                        Uptime: {node.uptime}
                    </div>
                </div>
            ) : (
                <div className="h-32 flex flex-col items-center justify-center text-[--status-error] gap-2 opacity-70">
                    <AlertTriangle className="w-8 h-8" />
                    <span className="font-medium">Connection Lost</span>
                </div>
            )}
        </div>
    );
}
