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
  // Minor sometimes carries "+" or labels, strip non-digits
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
  // Always trim namespace to avoid hidden whitespace issues
  const ns = (namespace || '').trim();
  if (!ns) {
    throw new Error('Namespace is empty after trimming.');
  }
  // Try object param style first (newer clients), then positional
  try {
    return await coreApi.listNamespacedPod({namespace: ns});
  } catch (e1) {
    const msg1 = String(e1);
    if (/Required parameter namespace/.test(msg1)) {
      // Object style expected but failed means we passed wrong shape; rethrow
      throw e1;
    }
    // Maybe client expects positional
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
      // This means positional call was attempted against object-param client OR object missing
      // Re-throw because our object call should have provided namespace
      throw e1;
    }
    // Try positional as fallback
    try {
      return await batchApi.createNamespacedJob(ns, k8sJob);
    } catch (e2) {
      throw e2;
    }
  }
}

async function validateK8sConnectivity(kc, namespace) {
  try {
    // Version check first
    try {
      const versionClient = kc.makeApiClient(VersionApi);
      const versionResp = await versionClient.getCode();
      const versionInfo = versionResp.body || versionResp; // client style variance
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
    const nsList = await coreApi.listNamespace();
    const listObj = nsList.body || nsList; // support both shapes
    const items = listObj.items;
    if (!items || !Array.isArray(items)) {
      console.error('Unexpected response from listNamespace:',
          JSON.stringify(listObj, null, 2));
      return 'Kubernetes API connectivity check failed: Unexpected response format from listNamespace.';
    }
    const namespaceNames = items.map(ns => ns?.metadata?.name || '[unknown]');
    console.log('Connected to Kubernetes cluster. Namespaces:', namespaceNames);

    // List pods (best effort) using safe wrapper
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

function loadK8sConfig(apiServer, token) {
  const kc = new KubeConfig();
  kc.loadFromOptions({
    clusters: [{name: 'cluster', server: apiServer, skipTLSVerify: true}],
    users: [{name: 'user', token}],
    contexts: [{name: 'context', user: 'user', cluster: 'cluster'}],
    currentContext: 'context',
  });
  return kc;
}

async function runK8sJob(batchApi, namespace, job) {
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
            command: job.entrypoint, // <-- Pass entrypoint as command
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

app.post('/api/run-job', async (req, res) => {
  const job = req.body;
  const {apiServer, token} = getK8sConfig();
  let namespace = job.namespace || 'default';

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

  try {
    const kc = loadK8sConfig(apiServer, token);
    const batchApi = kc.makeApiClient(BatchV1Api);

    const connError = await validateK8sConnectivity(kc, namespace);
    if (connError) {
      console.error('Connectivity validation failed:', connError);
      res.status(400).send(connError);
      return;
    }

    const jobName = await runK8sJob(batchApi, namespace, job);
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

// Fallback: serve index.html for any non-API route
app.use((req, res, next) => {
  if (!req.path.startsWith('/api/')) {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  } else {
    next();
  }
});

// Add global error logging
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

app.listen(port, () => {
  console.log(`Jobshot container app listening on port ${port}`);
});
