import express from 'express';
import bodyParser from 'body-parser';
import path from 'path';
import {fileURLToPath} from 'url';
import {BatchV1Api, CoreV1Api, KubeConfig} from '@kubernetes/client-node';
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

async function validateK8sConnectivity(kc, namespace) {
  try {
    const coreApi = kc.makeApiClient(CoreV1Api);
    const nsList = await coreApi.listNamespace();
    // Support both response formats: nsList.body.items and nsList.items
    const items = nsList.body?.items || nsList.items;
    if (!items || !Array.isArray(items)) {
      console.error('Unexpected response from listNamespace:',
          JSON.stringify(nsList, null, 2));
      return 'Kubernetes API connectivity check failed: Unexpected response format from listNamespace.';
    }
    // Extract namespace names using explicit property access
    const namespaceNames = items.map(ns => ns?.metadata?.name || '[unknown]');
    console.log('Connected to Kubernetes cluster. Namespaces:', namespaceNames);
    // Try listing pods in the target namespace for more relevant check
    try {
      const pods = await coreApi.listNamespacedPod(namespace);
      const podItems = pods.body?.items || pods.items;
      if (!podItems || !Array.isArray(podItems)) {
        console.warn('Unexpected response from listNamespacedPod:',
            JSON.stringify(pods, null, 2));
      } else {
        const podNames = podItems.map(p => p?.metadata?.name || '[unknown]');
        console.log(`Pods in namespace '${namespace}':`, podNames);
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
  const k8sJob = {
    apiVersion: 'batch/v1',
    kind: 'Job',
    metadata: {name: job.name.toLowerCase().replace(/\s+/g, '-')},
    spec: {
      template: {
        spec: {
          containers: [
            {
              name: job.name.toLowerCase().replace(/\s+/g, '-'),
              image: job.container,
              args: job.parameters,
            },
          ],
          restartPolicy: 'Never',
        },
      },
      backoffLimit: 1,
    },
  };
  await batchApi.createNamespacedJob(namespace, k8sJob);
}

app.post('/api/run-job', async (req, res) => {
  const job = req.body;
  const {apiServer, token} = getK8sConfig();
  let namespace = job.namespace || process.env.VITE_K8S_NAMESPACE || 'default';

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

    // Connectivity validation
    const connError = await validateK8sConnectivity(kc, namespace);
    if (connError) {
      console.error('Connectivity validation failed:', connError);
      res.status(400).send(connError);
      return;
    }

    // Run job
    await runK8sJob(batchApi, namespace, job);
    res.status(200).send('Job started');
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
