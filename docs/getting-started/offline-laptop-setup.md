# Identity Radar — Offline Laptop Setup Guide

> Set up Identity Radar on a customer's laptop with no internet required.
> Total time: 15-20 minutes. Everything runs locally — no cloud, no API keys, no data leaves the machine.

## What You Need

### On YOUR machine (with internet) — one-time preparation:

| Requirement | Why |
|------------|-----|
| Docker Desktop | To build and save Docker images |
| Ollama | To download the AI model |
| Git | To clone the Identity Radar repo |
| ~6 GB free disk | For the offline bundle |
| USB drive (8 GB+) | To transfer the bundle |

### On the CUSTOMER's laptop:

| Requirement | Why |
|------------|-----|
| Docker Desktop | Runs the app containers |
| Ollama | Runs the AI model locally |
| 8 GB RAM minimum | For Docker + AI model + PostgreSQL |
| 10 GB free disk | For images + database + model |
| Windows 10/11, macOS, or Linux | Any OS with Docker support |

---

## Part 1: Prepare the Offline Bundle (On Your Machine)

You do this ONCE. The bundle can be reused for every customer.

### Step 1: Clone the repository

```bash
git clone https://github.com/ASHS21/IDR-C.git
cd IDR-C
```

### Step 2: Install Ollama (if not already installed)

```bash
# macOS
brew install ollama

# Linux
curl -fsSL https://ollama.com/install.sh | sh

# Windows — download from https://ollama.com/download
```

### Step 3: Build the offline bundle

```bash
chmod +x deploy/scripts/bundle-offline.sh
./deploy/scripts/bundle-offline.sh
```

This takes 5-10 minutes and creates a folder called `identity-radar-offline/` containing:

```
identity-radar-offline/
├── images/
│   ├── identity-radar.tar.gz    (~500 MB)
│   ├── postgres-16-alpine.tar.gz (~100 MB)
│   └── caddy-2-alpine.tar.gz    (~40 MB)
├── model/
│   └── ollama-models/           (~1 GB for qwen2.5:1.5b)
├── config/
│   ├── docker-compose.prod.yml
│   ├── Caddyfile
│   └── .env.example
├── scripts/
│   ├── backup.sh
│   └── restore.sh
├── install.sh                    ← The customer runs this
└── README.txt                    ← Quick reference
```

**Total size: ~2 GB** (with qwen2.5:1.5b model)

### Step 4: Copy to USB drive

```bash
cp -r identity-radar-offline/ /Volumes/USB/    # macOS
cp -r identity-radar-offline/ /mnt/usb/        # Linux
# Windows: drag the folder to the USB drive
```

---

## Part 2: Install on Customer's Laptop

### Prerequisites: Install Docker Desktop and Ollama

Before you arrive at the customer site, ask them to install:

1. **Docker Desktop**: https://docker.com/products/docker-desktop
   - Windows: Run the installer, enable WSL2 when prompted
   - macOS: Drag to Applications, launch, grant permissions
   - After install: Open Docker Desktop and wait until it shows "Running"

2. **Ollama**: https://ollama.com/download
   - Windows: Run the installer
   - macOS: `brew install ollama` or download from website
   - Linux: `curl -fsSL https://ollama.com/install.sh | sh`

If the customer can't install these in advance, bring the Docker Desktop installer and Ollama installer on the USB drive too.

### Step 1: Copy the bundle from USB

```bash
# Copy from USB to the customer's machine
cp -r /Volumes/USB/identity-radar-offline/ ~/Desktop/identity-radar-offline/
# Or on Windows: copy the folder from USB to C:\identity-radar-offline\
```

### Step 2: Run the installer

```bash
cd ~/Desktop/identity-radar-offline
chmod +x install.sh     # macOS/Linux only
./install.sh
```

**On Windows** (open PowerShell as Administrator):
```powershell
cd C:\identity-radar-offline
bash install.sh
```

The installer will:
1. Load Docker images from the bundle (no download needed)
2. Install the AI model from the bundle files
3. Generate secure secrets
4. Start all services (PostgreSQL, Next.js, Caddy)
5. Wait for the app to be healthy

### Step 3: Open Identity Radar

Open a browser and go to: **http://localhost:3000**

Login: **admin@acmefs.sa / admin123**

### Step 4: Import the customer's AD data

In the customer's browser:

1. Click **"Import Data"** in the sidebar
2. Follow **Step 1: Export from AD** — the page shows 3 PowerShell commands
3. Ask the customer to run Command 1 and Command 2 on their Domain Controller:

