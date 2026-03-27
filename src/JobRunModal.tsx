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

function envToString(env: Record<string, string> | undefined): string {
  if (!env || Object.keys(env).length === 0) return '';
  return Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\n');
}

function stringToEnv(value: string): Record<string, string> | undefined {
  const lines = value.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return undefined;
  const env: Record<string, string> = {};
  for (const line of lines) {
    const eqIdx = line.indexOf('=');
    if (eqIdx > 0) {
      env[line.substring(0, eqIdx).trim()] = line.substring(eqIdx + 1).trim();
    }
  }
  return Object.keys(env).length > 0 ? env : undefined;
}

const DEFAULT_RESOURCES = {
  requests: {cpu: '250m', memory: '64Mi'},
  limits: {cpu: '500m', memory: '128Mi'}
};

export function JobRunModal({job, onClose, onRun}: JobRunModalProps) {
  const [container, setContainer] = useState(job.container);
  const [parametersText, setParametersText] = useState(paramsToString(job.parameters || []));
  const [envText, setEnvText] = useState(envToString(job.env));
  const [secretName, setSecretName] = useState(job.secretName || '');
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
    setEnvText(envToString(job.env));
    setSecretName(job.secretName || '');
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
    const envVars = stringToEnv(envText);
    // Build new job object preserving original entrypoint
    const updated: Job = {
      name: job.name,
      description: job.description,
      namespace: job.namespace,
      container: trimmedContainer,
      parameters: params,
      entrypoint: job.entrypoint,
      env: envVars,
      secretName: secretName.trim() || undefined,
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
          <form onSubmit={handleSubmit}>
            <div className="modal-body">
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
                        placeholder="--flag=value" rows={3}/>
            </div>
            <div className="field-group">
              <label htmlFor="job-env" className="field-label">Environment Variables (one per line,
                KEY=VALUE)</label>
              <textarea id="job-env" value={envText}
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEnvText(e.target.value)}
                        className="field-textarea"
                        placeholder="MY_VAR=my_value" rows={3}/>
            </div>
            <div className="field-group">
              <label htmlFor="secret-name" className="field-label">
                Kubernetes Secret (optional):
              </label>
              <input
                  id="secret-name"
                  type="text"
                  className="field-input"
                  value={secretName}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSecretName(e.target.value)}
                  placeholder="e.g., db-credentials"
              />
              <div className="field-hint">
                If specified, all keys from this secret will be available as environment variables
              </div>
            </div>
            {error && <div className="form-error" role="alert">{error}</div>}
            </div>
            <div className="modal-footer">
              <p className="hint" style={{margin: '0 0 12px 0', fontSize: '12px'}}>
                The job will include specified resource requests and limits. Entrypoint (command) is unchanged.
              </p>
              <div className="modal-actions">
                <button type="button" className="secondary-btn" onClick={handleResetDefaults}>Reset
                </button>
                <button type="button" className="secondary-btn" onClick={onClose}>Cancel</button>
                <button type="submit" className="primary-btn">Run</button>
              </div>
            </div>
          </form>
        </div>
      </div>
  );
}
