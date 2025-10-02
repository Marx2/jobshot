import yaml from 'js-yaml';

export interface Job {
  name: string;
  description: string;
  container: string;
  parameters: string[];
}

export interface JobsConfig {
  jobs: Job[];
}

// Helper to get config file location from env or default
function getConfigFilePath(): string {
  // Vite exposes env variables as import.meta.env
  // Use JOBSHOT_CONFIG or default to '/jobs.yaml' in public/
  return import.meta.env.VITE_JOBSHOT_CONFIG || '/jobs.yaml';
}

export async function loadJobsConfig(): Promise<JobsConfig> {
  const configPath = getConfigFilePath();
  try {
    const response = await fetch(configPath);
    const yamlText = await response.text();
    const config = yaml.load(yamlText) as JobsConfig;
    return config;
  } catch (error) {
    console.error('Failed to load jobs config:', error);
    return {jobs: []};
  }
}
