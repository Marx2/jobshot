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
- Save job configurations to a config file

## Prerequisites

- Node.js (v18+ recommended)
- Yarn
- Access to a Kubernetes cluster

> **Note:** All communication with Kubernetes is handled directly via the Kubernetes SDK library. There is no need to have `kubectl` installed locally.

## Installation

Clone the repository:

```
git clone https://github.com/your-username/jobshot.git
cd jobshot
```

Install dependencies:

```
yarn install
```

## Configuration

Edit the `config.json` file to set default job parameters and Kubernetes connection details.

## Job Configuration

All job definitions are stored in a single YAML file:

```
config/jobs.yaml
```

Edit this file to add, remove, or update jobs and their parameters. The frontend will automatically
load jobs from this location.

## Kubernetes Cluster Configuration

To connect to your Kubernetes cluster, set the following environment variables in a .env file or
your shell before starting the app:

```
VITE_K8S_API=<Kubernetes API server URL>
VITE_K8S_TOKEN=<Kubernetes Bearer Token>
```

Example .env file:

```
VITE_K8S_API=https://your-k8s-server:6443
VITE_K8S_TOKEN=your-access-token
```

## How to Generate a Kubernetes Bearer Token (VITE_K8S_TOKEN)

To connect Jobshot to your Kubernetes cluster, you need a Bearer Token for API access. The
recommended way is to create a ServiceAccount and extract its token:

### For Kubernetes v1.24 and newer

1. **Create a ServiceAccount:**
   ```sh
   kubectl create serviceaccount api-access
   ```
2. **Bind the ServiceAccount to a ClusterRole (e.g., cluster-admin):**
   ```sh
   kubectl create clusterrolebinding api-access-binding --clusterrole=cluster-admin --serviceaccount=default:api-access
   ```
3. **Get the ServiceAccount token:**
   ```sh
   kubectl create token api-access
   ```
   Copy the output and set it as your VITE_K8S_TOKEN.

### For Kubernetes v1.23 and older

1. **Create a ServiceAccount and binding as above.**
2. **Extract the token from the ServiceAccount secret:**
   ```sh
   kubectl get secret $(kubectl get serviceaccount api-access -o jsonpath="{.secrets[0].name}") -o jsonpath="{.data.token}" | base64 --decode
   ```
   Copy the output and set it as your VITE_K8S_TOKEN.

## Example: ServiceAccount and ClusterRoleBinding via YAML (Kubernetes v1.24+)

You can use YAML manifests to create a ServiceAccount and ClusterRoleBinding, then generate a token
for API access.

1. **Create serviceaccount.yaml**
   ```yaml
   apiVersion: v1
   kind: ServiceAccount
   metadata:
     name: api-access
     namespace: default
   ```

2. **Create clusterrolebinding.yaml**
   ```yaml
   apiVersion: rbac.authorization.k8s.io/v1
   kind: ClusterRoleBinding
   metadata:
     name: api-access-binding
   subjects:
   - kind: ServiceAccount
     name: api-access
     namespace: default
   roleRef:
     kind: ClusterRole
     name: cluster-admin
     apiGroup: rbac.authorization.k8s.io
   ```

3. **Apply the YAML files:**
   ```sh
   kubectl apply -f serviceaccount.yaml
   kubectl apply -f clusterrolebinding.yaml
   ```

4. **Generate the token (Kubernetes v1.24+ including v1.31):**
   ```sh
   kubectl create token api-access -n default
   ```
   Copy the output and set it as your VITE_K8S_TOKEN.

**Security Note:**

- You can restrict permissions by using a RoleBinding and Role for namespace-only access.
- Never share this token publicly.
- Use a namespace other than `default` for better isolation if needed.
- You can restrict permissions by using a different ClusterRole or Role.

## Dependencies

This project uses the official Kubernetes SDK for JavaScript/TypeScript:

```
yarn add @kubernetes/client-node
```

## Starting the App (Development)

To see changes instantly during development, use Vite's development server:

```
yarn dev
```

This enables hot module replacement (HMR), so your changes appear immediately in the browser.

The app will be available at `http://localhost:3000` (or the port specified in your configuration).

## Running the Backend Server

To enable job execution in Kubernetes, you must run the backend server:

1. Install backend dependencies:
   ```
   yarn add express body-parser dotenv
   ```
2. Start the backend server:
   ```
   node server.js
   ```

The backend listens on port 3001 by default and exposes the /api/run-job endpoint for the frontend
to trigger jobs in Kubernetes.

## Building for Production

To build the app for production using Vite:

```
yarn build
```

## Running in Production

To preview the production build, use Vite's preview command:

```
yarn preview
```

## Containerization with Docker

You can run Jobshot as a single container that serves both the UI and backend API on the same port,
avoiding CORS issues.

### Dockerfile

A Dockerfile is provided in the project root. It:

- Installs dependencies
- Builds the React UI
- Starts the Express backend, which serves both the UI and API

### Build and Run the Container

1. Build the Docker image:
   ```sh
   docker build -t jobshot .
   ```
2. Run the container (with environment variables for Kubernetes cluster):
   ```sh
   docker run -p 3000:3000 --env-file .env jobshot
   ```
    - The app will be available at http://localhost:3000
    - Both the UI and API are served from the same port (3000)

### Notes

- The backend Express server serves static files from the React build (dist/) and handles API
  requests (e.g., /api/run-job) on the same port.
- This setup avoids CORS issues and simplifies deployment.
- Make sure your .env file contains the required Kubernetes cluster configuration variables (see
  above).

## Architecture

- The frontend displays jobs and sends job execution requests to the backend.
- The backend uses the Kubernetes SDK to create jobs in your cluster, using credentials and address
  from environment variables.

## License

MIT

---

For more details, see the documentation or contact the maintainer.
