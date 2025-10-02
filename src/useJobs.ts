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

  const runJob = (job: Job) => {
    // Placeholder for job execution logic
    alert(`Running job: ${job.name}`);
  };

  return {jobs, loading, error, runJob};
}

