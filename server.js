import express from 'express';
import bodyParser from 'body-parser';
import path from 'path';
import {fileURLToPath} from 'url';
import {BatchV1Api, CoreV1Api, KubeConfig} from '@kubernetes/client-node';
import dotenv from 'dotenv';
import fs from 'fs';
import yaml from 'js-yaml';
import https from 'https';

// Paths for in-cluster service account
const SA_TOKEN_PATH = '/var/run/secrets/kubernetes.io/serviceaccount/token';
const SA_CA_PATH = '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.json());

// Serve static files from dist (React build)
app.use(express.static(path.join(__dirname, 'dist')));

function getK8sConfig() {
  const apiServer = process.env.VITE_K8S_API;
  const token = process.env.VITE_K8S_TOKEN;
  return {apiServer, token};
}

function validateJobParams(job, apiServer, token, namespace) {
  // Allow omission of apiServer/token if running in-cluster (env vars not supplied)
  const externalMode = !!(apiServer && token);
  if (externalMode) {
    if (typeof apiServer !== 'string' || !apiServer.trim()) {
      return 'Kubernetes API server address (VITE_K8S_API) is required and must be a non-empty string.';
    }
    try {
      new URL(apiServer);
    } catch {
      return 'Kubernetes API server address (VITE_K8S_API) is not a valid URL.';
    }
    if (typeof token !== 'string' || !token.trim()) {
      return 'Kubernetes Bearer Token (VITE_K8S_TOKEN) is required and must be a non-empty string.';
    }
  }
  if (typeof namespace !== 'string' || !namespace.trim()) {
    return 'Job namespace is required and must be a non-empty string.';
  }
  if (!job.name || typeof job.name !== 'string' || !job.name.trim()) {
    return 'Job name is required and must be a non-empty string.';
  }
  if (!job.container || typeof job.container !== 'string'
      || !job.container.trim()) {
    return 'Job container image is required and must be a non-empty string.';
  }
  if (!Array.isArray(job.parameters)) {
    return 'Job parameters must be an array.';
  }
  return null;
}

// Connectivity check now only attempts to fetch the cluster version.
async function validateK8sConnectivity(kc, namespace) {
  const result = await rawListPods(namespace || 'kube-system');
  return result.ok ? null : result.error;
}

function readServiceAccountToken() {
  try {
    return fs.readFileSync(SA_TOKEN_PATH, 'utf8').trim();
  } catch {
    return null;
  }
}

function buildInClusterBaseURL() {
  const host = process.env.KUBERNETES_SERVICE_HOST;
  const port = process.env.KUBERNETES_SERVICE_PORT;
  if (host && port) {
    return `https://${host}:${port}`;
  }
  return null;
}

async function rawListPods(namespace) {
  if (!namespace) {
    return {
      ok: false,
      error: 'No namespace provided to rawListPods'
    };
  }
  // Prefer explicit apiServer env (external cluster) else in-cluster base
  const explicit = process.env.VITE_K8S_API;
  const base = explicit || buildInClusterBaseURL();
  if (!base) {
    return {
      ok: false,
      error: 'No Kubernetes API base URL (VITE_K8S_API or in-cluster env)'
    };
  }
  const url = `${base}/api/v1/namespaces/${namespace}/pods?limit=1`;
  let ca;
  let agent;
  try {
    ca = fs.readFileSync(SA_CA_PATH);
  } catch {
  }
  const token = readServiceAccountToken();
  const headers = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  headers['Accept'] = 'application/json';
  const skipVerify = process.env.SKIP_K8S_TLS_VERIFY === 'true';
  agent = new https.Agent({rejectUnauthorized: !skipVerify && !!ca, ca});
  try {
    const res = await fetch(url, {headers, agent});
    if (!res.ok) {
      const text = await res.text();
      return {ok: false, error: `Raw pod list HTTP ${res.status}: ${text}`};
    }
    const json = await res.json();
    const count = Array.isArray(json.items) ? json.items.length : 0;
    return {ok: true, count, method: 'raw'};
  } catch (e) {
    return {ok: false, error: `Raw pod list error: ${e.message || e}`};
  }
}

