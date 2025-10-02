import {useEffect, useState} from 'react';
import './App.css';
import type {Job} from './configLoader';
import {loadJobsConfig} from './configLoader';

function App() {
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

  const handleRun = (job: Job) => {
    // Placeholder for job execution logic
    alert(`Running job: ${job.name}`);
  };

  if (loading) return <div className="app-container">Loading jobs...</div>;
  if (error) return <div className="app-container error">{error}</div>;

  return (
      <div className="app-container">
        <h1>Jobshot - Job List</h1>
        <ul className="job-list">
          {jobs.map((job, idx) => (
              <li key={idx} className="job-item">
                <div className="job-details">
                  <span className="job-name">{job.name}</span>
                  <span className="job-desc">{job.description}</span>
                </div>
                <button className="run-btn" onClick={() => handleRun(job)}>Run</button>
              </li>
          ))}
        </ul>
      </div>
  );
}

export default App;
