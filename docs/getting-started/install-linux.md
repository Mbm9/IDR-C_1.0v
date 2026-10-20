# Install on Linux

> Install Identity Radar on Ubuntu 22.04/24.04 or RHEL 9 using Docker Compose.

## Prerequisites

- Ubuntu 22.04 LTS, Ubuntu 24.04 LTS, or RHEL 9
- 16 GB RAM minimum (32 GB recommended)
- 50 GB free disk space
- Docker Engine 24+ and Docker Compose v2.20+
- Git 2.40+
- A non-root user with `sudo` privileges

## Step 1: Install Docker

### Ubuntu

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo usermod -aG docker $USER
newgrp docker
```

### RHEL 9

```bash
sudo dnf install -y dnf-plugins-core
sudo dnf config-manager --add-repo https://download.docker.com/linux/rhel/docker-ce.repo
sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
newgrp docker
```

## Step 2: Clone the Repository

```bash
git clone https://github.com/ASHS21/IDR-C.git
cd IDR-C
```

## Step 3: Run the Setup Script

```bash
chmod +x deploy/scripts/setup.sh
./deploy/scripts/setup.sh
```

The script performs these steps automatically:

1. Copies `.env.example` to `.env.local` and generates random secrets
2. Pulls Docker images
3. Downloads the local AI model (~20 GB)
4. Starts all containers via `docker compose up -d`
5. Runs database migrations
6. Seeds the initial admin account

This takes **10-30 minutes** depending on internet speed.

## Step 4: Verify Installation

```bash
docker compose ps
```

All services should show `running` status:

| Service | Port | Status |
|---------|------|--------|
| app | 3000 | Running |
| db | 5432 | Running |

Open your browser and navigate to **http://localhost:3000**.

## Step 5: First Login

Sign in with the default credentials:

- **Email**: `admin@acmefs.sa`
- **Password**: `admin123`

You will be prompted to change your password.

## Verification

1. The dashboard loads and displays the overview page
2. Navigate to Settings to confirm organization name
3. Navigate to Integrations to confirm the page loads

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `docker: command not found` | Install Docker following Step 1 above |
| Permission denied on Docker socket | Run `sudo usermod -aG docker $USER` then log out and back in |
| Port 3000 in use | Edit `NEXT_PUBLIC_APP_URL` in `.env.local` and update `docker-compose.yml` port mapping |
| Database migration fails | Check `DATABASE_URL` in `.env.local` matches the PostgreSQL container config |
| AI model download slow | The model is ~20 GB. On slow connections, allow up to 60 minutes. |

## Running as a systemd Service

To start Identity Radar automatically on boot:

```bash
sudo cp scripts/identity-radar.service /etc/systemd/system/
sudo systemctl enable identity-radar
sudo systemctl start identity-radar
```

## Next Steps

- [First Login and Onboarding](./first-login.md)
- [Connect Your First Data Source](./connect-first-source.md)
- [Air-Gapped Installation](./install-airgap.md)
