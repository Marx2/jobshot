import {useEffect, useRef, useState} from 'react';
import type {Job} from './configLoader';

interface JobRunModalProps {
  job: Job;
  onClose: () => void;
  onRun: (job: Job) => void;
}

function paramsToString(params: string[]): string {
  return params.join('\n');
}

function stringToParams(value: string): string[] {
  return value.split('\n').map(l => l.trim()).filter(Boolean);
}

export function JobRunModal({job, onClose, onRun}: JobRunModalProps) {
  const [container, setContainer] = useState(job.container);
  const [parametersText, setParametersText] = useState(paramsToString(job.parameters || []));
  const [error, setError] = useState<string | null>(null);
  const firstInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    firstInputRef.current?.focus();
  }, []);

  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }

    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [onClose]);

  function handleResetDefaults() {
    setContainer(job.container);
    setParametersText(paramsToString(job.parameters || []));
    setError(null);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmedContainer = container.trim();
    if (!trimmedContainer) {
      setError('Container image cannot be empty.');
      return;
    }
    const params = stringToParams(parametersText);
    // Build new job object preserving original entrypoint
    const updated: Job = {
      name: job.name,
      description: job.description,
      namespace: job.namespace,
      container: trimmedContainer,
      parameters: params,
      entrypoint: job.entrypoint
    };
    onRun(updated);
  }

  return (
      <div className="modal-overlay" role="dialog" aria-modal="true"
           aria-label={`Run job ${job.name}`}>
        <div className="modal" data-testid="job-run-modal">
          <div className="modal-header">
            <h2>Run Job</h2>
            <button type="button" className="close-btn" onClick={onClose} aria-label="Close">×
            </button>
          </div>
          <form className="modal-body" onSubmit={handleSubmit}>
            <div className="field-group">
              <label htmlFor="job-name" className="field-label">Name</label>
              <input id="job-name" type="text" value={job.name} readOnly
                     className="field-input read-only"/>
            </div>
            <div className="field-group">
              <label htmlFor="job-namespace" className="field-label">Namespace</label>
              <input id="job-namespace" type="text" value={job.namespace || 'default'} readOnly
                     className="field-input read-only"/>
            </div>
            <div className="field-group">
              <label htmlFor="job-container" className="field-label">Container Image</label>
              <input ref={firstInputRef} id="job-container" type="text" value={container}
                     onChange={e => setContainer(e.target.value)} className="field-input"
                     placeholder="e.g. alpine:latest"/>
            </div>
            <div className="field-group">
              <label htmlFor="job-parameters" className="field-label">Parameters (one per
                line)</label>
              <textarea id="job-parameters" value={parametersText}
                        onChange={e => setParametersText(e.target.value)} className="field-textarea"
                        placeholder="--flag=value" rows={6}/>
            </div>
            {error && <div className="form-error" role="alert">{error}</div>}
            <div className="modal-actions">
              <button type="button" className="secondary-btn" onClick={handleResetDefaults}>Reset
              </button>
              <button type="button" className="secondary-btn" onClick={onClose}>Cancel</button>
              <button type="submit" className="primary-btn">Run</button>
            </div>
            <p className="hint">The job will be created with the edited container image and
              parameters. Entrypoint (command) is unchanged.</p>
          </form>
        </div>
      </div>
  );
}
