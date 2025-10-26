# Jobshot

Jobshot is a JavaScript/TypeScript application that provides a UI for executing one-time jobs in Kubernetes. It uses the Kubernetes SDK to manage jobs, allowing users to configure job parameters, containers, and save configurations.

## Tech Stack

- **Vite**: Used as the build tool and development server for fast development and optimized production builds.
- **React**: Used for building the interactive user interface.

## Features

- Run one-time jobs in Kubernetes
- Configure jobs via UI
- Pass parameters to jobs
- Define container images
- Provide explicit container entrypoint (command) via `entrypoint` array
- Save job configurations to a config file
- Edit job container image & parameters just before execution (Run Modal)

## Quick Run Workflow (Editable Run Modal)

Clicking the "Run" button for a job now opens a modal instead of an immediate confirmation. The
modal shows:

- Name (read-only)
- Namespace (read-only)
- Container Image (editable text field)
- Parameters (multi-line textarea, one argument per line)

You can:

- Change the container image (must be non-empty)
- Add/remove/update parameters (blank lines are ignored)
- Reset back to defaults from `config/jobs.yaml`
- Cancel without running
- Press "Run" to submit your overrides

The backend receives the modified `container` and `parameters` values and creates the Kubernetes Job
with:

- `spec.template.spec.containers[0].command` from original `entrypoint` (unchanged in the modal)
- `spec.template.spec.containers[0].image` from edited container field
- `spec.template.spec.containers[0].args` from edited parameters list

Nothing is persisted back into `jobs.yaml` by this UI; overrides apply only to the single run.

Example edit:
If original parameters were:
```
--tickers=MSFT
--metrics=./custom-metrics.yaml
```

You could change them to:
```
--tickers=AAPL,MSFT,GOOG
--metrics=/data/alt-metrics.yaml
--date=2025-10-26
```

Each non-empty line becomes one container argument.

## Job Configuration

All job definitions are stored in a single YAML file:

```
config/jobs.yaml
```

Each job supports the following fields:

```
- name: string (required)
  description: string
  container: string (image reference, required)
  entrypoint: [string, ...]   # Optional; becomes the container `command` (K8s)
  parameters: [string, ...]   # Optional; becomes container `args`
  namespace: string (optional; defaults to 'default' if omitted)
```

Example:

```yaml
jobs:
  - name: "Backup Database"
    description: "Run a one-time backup of the main database."
    container: "backup-db:latest"
    entrypoint: ["/bin/sh", "-c"]
    parameters:
      - "./backup.sh --db=main"
    namespace: "jobshot"
```

The frontend automatically loads this file via the backend endpoint `/api/jobs`.

## Connectivity Modes

Jobshot can connect to Kubernetes in two modes:

1. **External (local development / out-of-cluster)** – You supply `VITE_K8S_API` and
   `VITE_K8S_TOKEN` environment variables.
2. **In-Cluster (recommended for production)** – You deploy Jobshot as a Pod with a ServiceAccount.
   No token or API URL env vars are required; the app auto-detects and uses the projected
   ServiceAccount token.

### 1. External Mode Configuration

Set the following environment variables in a `.env` file or your shell before starting the app:

```
VITE_K8S_API=<Kubernetes API server URL>
VITE_K8S_TOKEN=<Kubernetes Bearer Token>
```

Example `.env` file:

```
VITE_K8S_API=https://your-k8s-server:6443
VITE_K8S_TOKEN=your-access-token
```

See the token generation guidance below if you need a short-lived token for local dev.

### 2. In-Cluster Mode (No Manual Token Management)

When running *inside* the cluster, simply:

1. Create a dedicated namespace (optional):
   ```sh
   kubectl create namespace jobshot
   ```
2. Create a ServiceAccount with minimal RBAC:
   ```yaml
   apiVersion: v1
   kind: ServiceAccount
   metadata:
     name: jobshot
     namespace: jobshot
   ---
   apiVersion: rbac.authorization.k8s.io/v1
   kind: Role
   metadata:
     name: jobshot-job-runner
     namespace: jobshot
   rules:
     - apiGroups: ["batch"]
       resources: ["jobs"]
       verbs: ["create","get","list","watch"]
     - apiGroups: [""]
       resources: ["pods"]
       verbs: ["get","list","watch"]
   ---
   apiVersion: rbac.authorization.k8s.io/v1
   kind: RoleBinding
   metadata:
     name: jobshot-job-runner-binding
     namespace: jobshot
   subjects:
     - kind: ServiceAccount
       name: jobshot
       namespace: jobshot
   roleRef:
     kind: Role
     name: jobshot-job-runner
     apiGroup: rbac.authorization.k8s.io
   ```
3. Deploy Jobshot referencing the ServiceAccount:
   ```yaml
   apiVersion: apps/v1
   kind: Deployment
   metadata:
     name: jobshot
     namespace: jobshot
   spec:
     replicas: 1
     selector:
       matchLabels:
         app: jobshot
     template:
       metadata:
         labels:
           app: jobshot
       spec:
         serviceAccountName: jobshot
         containers:
           - name: jobshot
             image: ghcr.io/your-org/jobshot:latest
             ports:
               - containerPort: 3000
   ```

The backend automatically falls back to in-cluster configuration (`KubeConfig.loadFromCluster()`)
when `VITE_K8S_API` and `VITE_K8S_TOKEN` are not set.

## Generating a Token for External Mode (Optional)

For **Kubernetes v1.24+** using the TokenRequest API:

```sh
kubectl create serviceaccount api-access
kubectl create clusterrolebinding api-access-binding --clusterrole=cluster-admin --serviceaccount=default:api-access
kubectl create token api-access
```

Copy the token output and use it as `VITE_K8S_TOKEN`.

> Tokens created this way are short-lived (commonly 1 hour). For continuous usage prefer in-cluster
> mode instead of manually refreshing.

## Dependencies

This project uses the official Kubernetes SDK for JavaScript/TypeScript:

```
yarn add @kubernetes/client-node
```

## Starting the App (Development)

```
yarn dev
```

The app will be available at `http://localhost:3000` and will proxy API calls if configured (or you
can run the express server directly with `node server.js`).

## Running the Backend Server (Standalone)

If you want to run the backend plus built frontend from Node:

1. Build the frontend:
   ```sh
   yarn build
   ```
2. Start the server:
   ```sh
   node server.js
   ```

## Building for Production

```
yarn build
```

## Containerization with Docker

A `Dockerfile` is provided that builds the frontend and serves it via the same Express backend.

Build and run locally (external mode example):

```sh
docker build -t jobshot .
docker run -p 3000:3000 --env-file .env jobshot
```

In-cluster you typically only need:

```sh
docker build -t ghcr.io/your-org/jobshot:latest .
# push image, then apply the deployment manifest
```

## Architecture

- Frontend loads and displays jobs from `/api/jobs`.
- Backend exposes `/api/run-job` creating a Kubernetes Job object with:
    - `spec.template.spec.containers[0].command` from `entrypoint`
    - `spec.template.spec.containers[0].args` from `parameters`
  - `spec.template.spec.containers[0].image` from (possibly edited) container field
- Auth selection:
    - External: environment variables
    - In-cluster: ServiceAccount (auto token rotation)

## Security Considerations

- Grant least privilege; avoid `cluster-admin` unless absolutely required.
- Prefer namespace-scoped `Role`/`RoleBinding` for contained operations.
- Rotate images and scan for vulnerabilities regularly.
- Validate/whitelist allowed images if exposing UI to untrusted users.

## License

MIT

---

For more details, open an issue or contact the maintainer.
