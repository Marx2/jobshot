import './App.css';
import {useJobs} from './useJobs';

function JobStatusDisplay({status}: { status?: import('./configLoader').JobStatus }) {
  if (!status) {
    return <span className="job-status loading">Loading...</span>;
  }

  if (status.error) {
    return <span className="job-status error">Error</span>;
  }

  if (!status.exists) {
    return <span className="job-status not-found">Not Found</span>;
  }

  return <span className={`job-status ${status.status.toLowerCase()}`}>
    {status.status}
  </span>;
}

function App() {
  const {jobs, loading, error, runJob} = useJobs();

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
                <JobStatusDisplay status={job.status}/>
                <button className="run-btn" onClick={() => runJob(job)}>Run</button>
              </li>
          ))}
        </ul>
      </div>
  );
}

export default App;
