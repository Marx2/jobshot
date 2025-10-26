import {useEffect, useState} from 'react';
import {useJobs} from './useJobs';
import {JobRunModal} from './JobRunModal';
import type {Job} from './configLoader';

function JobStatusDisplay({status}: { status?: import('./configLoader').JobStatus }) {
  if (!status) return <span className="job-status loading">Loading...</span>;
  if (status.error) return <span className="job-status error">Error</span>;
  if (!status.exists) return <span className="job-status not-found">Not Found</span>;
  return <span className={`job-status ${status.status.toLowerCase()}`}>{status.status}</span>;
}

function App() {
  const {jobs, loading, error, runJob} = useJobs();
  const [activeJob, setActiveJob] = useState<Job | null>(null);

  useEffect(() => {
    if (activeJob) {
      document.body.classList.add('modal-open');
    } else {
      document.body.classList.remove('modal-open');
    }
  }, [activeJob]);

  if (loading) return <div className="app-container">Loading jobs...</div>;
  if (error) return <div className="app-container error">{error}</div>;

  function openRunModal(job: Job) {
    setActiveJob(job);
  }

  async function handleRun(updatedJob: Job) {
    await runJob(updatedJob);
    setActiveJob(null);
  }

  const containerClass = `app-container${activeJob ? ' modal-active' : ''}`;

  return (
      <div className={containerClass} aria-hidden={!!activeJob}>
        <h1>Jobshot - Job List</h1>
        <ul className="job-list">
          {jobs.map((job, idx) => (
              <li key={idx} className="job-item">
                <div className="job-details">
                  <span className="job-name">{job.name}</span>
                  <span className="job-desc">{job.description}</span>
                </div>
                <JobStatusDisplay status={job.status}/>
                <button className="run-btn" onClick={() => openRunModal(job)}>Run</button>
              </li>
          ))}
        </ul>
        {activeJob && (
            <JobRunModal
                job={activeJob}
                onClose={() => setActiveJob(null)}
                onRun={handleRun}
            />
        )}
      </div>
  );
}

export default App;