async function listPodsInNamespace(kc, namespace) {
  // Try raw first to avoid client bug; fall back to client if raw fails for non-parameter reasons
  const raw = await rawListPods(namespace);
  if (raw.ok) {
    return raw;
  }
  if (/parameter/i.test(raw.error)) { // improbable, proceed to client
    console.warn('[preflight] raw list failed param error, trying client:',
        raw.error);
  } else if (!/HTTP 403|forbidden|Unauthorized/i.test(raw.error)) {
    console.warn('[preflight] raw list failed, attempting client fallback:',
        raw.error);
  } else {
    return raw; // Permission issue - no need to call client
  }
  try {
    const core = kc.makeApiClient(CoreV1Api);
    const resp = await core.listNamespacedPod(namespace);
    const count = resp?.body?.items?.length ?? 0;
    return {ok: true, count, method: 'client'};
  } catch (err) {
    const msg = err?.response?.body?.message || err?.message || String(err);
    return {ok: false, error: msg};
  }
}

function buildK8sClient() {
  const {apiServer, token} = getK8sConfig();
  const kc = new KubeConfig();
  if (apiServer && token) {
    kc.loadFromOptions({
      clusters: [{name: 'cluster', server: apiServer, skipTLSVerify: true}],
      users: [{name: 'user', token}],
      contexts: [{name: 'context', user: 'user', cluster: 'cluster'}],
      currentContext: 'context',
    });
  } else {
    // In-cluster config (ServiceAccount)
    kc.loadFromCluster();
  }
  return kc;
}

async function runK8sJob(kc, namespace, job) {
  const batchApi = kc.makeApiClient(BatchV1Api);
  const nameSlug = job.name.toLowerCase().replace(/\s+/g, '-');
  const k8sJob = {
    apiVersion: 'batch/v1',
    kind: 'Job',
    metadata: {
      name: nameSlug,
      labels: {
        'app.kubernetes.io/managed-by': 'jobshot',
        'jobshot/name': nameSlug
      },
      annotations: {'jobshot/originalName': job.name},
    },
    spec: {
      template: {
        metadata: {labels: {'jobshot/job': nameSlug}},
        spec: {
          containers: [{
            name: nameSlug,
            image: job.container,
            command: job.entrypoint,
            args: job.parameters
          }],
          restartPolicy: 'Never',
        },
      },
      backoffLimit: 1,
    },
  };
  await batchApi.createNamespacedJob(namespace, k8sJob); // Simpler direct call
  return k8sJob.metadata.name;
}

app.post('/api/run-job', async (req, res) => {
  const job = req.body;
  const {apiServer, token} = getK8sConfig();
  const namespace = job.namespace; // Must be explicitly supplied; no default fallback.

  // Diagnostic logging
  console.log('Received job namespace:', namespace);
  console.log('Type:', typeof namespace, 'Length:', namespace.length);
  console.log('Char codes:', Array.from(namespace).map(c => c.charCodeAt(0)));
  console.log('Full job object:', job);
  console.log('Cluster address (apiServer):', apiServer);
  console.log('Token:', token ? '[REDACTED]' : 'undefined');

  // Parameter validation
  const paramError = validateJobParams(job, apiServer, token, namespace);
  if (paramError) {
    res.status(400).send(paramError);
    return;
  }

  // Diagnostic logging (minimal)
  console.log('Submitting job', {name: job.name, namespace});

  try {
    const kc = buildK8sClient();
    const connError = await validateK8sConnectivity(kc, namespace);
    if (connError) {
      res.status(503).send(`Connectivity preflight failed: ${connError}`);
      return;
    }
    const podListResult = await listPodsInNamespace(kc, namespace);
    if (!podListResult.ok) {
      res.status(503).send(
          `Failed to list pods in namespace '${namespace}': ${podListResult.error}`);
      return;
    }
    console.log(
        `[preflight] Pod list succeeded via ${podListResult.method}, count=${podListResult.count}`);

    const jobName = await runK8sJob(kc, namespace, job);
    res.status(200).json({message: 'Job started', jobName, namespace});
  } catch (err) {
    console.error('Job start error:', err);
    res.status(500).send(`Failed to start job: ${err}`);
  }
});

app.get('/api/jobs', (req, res) => {
  try {
    const jobsYamlPath = path.join(__dirname, 'config', 'jobs.yaml');
    const yamlText = fs.readFileSync(jobsYamlPath, 'utf8');
    const jobsConfig = yaml.load(yamlText);
    res.json(jobsConfig);
  } catch (err) {
    res.status(500).json(
        {error: 'Failed to load jobs.yaml', details: String(err)});
  }
});

app.use((req, res, next) => {
  if (!req.path.startsWith('/api/')) {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  } else {
    next();
  }
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

app.listen(port, () => {
  console.log(`Jobshot container app listening on port ${port}`);
});
