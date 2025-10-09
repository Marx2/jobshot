import {useEffect, useState} from 'react';
import type {Job} from './configLoader';
import {loadJobsConfig} from './configLoader';

export function useJobs() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadJobsConfig()
    .then(config => {
      setJobs(config.jobs);
      setLoading(false);
    })
    .catch(_ => {
      setError('Failed to load jobs config');
      setLoading(false);
    });
  }, []);

  const runJob = async (job: Job) => {
    const confirmed = window.confirm(`Are you sure to run ${job.name}?`);
    if (!confirmed) return;
    try {
      const response = await fetch('/api/run-job', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(job),
      });
      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 503) {
          // Backend preflight connectivity / namespace / RBAC failure
          throw new Error(errorText || 'Kubernetes connectivity / namespace access failed');
        }
        if (response.status === 400) {
          throw new Error(errorText || 'Invalid request parameters');
        }
        throw new Error(errorText || `HTTP ${response.status}`);
      }
      alert(`Job '${job.name}' started in Kubernetes.`);
    } catch (err) {
      // Show backend error message clearly
      let message = '';
      if (err instanceof Error) {
        message = err.message;
      } else if (typeof err === 'string') {
        message = err;
      } else {
        message = 'Unknown error';
      }
      alert(`Failed to start job: ${message}`);
    }
  };

  return {jobs, loading, error, runJob};
}
