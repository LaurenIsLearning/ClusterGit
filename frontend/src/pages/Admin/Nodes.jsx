import { useState, useEffect } from 'react';
import { adminService } from '../../services/adminService';
import { Server, HardDrive, Cpu, Thermometer, AlertTriangle } from 'lucide-react';
import { NODE_TELEMETRY_REFRESH_MS } from '../../utils/nodeTelemetry';

function formatBytes(bytes) {
    const value = Number(bytes) || 0;
    if (value >= 1024 ** 4) return `${(value / (1024 ** 4)).toFixed(2)} TB`;
    if (value >= 1024 ** 3) return `${(value / (1024 ** 3)).toFixed(2)} GB`;
    if (value >= 1024 ** 2) return `${(value / (1024 ** 2)).toFixed(1)} MB`;
    if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${value} B`;
}

function formatHeartbeat(value) {
    if (!value) return 'No recent heartbeat';
    const timestamp = new Date(value);
    if (Number.isNaN(timestamp.getTime())) return 'Unknown heartbeat';
    return timestamp.toLocaleString();
}

function formatTemperature(value) {
    if (value == null || Number.isNaN(Number(value))) return 'N/A';
    return `${Number(value).toFixed(1)}°C`;
}

export default function AdminNodes() {
    const [nodes, setNodes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        let isMounted = true;

        const load = async () => {
            if (isMounted) {
                setLoading(true);
                setError('');
            }

            try {
                const data = await adminService.getNodes();
                if (isMounted) {
                    setNodes(data || []);
                }
            } catch (err) {
                if (isMounted) {
                    setError(err.message || 'Failed to load node telemetry');
                }
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        };

        load();
        const interval = setInterval(load, NODE_TELEMETRY_REFRESH_MS);

        return () => {
            isMounted = false;
            clearInterval(interval);
        };
    }, []);

    if (loading) return <div className="p-10 text-center">Loading node telemetry...</div>;
    if (error) return <div className="p-10 text-center text-red-500">{error}</div>;

    const onlineCount = nodes.filter(n => n.status === 'online').length;
    const warningCount = nodes.filter(n => n.status === 'warning').length;
    const offlineCount = nodes.filter(n => n.status === 'offline').length;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold">Cluster Nodes</h1>
                    <p className="text-[--text-secondary]">Real-time telemetry from all cluster nodes.</p>
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
                        <p className="text-xs text-[--text-muted]">Cluster node status</p>
                    </div>
                </div>
                <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${isOnline ? 'bg-emerald-500/10 text-emerald-500' :
                    isWarning ? 'bg-amber-500/10 text-amber-500' :
                        'bg-red-500/10 text-red-500'
                    }`}>
                    {node.status}
                </span>
            </div>

            <div className="space-y-4">
                <div>
                    <div className="flex justify-between text-sm mb-1">
                        <span className="flex items-center gap-1 text-[--text-secondary]">
                            <HardDrive className="w-3 h-3" /> Storage
                        </span>
                        <span className="font-mono text-xs">{node.storageUsedPercent}%</span>
                    </div>
                    <div className="h-2 w-full bg-[--bg-primary] rounded-full overflow-hidden">
                        <div
                            className={`h-full ${isWarning ? 'bg-amber-500' : !isOnline ? 'bg-red-500' : 'bg-purple-500'}`}
                            style={{ width: `${node.storageUsedPercent}%` }}
                        />
                    </div>
                    <div className="mt-2 text-xs text-[--text-muted]">
                        {formatBytes(node.storageUsedBytes)} of {formatBytes(node.storageTotalBytes)}
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-2">
                    <div className="flex items-center gap-2">
                        <Cpu className="w-4 h-4 text-[--text-secondary]" />
                        <div>
                            <p className="text-xs text-[--text-secondary]">% CPU</p>
                            <p className="font-mono font-medium">{node.cpuPercent.toFixed(1)}%</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Thermometer className={`w-4 h-4 ${node.temperatureC != null && node.temperatureC > 50 ? 'text-[--status-warning]' : 'text-[--text-secondary]'}`} />
                        <div>
                            <p className="text-xs text-[--text-secondary]">Temperature</p>
                            <p className="font-mono font-medium">{formatTemperature(node.temperatureC)}</p>
                        </div>
                    </div>
                </div>

                {!isOnline ? (
                    <div className="flex items-center gap-2 text-xs text-[--status-error] pt-1">
                        <AlertTriangle className="w-4 h-4" />
                        <span>Node status requires attention.</span>
                    </div>
                ) : null}

                <div className="text-xs text-[--text-muted] pt-2 border-t border-[--border-color] mt-2">
                    Last heartbeat: {formatHeartbeat(node.heartbeatAt)}
                </div>
            </div>
        </div>
    );
}
