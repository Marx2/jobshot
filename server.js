import express from 'express';
import bodyParser from 'body-parser';
import path from 'path';
import {fileURLToPath} from 'url';
import {
  BatchV1Api,
  CoreV1Api,
  KubeConfig,
  VersionApi
} from '@kubernetes/client-node';
import dotenv from 'dotenv';
import fs from 'fs';
import yaml from 'js-yaml';

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

const MIN_SUPPORTED_MAJOR = 1;
const MIN_SUPPORTED_MINOR = 31; // Require Kubernetes 1.31+

function isVersionSupported(info) {
  if (!info) {
    return false;
  }
  const major = parseInt((info.major || '').replace(/[^0-9]/g, ''), 10);
  const minor = parseInt((info.minor || '').replace(/[^0-9]/g, ''), 10);
  if (isNaN(major) || isNaN(minor)) {
    return false;
  }
  if (major > MIN_SUPPORTED_MAJOR) {
    return true;
  }
  if (major < MIN_SUPPORTED_MAJOR) {
    return false;
  }
  return minor >= MIN_SUPPORTED_MINOR;
}

async function safeListPods(coreApi, namespace) {
  const ns = (namespace || '').trim();
  if (!ns) {
    throw new Error('Namespace is empty after trimming.');
  }
  try {
    return await coreApi.listNamespacedPod({namespace: ns});
  } catch (e1) {
    const msg1 = String(e1);
    if (/Required parameter namespace/.test(msg1)) {
      throw e1;
    }
    try {
      return await coreApi.listNamespacedPod(ns);
    } catch (e2) {
      throw e2;
    }
  }
}

async function safeCreateJob(batchApi, namespace, k8sJob) {
  const ns = (namespace || '').trim();
  if (!ns) {
    throw new Error('Namespace is empty after trimming (job creation).');
  }
  try {
    return await batchApi.createNamespacedJob({namespace: ns, body: k8sJob});
  } catch (e1) {
    const msg1 = String(e1);
    if (/Required parameter namespace/.test(msg1)) {
      throw e1;
    }
    try {
      return await batchApi.createNamespacedJob(ns, k8sJob);
    } catch (e2) {
      throw e2;
    }
  }
}

async function validateK8sConnectivity(kc, namespace) {
  try {
    try {
      const versionClient = kc.makeApiClient(VersionApi);
      const versionResp = await versionClient.getCode();
      const versionInfo = versionResp.body || versionResp;
      const supported = isVersionSupported(versionInfo);
      console.log('Kubernetes version info:', versionInfo);
      if (!supported) {
        return `Unsupported Kubernetes version ${versionInfo.major}.${versionInfo.minor}. Minimum required is ${MIN_SUPPORTED_MAJOR}.${MIN_SUPPORTED_MINOR}`;
      }
    } catch (verErr) {
      console.warn(
          'Failed to retrieve cluster version – proceeding but will enforce minimum support only if version known.',
          verErr.message || verErr);
    }

    const coreApi = kc.makeApiClient(CoreV1Api);

    try {
      const podsResp = await safeListPods(coreApi, namespace);
      const podList = podsResp.body || podsResp;
      const podItems = podList.items;
      if (Array.isArray(podItems)) {
        const podNames = podItems.map(p => p?.metadata?.name || '[unknown]');
        console.log(`Pods in namespace '${namespace}':`, podNames);
      } else {
        console.warn('Unexpected pod list structure for namespace', namespace);
      }
    } catch (podErr) {
      console.warn(`Could not list pods in namespace '${namespace}':`,
          podErr.body?.message || podErr.message || podErr);
    }
    return null;
  } catch (err) {
    console.error('Kubernetes connectivity error:', err);
    return `Failed to connect to Kubernetes API or list namespaces: ${err.message
    || err}`;
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
  await safeCreateJob(batchApi, namespace, k8sJob);
  return k8sJob.metadata.name;
}

function logClusterClientDetails(kc, token) {
  const cluster = kc.getCurrentCluster();
  const user = kc.getCurrentUser();
  let authDetails = '';
  if (user) {
    if (user.token) {
      authDetails = 'Auth method: Bearer token';
    } else if (user.certFile && user.keyFile) {
      authDetails = `Auth method: Client certificate (cert: ${user.certFile}, key: ${user.keyFile})`;
    } else if (user.certData && user.keyData) {
      authDetails = 'Auth method: Client certificate (inline data)';
    } else if (user.username && user.password) {
      authDetails = 'Auth method: Basic auth (username/password)';
    } else {
      authDetails = 'Auth method: Unknown';
    }
  } else {
    authDetails = 'No user info found';
  }
  console.log('Cluster API address:', cluster ? cluster.server : '[unknown]');
  console.log(authDetails);
}

app.post('/api/run-job', async (req, res) => {
  const job = req.body;
  const {apiServer, token} = getK8sConfig();
  let namespace = job.namespace || 'default';

  // Parameter validation
  const paramError = validateJobParams(job, apiServer, token, namespace);
  if (paramError) {
    res.status(400).send(paramError);
    return;
  }

  try {
    const kc = buildK8sClient();
    const connError = await validateK8sConnectivity(kc, namespace);
    if (connError) {
      console.error('Connectivity validation failed:', connError);
      res.status(400).send(connError);
      return;
    }
    // Diagnostic logging
    console.log('Received job namespace:', namespace);
    console.log('Token:', token ? '[REDACTED]' : 'undefined');
    logClusterClientDetails(kc, token);
    console.log('Full job object:', job);

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

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

app.listen(port, () => {
  console.log(`Jobshot container app listening on port ${port}`);
});