**Command 1 — Users** (run on DC as Domain Admin):
```powershell
Get-ADUser -Filter * -Properties DisplayName,SamAccountName,
UserPrincipalName,EmailAddress,Department,Manager,MemberOf,
Enabled,LastLogonDate,PasswordLastSet,WhenCreated,
UserAccountControl,DistinguishedName,Description,Title |
Select-Object DisplayName,SamAccountName,UserPrincipalName,
EmailAddress,Department,
@{N='Manager';E={($_.Manager -split ',')[0] -replace 'CN=',''}},
@{N='MemberOf';E={($_.MemberOf | ForEach-Object {
  ($_ -split ',')[0] -replace 'CN=','' }) -join ';'}},
Enabled,
@{N='LastLogon';E={if($_.LastLogonDate){$_.LastLogonDate.ToString('yyyy-MM-dd')}}},
@{N='PasswordLastSet';E={if($_.PasswordLastSet){$_.PasswordLastSet.ToString('yyyy-MM-dd')}}},
@{N='WhenCreated';E={$_.WhenCreated.ToString('yyyy-MM-dd')}},
UserAccountControl,DistinguishedName,Description,Title |
Export-Csv -Path C:\ir-users.csv -NoTypeInformation -Encoding UTF8
```

**Command 2 — Groups** (run on DC as Domain Admin):
```powershell
Get-ADGroup -Filter * -Properties Members,Description,
GroupScope,GroupCategory,ManagedBy,DistinguishedName |
Select-Object Name,
@{N='Members';E={($_.Members | ForEach-Object {
  ($_ -split ',')[0] -replace 'CN=','' }) -join ';'}},
Description,GroupScope,GroupCategory,
@{N='ManagedBy';E={($_.ManagedBy -split ',')[0] -replace 'CN=',''}},
DistinguishedName |
Export-Csv -Path C:\ir-groups.csv -NoTypeInformation -Encoding UTF8
```

4. Customer copies `ir-users.csv` and `ir-groups.csv` to the laptop (USB or network share)
5. In Identity Radar → **Import Data** → **Step 2: Upload Files**
6. Drop `ir-users.csv` → AI detects columns → confirm mapping → import
7. Drop `ir-groups.csv` → AI detects columns → confirm mapping → import
8. Click **"View Dashboard"**

### Step 5: Show the results

The dashboard now shows the customer's real data:

- **Overview**: Total identities, violations, tier distribution, risk scores
- **AD Tiering**: Pyramid showing Tier 0/1/2 distribution, tier violations
- **Identities**: Full filterable table of all users and service accounts
- **Violations**: Policy violations detected from their actual data
- **Graph**: Visual identity relationship map
- **AI Analysis**: Click "Generate Analysis" for AI-powered risk assessment

---

## What the Customer Sees (Demo Walkthrough)

### Minute 1-3: Import
- Import both CSV files
- "We found 2,847 identities — 2,412 humans, 435 service accounts"
- "23 identities have Tier 0 access. 7 of them shouldn't."

### Minute 3-5: Tiering
- Show the AD Tiering pyramid
- Point to the red violation heatmap cells
- "These 7 Tier 2 accounts have Domain Admin access — that's your biggest risk"

### Minute 5-8: Riskiest Identities
- Click the #1 riskiest identity
- Show the 360° view: their groups, permissions, violations
- "This helpdesk account has Enterprise Admin access through nested group membership"

### Minute 8-10: AI Analysis
- Click "Generate Analysis" on the AI page
- AI runs locally, takes 5-15 seconds on CPU
- "If you remediate the top 5 findings, your tier violation count drops from 23 to 4"

### Minute 10-15: Graph & Attack Paths
- Show the identity graph — visual map of who has access to what
- Show attack paths if data supports it
- "Here's the 2-hop path from that helpdesk account to Domain Admin"

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Docker Desktop not starting | Ensure virtualization is enabled in BIOS. On Windows: enable Hyper-V or WSL2 |
| "Port 3000 already in use" | Another app is using port 3000. Stop it or change the port in .env.production |
| AI responses are slow | Normal on CPU — qwen2.5:1.5b takes 5-15 sec. Larger models take longer |
| "Connection refused" on localhost:3000 | Wait 30 seconds for the app to start. Run: `docker ps` to check container status |
| CSV import shows wrong columns | Click "Remove" and re-upload. Manually adjust column mappings if AI got it wrong |
| Ollama not found | Ensure Ollama is installed and running: `ollama serve` |

## Cleanup After Demo

If the customer doesn't want to keep the data:

```bash
cd /opt/identity-radar
docker compose --env-file .env.production -f docker-compose.prod.yml down -v
# This removes all containers AND data
```

To just stop without deleting data:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml down
# Data is preserved, can restart later
```
