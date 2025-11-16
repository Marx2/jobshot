export interface Job {
  name: string;
  description: string;
  container: string;
  entrypoint: string[]; // <-- Added entrypoint field
  parameters: string[];
  namespace?: string;
  status?: JobStatus; // Added status field
  // Added optional Kubernetes resource requests/limits
  resources?: {
    requests: { cpu: string; memory: string };
    limits: { cpu: string; memory: string };
  };
}

export interface JobStatus {
  status: string;
  exists: boolean;
  isRunning: boolean;
  details?: {
    active: number;
    succeeded: number;
    failed: number;
  };
  error?: string;
}

export interface JobsConfig {
  jobs: Job[];
}

export async function loadJobsConfig(): Promise<JobsConfig> {
  try {
    const response = await fetch('/api/jobs');
    if (!response.ok) throw new Error('Failed to fetch jobs');
    const config = await response.json();
    return config as JobsConfig;
  } catch (error) {
    console.error('Failed to load jobs config:', error);
    return {jobs: []};
  }
}
