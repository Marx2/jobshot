import {useCallback, useEffect, useRef, useState} from 'react';
import type {Job, JobStatus} from './configLoader';
import {loadJobsConfig} from './configLoader';

export function useJobs() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<number | null>(null);

  const fetchJobStatus = useCallback(async (job: Job): Promise<JobStatus> => {
    try {
      const nameSlug = job.name.toLowerCase().replace(/\s+/g, '-');
      const namespace = job.namespace || 'default';
      const response = await fetch(`/api/job-status/${encodeURIComponent(nameSlug)}?namespace=${encodeURIComponent(namespace)}`);

      if (!response.ok) {
        return {
          status: 'Error',
          exists: false,
          isRunning: false,
          error: `HTTP ${response.status}`
        };
      }

      return await response.json();
    } catch (err) {
      return {
        status: 'Error',
        exists: false,
        isRunning: false,
        error: err instanceof Error ? err.message : 'Unknown error'
      };
    }
  }, []);

  const updateJobStatuses = useCallback(async (currentJobs: Job[]) => {
    if (currentJobs.length === 0) return;

    const statusPromises = currentJobs.map(async (job) => {
      const status = await fetchJobStatus(job);
      return {...job, status};
    });

    const updatedJobs = await Promise.all(statusPromises);
    setJobs(updatedJobs);
  }, [fetchJobStatus]);

  useEffect(() => {
    loadJobsConfig()
    .then(config => {
      setJobs(config.jobs);
      setLoading(false);
    })
    .catch(() => {
      setError('Failed to load jobs config');
      setLoading(false);
    });
  }, []);

  // Fetch job statuses after jobs are loaded
  useEffect(() => {
    if (!loading && jobs.length > 0) {
      // Initial status fetch
      updateJobStatuses(jobs);

      // Clear existing interval
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }

      // Set up periodic status updates every 5 seconds
      intervalRef.current = setInterval(() => {
        setJobs(currentJobs => {
          updateJobStatuses(currentJobs);
          return currentJobs;
        });
      }, 5000);

      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      };
    }
  }, [loading, jobs.length, updateJobStatuses, jobs]);

  const runJob = async (job: Job) => {
    try {
      const response = await fetch('/api/run-job', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(job),
      });
      if (!response.ok) {
        // Try to get error text from backend
        const errorText = await response.text();
        throw new Error(errorText || `HTTP ${response.status}`);
      }
      alert(`Job '${job.name}' started in Kubernetes.`);
      // Immediately update job status after starting
      setTimeout(() => updateJobStatuses(jobs), 1000);
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
