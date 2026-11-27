; Installs Citea Motors for the current user (no admin needed), with Start menu and desktop shortcuts.
[Setup]
AppId={{7E1C3A52-5B8C-4E7B-9F1D-C17EA0A70001}
AppName=Citea Motors
AppVersion=1.0
AppPublisher=Citea Motors
DefaultDirName={localappdata}\Programs\Citea Motors
DefaultGroupName=Citea Motors
DisableProgramGroupPage=yes
DisableDirPage=yes
PrivilegesRequired=lowest
OutputBaseFilename=CiteaMotorsSetup
OutputDir=out
SetupIconFile=app.ico
UninstallDisplayIcon={app}\CiteaMotors.exe
Compression=lzma2
SolidCompression=yes
WizardStyle=modern

[Tasks]
Name: "desktopicon"; Description: "Add a desktop shortcut"; Flags: checkedonce

[Files]
Source: "bin\Release\net48\*"; DestDir: "{app}"; Flags: recursesubdirs ignoreversion

[Icons]
Name: "{group}\Citea Motors"; Filename: "{app}\CiteaMotors.exe"
Name: "{userdesktop}\Citea Motors"; Filename: "{app}\CiteaMotors.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\CiteaMotors.exe"; Description: "Open Citea Motors"; Flags: nowait postinstall skipifsilent
