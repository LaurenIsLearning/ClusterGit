
// Mock Data for ClusterGit

const DELAY = 600; // Simulate network latency

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// --- Auth Data ---
const USERS = [
  { id: '1', name: 'Student Demo', email: 'student@university.edu', role: 'student', avatar: 'ST' },
  { id: '2', name: 'Admin Demo', email: 'admin@university.edu', role: 'admin', avatar: 'AD' }
];

// --- Student Data ---
const PROJECTS = [
  { id: 'p1', name: 'Computer Vision Final', repo: 'github.com/stu/cv-final', size: '2.4 GB', updated: '2 hours ago' },
  { id: 'p2', name: 'NLP Large Models', repo: 'github.com/stu/nlp-models', size: '8.1 GB', updated: '1 day ago' },
  { id: 'p3', name: 'Graphics Dataset', repo: 'github.com/stu/gfx-data', size: '1.2 GB', updated: '3 days ago' }
];

const FILES = {
  'p1': [
    { id: 'f1', name: 'training_data.mp4', size: '1.2 GB', type: 'video', status: 'synced' },
    { id: 'f2', name: 'model_checkpoint.pt', size: '800 MB', type: 'model', status: 'synced' },
    { id: 'f3', name: 'validation_set.zip', size: '400 MB', type: 'archive', status: 'synced' }
  ],
  'p2': [
    { id: 'f4', name: 'gpt_finetune.bin', size: '8.1 GB', type: 'model', status: 'synced' }
  ]
};

const QUOTA = {
  used: 11.7 * 1024 * 1024 * 1024, // 11.7 GB in bytes
  total: 20 * 1024 * 1024 * 1024 // 20 GB
};

// --- Admin Data ---
const NODES = Array.from({ length: 8 }).map((_, i) => ({
  id: `node-0${i + 1}`,
  ip: `192.168.1.10${i + 1}`,
  status: i === 2 ? 'warning' : i === 5 ? 'offline' : 'online',
  uptime: `${Math.floor(Math.random() * 30)}d`,
  storage: {
    used: Math.floor(Math.random() * 60) + 20, // 20-80%
    total: '512 GB'
  },
  cpu: Math.floor(Math.random() * 50) + 5,
  temp: Math.floor(Math.random() * 20) + 35
}));

export const mockService = {
  login: async (role) => {
    await wait(DELAY);
    return USERS.find(u => u.role === role);
  },

  getProjects: async () => {
    await wait(DELAY);
    return PROJECTS;
  },

  getProjectFiles: async (projectId) => {
    await wait(DELAY);
    return FILES[projectId] || [];
  },

  getQuota: async () => {
    await wait(DELAY);
    return QUOTA;
  },

  getClusterStatus: async () => {
    await wait(DELAY);
    return {
      nodes: NODES,
      totalStorage: '4 TB',
      usedStorage: '1.2 TB',
      health: '96%'
    };
  }
};
