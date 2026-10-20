; =============================================================================
; Identity Radar - Inno Setup Script
; Builds a Windows installer with custom wizard pages
; =============================================================================

#define MyAppName "Identity Radar"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "Identity Radar"
#define MyAppURL "https://github.com/ASHS21/IDR-C"
#define MyAppExeName "Identity Radar"

[Setup]
AppId={{B8F5E2A1-3C4D-4E6F-8A9B-0C1D2E3F4A5B}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}/issues
AppUpdatesURL={#MyAppURL}/releases
DefaultDirName={autopf}\IdentityRadar
DefaultGroupName={#MyAppName}
LicenseFile=assets\license.txt
OutputDir=Output
OutputBaseFilename=IdentityRadar-Setup-{#MyAppVersion}
Compression=lzma2
SolidCompression=yes
PrivilegesRequired=admin
MinVersion=10.0.19041
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
SetupIconFile=compiler:SetupClassicIcon.ico
WizardStyle=modern
DisableProgramGroupPage=yes
UninstallDisplayName={#MyAppName}
UninstallDisplayIcon={app}\scripts\identity-radar.ico

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
; Scripts
Source: "scripts\install.ps1"; DestDir: "{app}\scripts"; Flags: ignoreversion
Source: "scripts\start.ps1"; DestDir: "{app}\scripts"; Flags: ignoreversion
Source: "scripts\stop.ps1"; DestDir: "{app}\scripts"; Flags: ignoreversion
Source: "scripts\status.ps1"; DestDir: "{app}\scripts"; Flags: ignoreversion
Source: "scripts\upgrade.ps1"; DestDir: "{app}\scripts"; Flags: ignoreversion
Source: "scripts\uninstall.ps1"; DestDir: "{app}\scripts"; Flags: ignoreversion
Source: "scripts\export-data.ps1"; DestDir: "{app}\scripts"; Flags: ignoreversion

; Config files
Source: "config\docker-compose.yml"; DestDir: "{app}\config"; Flags: ignoreversion
Source: "config\.env.template"; DestDir: "{app}\config"; Flags: ignoreversion
Source: "config\Caddyfile"; DestDir: "{app}\config"; Flags: ignoreversion

; License
Source: "assets\license.txt"; DestDir: "{app}"; DestName: "LICENSE.txt"; Flags: ignoreversion

[Icons]
; Start Menu shortcuts
Name: "{group}\Start Identity Radar"; Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\scripts\start.ps1"" -InstallDir ""{app}"""; WorkingDir: "{app}"; Comment: "Start Identity Radar services"
Name: "{group}\Stop Identity Radar"; Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\scripts\stop.ps1"" -InstallDir ""{app}"""; WorkingDir: "{app}"; Comment: "Stop Identity Radar services"
Name: "{group}\Identity Radar Status"; Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -NoExit -File ""{app}\scripts\status.ps1"" -InstallDir ""{app}"""; WorkingDir: "{app}"; Comment: "Check Identity Radar status"
Name: "{group}\Open Identity Radar Dashboard"; Filename: "http://localhost:3000"; Comment: "Open Identity Radar in browser"
Name: "{group}\Uninstall Identity Radar"; Filename: "{uninstallexe}"; Comment: "Uninstall Identity Radar"

; Desktop shortcut
Name: "{commondesktop}\Identity Radar"; Filename: "http://localhost:3000"; Comment: "Open Identity Radar Dashboard"

[Run]
; Post-install: run the installation script
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\scripts\install.ps1"" -InstallDir ""{app}"" -Port {code:GetPort} -OrgName ""{code:GetOrgName}"" -AdminEmail ""{code:GetAdminEmail}"""; StatusMsg: "Installing Identity Radar services..."; Flags: runhidden waituntilterminated

[UninstallRun]
; Pre-uninstall: run cleanup
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -Command ""Set-Location '{app}'; docker compose down -v 2>&1 | Out-Null"""; Flags: runhidden waituntilterminated

[Code]
var
  RequirementsPage: TWizardPage;
  ConfigPage: TWizardPage;
  OrgNameEdit: TNewEdit;
  AdminEmailEdit: TNewEdit;
  PortEdit: TNewEdit;
  ReqWindowsLabel: TNewStaticText;
  ReqRAMLabel: TNewStaticText;
  ReqDiskLabel: TNewStaticText;
  ReqDockerLabel: TNewStaticText;

// ── Return configuration values to [Run] section ──

function GetOrgName(Param: String): String;
begin
  if Assigned(OrgNameEdit) then
    Result := OrgNameEdit.Text
  else
    Result := 'My Organization';
end;

function GetAdminEmail(Param: String): String;
begin
  if Assigned(AdminEmailEdit) then
    Result := AdminEmailEdit.Text
  else
    Result := 'admin@example.com';
end;

function GetPort(Param: String): String;
begin
  if Assigned(PortEdit) then
    Result := PortEdit.Text
  else
    Result := '3000';
end;

// ── Helper: check if a command exists ──

function CommandExists(Cmd: String): Boolean;
var
  ResultCode: Integer;
begin
  Result := Exec('cmd.exe', '/C where ' + Cmd + ' >nul 2>&1', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) and (ResultCode = 0);
end;

// ── Helper: get total RAM in GB ──

function GetTotalRAMGB: Integer;
var
  MemInfo: TMemoryStatusEx;
begin
  MemInfo.dwLength := SizeOf(MemInfo);
  if GlobalMemoryStatusEx(MemInfo) then
    Result := MemInfo.ullTotalPhys div (1024 * 1024 * 1024)
  else
    Result := 0;
end;

// ── Create the system requirements page ──

procedure CreateRequirementsPage;
var
  YPos: Integer;
  TitleLabel: TNewStaticText;
  OSVersion: TWindowsVersion;
  BuildOK, RAMOK, DiskOK, DockerOK: Boolean;
  RAMAmount: Integer;
begin
  RequirementsPage := CreateCustomPage(
    wpLicense,
    'System Requirements',
    'Checking your system meets the minimum requirements'
  );

  GetWindowsVersionEx(OSVersion);
  BuildOK := (OSVersion.Build >= 19041);
  RAMAmount := GetTotalRAMGB;
  RAMOK := (RAMAmount >= 14);
  DiskOK := True; // Simplified; full check in install.ps1
  DockerOK := CommandExists('docker');

  YPos := 8;

  TitleLabel := TNewStaticText.Create(RequirementsPage);
  TitleLabel.Parent := RequirementsPage.Surface;
  TitleLabel.Caption := 'The installer will verify these requirements during installation:';
  TitleLabel.Top := YPos;
  TitleLabel.Left := 0;
  TitleLabel.Font.Style := [fsBold];
  YPos := YPos + 32;

  // Windows version
  ReqWindowsLabel := TNewStaticText.Create(RequirementsPage);
  ReqWindowsLabel.Parent := RequirementsPage.Surface;
  ReqWindowsLabel.Top := YPos;
  ReqWindowsLabel.Left := 16;
  if BuildOK then
    ReqWindowsLabel.Caption := '  [OK]  Windows 10 build 19041+ (current: ' + IntToStr(OSVersion.Build) + ')'
  else
    ReqWindowsLabel.Caption := '  [!!]  Windows 10 build 19041+ required (current: ' + IntToStr(OSVersion.Build) + ')';
  YPos := YPos + 24;

  // RAM
  ReqRAMLabel := TNewStaticText.Create(RequirementsPage);
  ReqRAMLabel.Parent := RequirementsPage.Surface;
  ReqRAMLabel.Top := YPos;
  ReqRAMLabel.Left := 16;
  if RAMOK then
    ReqRAMLabel.Caption := '  [OK]  14 GB RAM minimum (current: ' + IntToStr(RAMAmount) + ' GB)'
  else
    ReqRAMLabel.Caption := '  [!!]  14 GB RAM required (current: ' + IntToStr(RAMAmount) + ' GB)';
  YPos := YPos + 24;

  // Disk
  ReqDiskLabel := TNewStaticText.Create(RequirementsPage);
  ReqDiskLabel.Parent := RequirementsPage.Surface;
  ReqDiskLabel.Top := YPos;
  ReqDiskLabel.Left := 16;
  ReqDiskLabel.Caption := '  [--]  50 GB free disk space (checked during install)';
  YPos := YPos + 24;

  // Docker
  ReqDockerLabel := TNewStaticText.Create(RequirementsPage);
  ReqDockerLabel.Parent := RequirementsPage.Surface;
  ReqDockerLabel.Top := YPos;
  ReqDockerLabel.Left := 16;
  if DockerOK then
    ReqDockerLabel.Caption := '  [OK]  Docker Desktop installed'
  else
    ReqDockerLabel.Caption := '  [--]  Docker Desktop not found (will be installed automatically)';
  YPos := YPos + 40;

  // Note
  TitleLabel := TNewStaticText.Create(RequirementsPage);
  TitleLabel.Parent := RequirementsPage.Surface;
  TitleLabel.Caption := 'Items marked [!!] may prevent installation. Items marked [--] will be handled automatically.';
  TitleLabel.Top := YPos;
  TitleLabel.Left := 0;
  TitleLabel.Font.Color := clGray;
end;

// ── Create the configuration page ──

procedure CreateConfigPage;
var
  YPos: Integer;
  Lbl: TNewStaticText;
begin
  ConfigPage := CreateCustomPage(
    RequirementsPage.ID,
    'Configuration',
    'Configure your Identity Radar installation'
  );

  YPos := 8;

  // Organization Name
  Lbl := TNewStaticText.Create(ConfigPage);
  Lbl.Parent := ConfigPage.Surface;
  Lbl.Caption := 'Organization Name:';
  Lbl.Top := YPos;
  Lbl.Left := 0;
  YPos := YPos + 20;

  OrgNameEdit := TNewEdit.Create(ConfigPage);
  OrgNameEdit.Parent := ConfigPage.Surface;
  OrgNameEdit.Top := YPos;
  OrgNameEdit.Left := 0;
  OrgNameEdit.Width := 400;
  OrgNameEdit.Text := 'My Organization';
  YPos := YPos + 36;

  // Admin Email
  Lbl := TNewStaticText.Create(ConfigPage);
  Lbl.Parent := ConfigPage.Surface;
  Lbl.Caption := 'Admin Email Address:';
  Lbl.Top := YPos;
  Lbl.Left := 0;
  YPos := YPos + 20;

  AdminEmailEdit := TNewEdit.Create(ConfigPage);
  AdminEmailEdit.Parent := ConfigPage.Surface;
  AdminEmailEdit.Top := YPos;
  AdminEmailEdit.Left := 0;
  AdminEmailEdit.Width := 400;
  AdminEmailEdit.Text := 'admin@example.com';
  YPos := YPos + 36;

  // Port
  Lbl := TNewStaticText.Create(ConfigPage);
  Lbl.Parent := ConfigPage.Surface;
  Lbl.Caption := 'Application Port (default: 3000):';
  Lbl.Top := YPos;
  Lbl.Left := 0;
  YPos := YPos + 20;

  PortEdit := TNewEdit.Create(ConfigPage);
  PortEdit.Parent := ConfigPage.Surface;
  PortEdit.Top := YPos;
  PortEdit.Left := 0;
  PortEdit.Width := 100;
  PortEdit.Text := '3000';
  YPos := YPos + 36;

  // Help text
  Lbl := TNewStaticText.Create(ConfigPage);
  Lbl.Parent := ConfigPage.Surface;
  Lbl.Caption := 'These settings can be changed later in the .env file.';
  Lbl.Top := YPos;
  Lbl.Left := 0;
  Lbl.Font.Color := clGray;
end;

// ── Inno Setup hooks ──

procedure InitializeWizard;
begin
  CreateRequirementsPage;
  CreateConfigPage;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;

  // Validate config page inputs
  if CurPageID = ConfigPage.ID then
  begin
    if Trim(OrgNameEdit.Text) = '' then
    begin
      MsgBox('Please enter an organization name.', mbError, MB_OK);
      Result := False;
      Exit;
    end;

    if Trim(AdminEmailEdit.Text) = '' then
    begin
      MsgBox('Please enter an admin email address.', mbError, MB_OK);
      Result := False;
      Exit;
    end;

    if Trim(PortEdit.Text) = '' then
    begin
      MsgBox('Please enter a port number.', mbError, MB_OK);
      Result := False;
      Exit;
    end;
  end;
end;
