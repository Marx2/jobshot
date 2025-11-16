import React, {useEffect, useRef, useState} from 'react';
import type {Job} from './configLoader';
// Local fallback for JSX intrinsic elements (tooling quirk)
declare global {
  namespace JSX {
    interface IntrinsicElements {
      div: any;
      span: any;
      h2: any;
      button: any;
      form: any;
      input: any;
      fieldset: any;
      legend: any;
      label: any;
      textarea: any;
      p: any;
    }
  }
}

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

const DEFAULT_RESOURCES = {
  requests: {cpu: '250m', memory: '64Mi'},
  limits: {cpu: '500m', memory: '128Mi'}
};

export function JobRunModal({job, onClose, onRun}: JobRunModalProps) {
  const [container, setContainer] = useState(job.container);
  const [parametersText, setParametersText] = useState(paramsToString(job.parameters || []));
  const [error, setError] = useState<string | null>(null);
  const firstInputRef = useRef<HTMLInputElement | null>(null);
  // Resource state fields
  const [reqCpu, setReqCpu] = useState(job.resources?.requests.cpu || DEFAULT_RESOURCES.requests.cpu);
  const [reqMem, setReqMem] = useState(job.resources?.requests.memory || DEFAULT_RESOURCES.requests.memory);
  const [limCpu, setLimCpu] = useState(job.resources?.limits.cpu || DEFAULT_RESOURCES.limits.cpu);
  const [limMem, setLimMem] = useState(job.resources?.limits.memory || DEFAULT_RESOURCES.limits.memory);

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
    setReqCpu(DEFAULT_RESOURCES.requests.cpu);
    setReqMem(DEFAULT_RESOURCES.requests.memory);
    setLimCpu(DEFAULT_RESOURCES.limits.cpu);
    setLimMem(DEFAULT_RESOURCES.limits.memory);
    setError(null);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmedContainer = container.trim();
    if (!trimmedContainer) {
      setError('Container image cannot be empty.');
      return;
    }
    // Validate resource fields non-empty
    if (![reqCpu, reqMem, limCpu, limMem].every(v => v.trim().length > 0)) {
      setError('All resource fields must be provided.');
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
      entrypoint: job.entrypoint,
      resources: {
        requests: {cpu: reqCpu.trim(), memory: reqMem.trim()},
        limits: {cpu: limCpu.trim(), memory: limMem.trim()}
      }
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
                     onChange={(e: React.ChangeEvent<HTMLInputElement>) => setContainer(e.target.value)}
                     className="field-input"
                     placeholder="e.g. alpine:latest"/>
            </div>
            <fieldset className="field-group">
              <legend className="field-label">Resources</legend>
              <div className="resource-grid">
                <div>
                  <label htmlFor="req-cpu" className="sub-label">Request CPU</label>
                  <input id="req-cpu" type="text" value={reqCpu}
                         onChange={(e: React.ChangeEvent<HTMLInputElement>) => setReqCpu(e.target.value)}
                         className="field-input" placeholder="250m"/>
                </div>
                <div>
                  <label htmlFor="req-mem" className="sub-label">Request Memory</label>
                  <input id="req-mem" type="text" value={reqMem}
                         onChange={(e: React.ChangeEvent<HTMLInputElement>) => setReqMem(e.target.value)}
                         className="field-input" placeholder="64Mi"/>
                </div>
                <div>
                  <label htmlFor="lim-cpu" className="sub-label">Limit CPU</label>
                  <input id="lim-cpu" type="text" value={limCpu}
                         onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLimCpu(e.target.value)}
                         className="field-input" placeholder="500m"/>
                </div>
                <div>
                  <label htmlFor="lim-mem" className="sub-label">Limit Memory</label>
                  <input id="lim-mem" type="text" value={limMem}
                         onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLimMem(e.target.value)}
                         className="field-input" placeholder="128Mi"/>
                </div>
              </div>
            </fieldset>
            <div className="field-group">
              <label htmlFor="job-parameters" className="field-label">Parameters (one per
                line)</label>
              <textarea id="job-parameters" value={parametersText}
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setParametersText(e.target.value)}
                        className="field-textarea"
                        placeholder="--flag=value" rows={6}/>
            </div>
            {error && <div className="form-error" role="alert">{error}</div>}
            <div className="modal-actions">
              <button type="button" className="secondary-btn" onClick={handleResetDefaults}>Reset
              </button>
              <button type="button" className="secondary-btn" onClick={onClose}>Cancel</button>
              <button type="submit" className="primary-btn">Run</button>
            </div>
            <p className="hint">The job will include specified resource requests and limits.
              Entrypoint (command) is unchanged.</p>
          </form>
        </div>
      </div>
  );
}
