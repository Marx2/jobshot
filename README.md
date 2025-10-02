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

## Starting the App (Development)

To see changes instantly during development, use Vite's development server:

```
yarn dev
```

This enables hot module replacement (HMR), so your changes appear immediately in the browser.

The app will be available at `http://localhost:3000` (or the port specified in your configuration).

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

## License

MIT

---

For more details, see the documentation or contact the maintainer.
