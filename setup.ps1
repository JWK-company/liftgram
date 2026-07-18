#Requires -Version 5.1
<#
  jwk-platform - Windows install automation (PowerShell equivalent of `make setup`).

  Usage (from the repo root, PowerShell):
      pwsh -NoProfile -ExecutionPolicy Bypass -File .\setup.ps1
      # or double-click setup.cmd

  Switches:
      -Check          show install status (plugins / MCP / env)
      -NotionPlugin   also install the optional Notion MCP plugin
      -Channels       print channel usage guidance
      -SkipDeps       don't auto-install runtimes (only plugins/seed/env)
      -DryRun         print actions without executing (verification)

  Auto-installs missing base runtimes (git, Node.js/npx, uv/uvx, Claude Code CLI) via winget
  (Windows 10 1809+/11) or the official install scripts. After a fresh runtime install you may
  need to reopen the terminal so the new PATH is picked up (the script tells you).
  Mirrors the Makefile: deps -> plugins -> plugin-install -> ouroboros -> env -> channels.
  Idempotent: safe to re-run (skips installed plugins, keeps existing .env / .ouroboros state).
  Git Bash / WSL users can run the bash equivalent instead:  bash setup.sh
#>
[CmdletBinding()]
param(
  [switch]$Check,
  [switch]$NotionPlugin,
  [switch]$Channels,
  [switch]$ChannelPolicy,
  [switch]$SkipDeps,
  [switch]$DryRun
)

# Continue (not Stop): external installers (winget/claude/uv) write banners to stderr which would
# otherwise abort under Stop. Real failures are handled by explicit exit-code checks + try/catch.
$ErrorActionPreference = 'Continue'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

# --- repo root = this script's directory ---
$Root = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location -LiteralPath $Root

# --- identifiers (mirror Makefile) ---
$Official       = 'claude-plugins-official'
$Plugins        = @("chrome-devtools-mcp@$Official", "context7@$Official", "serena@$Official")
$NotionMpSrc    = 'makenotion/claude-code-notion-plugin'
$NotionPluginId = 'notion-workspace-plugin@notion-plugin-marketplace'
$MP             = 'jwk-platform'
$LocalPlugins   = @('plan', 'code', 'plm-hub', 'plm-channel')
$Seed           = Join-Path $Root 'plugin\plan\seed'
$Ouro           = Join-Path $Root '.ouroboros'
$EnvFile        = Join-Path $Ouro 'env\.env'

function Write-Step($m) { Write-Host "-> $m" -ForegroundColor Cyan }
function Write-Ok($m)   { Write-Host "  [OK] $m" -ForegroundColor Green }
function Write-Warn($m) { Write-Host "  [!] $m" -ForegroundColor Yellow }
function Write-Err($m)  { Write-Host "  [X] $m" -ForegroundColor Red }
function Have($name)    { [bool](Get-Command $name -ErrorAction SilentlyContinue) }

# claude/npx/uvx are launched as external commands. Invoke via & so .cmd/.exe shims resolve.
function Invoke-Ext {
  param([string]$Exe, [string[]]$CmdArgs)
  if ($DryRun) { Write-Host ("    [dry] {0} {1}" -f $Exe, ($CmdArgs -join ' ')) -ForegroundColor DarkGray; return 0 }
  & $Exe @CmdArgs 2>&1 | ForEach-Object { "    $_" } | Write-Host
  return $LASTEXITCODE
}

$Winget = [bool](Get-Command winget -ErrorAction SilentlyContinue)
$WgFlags = @('-e', '--accept-source-agreements', '--accept-package-agreements', '--silent')

# Returns $true on success. winget fails in headless/WinRM/SYSTEM contexts, so callers fall back.
function Install-ViaWinget($id) {
  if ($DryRun) { Write-Host "    [dry] winget install $($WgFlags -join ' ') --id $id" -ForegroundColor DarkGray; return $true }
  & winget install @WgFlags --id $id 2>&1 | ForEach-Object { "    $_" } | Write-Host
  return ($LASTEXITCODE -eq 0)
}
# Git fallback for headless / winget-less Windows - MinGit portable zip from git-for-windows.
function Install-GitZip {
  if ($DryRun) { Write-Host "    [dry] download MinGit zip -> extract -> PATH" -ForegroundColor DarkGray; return }
  try {
    $rel = Invoke-RestMethod 'https://api.github.com/repos/git-for-windows/git/releases/latest' -Headers @{ 'User-Agent' = 'setup' }
    $asset = $rel.assets | Where-Object { $_.name -match 'MinGit-.*-64-bit\.zip' } | Select-Object -First 1
    $dest = Join-Path $env:LOCALAPPDATA 'Programs\git'
    $zip = Join-Path $env:TEMP 'mingit.zip'
    Write-Host "    downloading $($asset.name)"
    Invoke-WebRequest $asset.browser_download_url -OutFile $zip
    if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
    Expand-Archive $zip -DestinationPath $dest -Force
    $bin = Join-Path $dest 'cmd'
    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    if ($userPath -notlike "*$bin*") { [Environment]::SetEnvironmentVariable('Path', "$userPath;$bin", 'User') }
    $env:Path += ";$bin"
    Write-Ok "Git (MinGit) installed -> $dest"
  } catch { Write-Warn "Git install failed: $($_.Exception.Message) - https://git-scm.com" }
}
function Install-ViaScript($url) {
  if ($DryRun) { Write-Host "    [dry] irm $url | iex" -ForegroundColor DarkGray; return }
  & powershell -NoProfile -ExecutionPolicy Bypass -Command "irm $url | iex" 2>&1 | ForEach-Object { "    $_" } | Write-Host
}
# Node.js fallback for Windows without winget - download official zip to LOCALAPPDATA + register PATH.
function Install-NodeZip {
  if ($DryRun) { Write-Host "    [dry] download Node LTS zip -> extract -> PATH" -ForegroundColor DarkGray; return }
  try {
    $idx = Invoke-RestMethod 'https://nodejs.org/dist/index.json'
    $lts = ($idx | Where-Object { $_.lts } | Select-Object -First 1).version
    $arch = if ([Environment]::Is64BitOperatingSystem) { 'x64' } else { 'x86' }
    $url = "https://nodejs.org/dist/$lts/node-$lts-win-$arch.zip"
    $base = Join-Path $env:LOCALAPPDATA 'Programs'
    $dest = Join-Path $base 'nodejs'
    $zip = Join-Path $env:TEMP "node-$lts.zip"
    Write-Host "    downloading $url"
    Invoke-WebRequest $url -OutFile $zip
    if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
    Expand-Archive $zip -DestinationPath $base -Force
    Rename-Item (Join-Path $base "node-$lts-win-$arch") $dest
    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    if ($userPath -notlike "*$dest*") { [Environment]::SetEnvironmentVariable('Path', "$userPath;$dest", 'User') }
    $env:Path += ";$dest"
    Write-Ok "Node.js $lts installed (zip) -> $dest"
  } catch { Write-Warn "Node zip install failed: $($_.Exception.Message) - install manually: https://nodejs.org" }
}
# Reload Machine/User PATH + probe known install dirs into this session (see new tools w/o reopening).
function Update-PathFromEnv {
  $m = [System.Environment]::GetEnvironmentVariable('Path', 'Machine')
  $u = [System.Environment]::GetEnvironmentVariable('Path', 'User')
  $probe = @(
    "$env:USERPROFILE\.local\bin",             # uv, claude (native installer)
    "$env:APPDATA\npm",                         # claude (npm -g fallback)
    "$env:LOCALAPPDATA\Programs\nodejs",        # node zip + its npm -g shims
    "$env:LOCALAPPDATA\Programs\git\cmd",       # MinGit zip
    "$env:ProgramFiles\nodejs",
    "$env:ProgramFiles\Git\cmd",
    "$env:USERPROFILE\.claude\bin",
    "$env:LOCALAPPDATA\Programs\claude"
  ) | Where-Object { $_ -and (Test-Path $_) }
  $env:Path = (@($m, $u) + $probe | Where-Object { $_ } | Select-Object -Unique) -join ';'
}

# Claude Code install: native installer (Anthropic-recommended); npm -g fallback if it fails
# (the native installer has a memory precheck that can fail on low-RAM machines/VMs - npm has none).
function Install-Claude {
  Install-ViaScript 'https://claude.ai/install.ps1'
  Update-PathFromEnv
  if (-not (Have 'claude')) {
    $npm = Get-Command npm -ErrorAction SilentlyContinue
    if ($npm) {
      Write-Host '    (fallback) npm install -g @anthropic-ai/claude-code'
      & $npm.Source install -g '@anthropic-ai/claude-code' 2>&1 | ForEach-Object { "    $_" } | Write-Host
      Update-PathFromEnv
    } else { Write-Warn 'claude native install failed and npm unavailable' }
  }
}

function Step-EnsureDeps {
  if ($SkipDeps) { Write-Step 'skipping runtime install (-SkipDeps)'; return }
  Write-Step 'checking / installing base runtimes (git, node, uv, claude)'
  if (-not $Winget) { Write-Warn 'winget not found (Windows 10 1809+/11 recommended) - using official installers where possible' }

  # winget first (best for interactive users), fall back to portable/official installers on failure
  # (winget fails in headless/WinRM/SYSTEM contexts, so the fallbacks keep the installer robust).
  if (-not (Have 'git'))    { Write-Host '  * git';           if (-not ($Winget -and (Install-ViaWinget 'Git.Git')))          { Install-GitZip } }
  if (-not (Have 'npx'))    { Write-Host '  * Node.js';        if (-not ($Winget -and (Install-ViaWinget 'OpenJS.NodeJS.LTS'))) { Install-NodeZip } }
  if (-not (Have 'uvx'))    { Write-Host '  * uv';             if (-not ($Winget -and (Install-ViaWinget 'astral-sh.uv')))      { Install-ViaScript 'https://astral.sh/uv/install.ps1' } }
  if (-not (Have 'claude')) { Write-Host '  * Claude Code CLI'; Install-Claude }

  Update-PathFromEnv
  # Do NOT throw here (that would abort the whole install). Refresh PATH + probe found everything above;
  # if a tool is still off this session's PATH, warn and continue - reopening the terminal fixes it,
  # and the steps below will surface a clear error if the tool is genuinely unavailable.
  $missing = @(); foreach ($c in 'claude', 'npx', 'uvx') { if (-not (Have $c)) { $missing += $c } }
  if ($missing.Count -gt 0) {
    Write-Warn ("not yet on this session's PATH: {0} - if a step below fails, reopen the terminal and re-run setup.ps1" -f ($missing -join ', '))
  } else {
    Write-Ok 'runtimes ready: claude, npx, uvx'
  }
}

function Step-Plugins {
  Write-Step 'installing MCP plugins (chrome-devtools / context7 / serena)'
  # Fresh claude installs don't have the official marketplace registered - add it first.
  Invoke-Ext 'claude' @('plugin', 'marketplace', 'add', 'anthropics/claude-plugins-official') | Out-Null
  foreach ($p in $Plugins) {
    Write-Host "  * $p"
    Invoke-Ext 'claude' @('plugin', 'install', $p) | Out-Null
  }
}

function Step-NotionPlugin {
  Write-Step 'installing Notion MCP plugin (optional)'
  Invoke-Ext 'claude' @('plugin', 'marketplace', 'add', $NotionMpSrc) | Out-Null
  Invoke-Ext 'claude' @('plugin', 'install', $NotionPluginId) | Out-Null
}

function Step-LocalPlugins {
  Write-Step 'installing jwk-platform plugins (plan / code / plm-hub / plm-channel) - project scope'
  # Register this repo dir as a project-scoped marketplace (falls back to update if already added).
  if (-not $DryRun) {
    & claude plugin marketplace add "$Root" --scope project 2>&1 | ForEach-Object { "  $_" } | Write-Host
    if ($LASTEXITCODE -ne 0) { & claude plugin marketplace update $MP 2>&1 | ForEach-Object { "  $_" } | Write-Host }
  } else { Write-Host "    [dry] claude plugin marketplace add `"$Root`" --scope project" -ForegroundColor DarkGray }
  # Reinstall trap (P0-2, macOS report): over an existing project, install says "already installed"
  # and keeps the stale project-scope version, hiding new skills. Refresh marketplace then force
  # update --scope project after install (no-op on fresh installs).
  if (-not $DryRun) { & claude plugin marketplace update $MP 2>&1 | ForEach-Object { "  $_" } | Write-Host }
  foreach ($p in $LocalPlugins) {
    Write-Host "  * $p@$MP (project)"
    Invoke-Ext 'claude' @('plugin', 'install', "$p@$MP", '--scope', 'project') | Out-Null
    Invoke-Ext 'claude' @('plugin', 'update', "$p@$MP", '--scope', 'project') | Out-Null
  }
  Write-Host '  usage: plan:<command> / code:<command> / plm-hub:<command>'
}

# Legacy cleanup: strip old ouroboros global hooks (%USERPROFILE%\.claude\settings.json -> .ouroboros/hooks/*).
# New workflow supplies hooks via plugins; the old global entries point at missing files and emit a
# "No such file" error on every tool call. If all are legacy, drop the whole hooks block (plugins cover them);
# if mixed, warn for manual review.
function Step-CleanLegacyHooks {
  Write-Step 'cleaning legacy ouroboros hooks (.ouroboros/hooks/*) from global settings'
  $s = Join-Path $env:USERPROFILE '.claude\settings.json'
  if (-not (Test-Path -LiteralPath $s)) { return }
  if ($DryRun) { Write-Host "    [dry] strip .ouroboros/hooks/* from $s" -ForegroundColor DarkGray; return }
  try { $d = (Get-Content -LiteralPath $s -Raw) | ConvertFrom-Json } catch { return }
  if (-not $d.PSObject.Properties['hooks'] -or -not $d.hooks) { Write-Host '  [OK] no legacy global hooks'; return }
  $cmds = @()
  foreach ($ev in $d.hooks.PSObject.Properties.Name) {
    foreach ($g in @($d.hooks.$ev)) { foreach ($h in @($g.hooks)) { $cmds += $h.command } }
  }
  $leg = @($cmds | Where-Object { $_ -match '\.ouroboros/hooks/' })
  if ($leg.Count -eq 0) { Write-Host '  [OK] no legacy global hooks'; return }
  if ($leg.Count -eq $cmds.Count) {
    Copy-Item -LiteralPath $s -Destination ($s + '.bak-legacy-hooks-' + (Get-Date -Format 'yyyyMMddHHmmss'))
    $d.PSObject.Properties.Remove('hooks')
    ($d | ConvertTo-Json -Depth 30) | Set-Content -LiteralPath $s -Encoding UTF8
    Write-Host '  [OK] removed legacy ouroboros global hooks (plugins provide them; backup saved)'
  } else {
    Write-Host '  [!] mixed legacy+non-legacy global hooks - manual review recommended (unchanged)' -ForegroundColor Yellow
  }
}

function Step-Ouroboros {
  Write-Step "creating .ouroboros seed"
  if (-not (Test-Path -LiteralPath $Seed)) { Write-Err "seed dir not found: $Seed"; throw 'seed missing' }
  if ($DryRun) { Write-Host "    [dry] copy $Seed -> $Ouro (no-clobber)" -ForegroundColor DarkGray; return }
  New-Item -ItemType Directory -Force -Path (Join-Path $Ouro 'env') | Out-Null
  # No-clobber recursive copy (keeps existing files, e.g. .env / edited docs / state).
  $seedFull = (Resolve-Path -LiteralPath $Seed).Path
  Get-ChildItem -LiteralPath $seedFull -Recurse -Force | ForEach-Object {
    $rel = $_.FullName.Substring($seedFull.Length).TrimStart('\', '/')
    $dest = Join-Path $Ouro $rel
    if ($_.PSIsContainer) {
      if (-not (Test-Path -LiteralPath $dest)) { New-Item -ItemType Directory -Force -Path $dest | Out-Null }
    } elseif (-not (Test-Path -LiteralPath $dest)) {
      New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dest) | Out-Null
      Copy-Item -LiteralPath $_.FullName -Destination $dest
    }
  }
  Write-Ok ".ouroboros ready (docs / env / config / context)"
}

function Step-Env {
  Write-Step "ensuring .ouroboros/env/.env"
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $EnvFile) | Out-Null
  if ((Test-Path -LiteralPath $EnvFile) -and (Select-String -LiteralPath $EnvFile -Pattern '^PLM_API_TOKEN=.+' -Quiet)) {
    Write-Ok '.env already configured (PLM_API_TOKEN present) - kept'
    return
  }
  if ($DryRun) { Write-Host "    [dry] write .env skeleton" -ForegroundColor DarkGray; return }
  if (-not (Test-Path -LiteralPath $EnvFile)) {
    $proj = Split-Path -Leaf $Root
    $skeleton = @(
      '# Ouroboros / PLM workflow env.',
      '# PLM_API_TOKEN is filled by `/plm-hub:link <project>` (reuses your MCP OAuth), or leave blank to use MCP auth.',
      'OUROBOROS_URL=https://ouro.jungmin.kim',
      'DEVELOPER_USER_ID=',
      "PROJECT_ID=$proj",
      'PLM_API_TOKEN='
    ) -join "`r`n"
    Set-Content -LiteralPath $EnvFile -Value $skeleton -Encoding UTF8
    Write-Ok ".env skeleton created - run /plm-hub:link <project> after launching Claude"
  } else {
    Write-Warn ".env exists but PLM_API_TOKEN empty - /plm-hub:link will fill it"
  }
}

# Auto-run the channel policy during setup: inline when already admin, otherwise try a UAC
# elevation prompt (interactive installs). Declined/headless -> graceful hint, setup continues.
function Step-ChannelPolicyAuto {
  if ($DryRun) { Write-Host '    [dry] channel policy (auto: inline if admin, else UAC prompt)' -ForegroundColor DarkGray; return }
  $p = Join-Path $env:ProgramFiles 'ClaudeCode\managed-settings.json'
  try {
    $back = Get-Content $p -Raw -ErrorAction Stop | ConvertFrom-Json
    if ($back.channelsEnabled -and ($back.allowedChannelPlugins | Where-Object { $_.plugin -eq 'plm-channel' })) {
      Write-Ok 'channel policy already set - kept'; return
    }
  } catch {}
  $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  if ($isAdmin) { Set-ChannelPolicy; return }
  Write-Step 'channel policy needs admin - requesting UAC elevation (click Yes)'
  try {
    Start-Process powershell -Verb RunAs -Wait -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $PSCommandPath, '-ChannelPolicy') | Out-Null
    $back = Get-Content $p -Raw -ErrorAction Stop | ConvertFrom-Json
    if ($back.channelsEnabled -and ($back.allowedChannelPlugins | Where-Object { $_.plugin -eq 'plm-channel' })) {
      Write-Ok 'channel policy set via elevation'
    } else { Write-Warn 'elevation ran but policy not found - run later in admin PowerShell: .\setup.ps1 -ChannelPolicy' }
  } catch {
    Write-Warn 'UAC declined/unavailable - channels need this once: admin PowerShell -> .\setup.ps1 -ChannelPolicy'
  }
}

function Step-Channels {
  Write-Step 'channels (web [Sync] -> this session)'
  Write-Host '  run:  claude --dangerously-skip-permissions --channels plugin:plm-channel@jwk-platform'
  Write-Host '  -> the web [Sync] button pushes <channel> messages into that Claude session.'
  Write-Host '  If you hit "not on the approved channels allowlist": run setup.ps1 -ChannelPolicy (admin PowerShell).'
}

# Register plm-channel in the channel allowlist (managed-settings.json). Program Files write = admin.
function Set-ChannelPolicy {
  $p = Join-Path $env:ProgramFiles 'ClaudeCode\managed-settings.json'
  $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  if (-not $isAdmin) {
    Write-Warn "channel policy writes $p and needs admin. Re-run in an ADMIN PowerShell:  .\setup.ps1 -ChannelPolicy"
    return
  }
  if ($DryRun) { Write-Host "    [dry] merge channelsEnabled + plm-channel into $p" -ForegroundColor DarkGray; return }
  New-Item -ItemType Directory -Force (Split-Path $p) | Out-Null
  $cfg = if (Test-Path $p) { Get-Content $p -Raw | ConvertFrom-Json } else { [pscustomobject]@{} }
  $cfg | Add-Member -NotePropertyName channelsEnabled -NotePropertyValue $true -Force
  $existing = @(); if ($cfg.allowedChannelPlugins) { $existing = @($cfg.allowedChannelPlugins) }
  if (-not ($existing | Where-Object { $_.plugin -eq 'plm-channel' -and $_.marketplace -eq 'jwk-platform' })) {
    $existing += [pscustomobject]@{ plugin = 'plm-channel'; marketplace = 'jwk-platform' }
  }
  $cfg | Add-Member -NotePropertyName allowedChannelPlugins -NotePropertyValue $existing -Force
  # BOM-less UTF-8: PS 5.1's Set-Content -Encoding UTF8 writes a BOM which some JSON parsers reject
  # (managed settings would then be silently ignored -> "approved channels allowlist" error persists).
  [System.IO.File]::WriteAllText($p, ($cfg | ConvertTo-Json -Depth 6), [System.Text.UTF8Encoding]::new($false))
  # self-verify: parse back + confirm the entry landed
  try {
    $back = Get-Content $p -Raw | ConvertFrom-Json
    if ($back.channelsEnabled -and ($back.allowedChannelPlugins | Where-Object { $_.plugin -eq 'plm-channel' })) {
      Write-Ok "channel policy set + verified: $p"
    } else { Write-Warn "policy file written but verification failed - inspect $p" }
  } catch { Write-Warn "policy file unparsable after write: $($_.Exception.Message)" }
  Write-Host '  troubleshoot: if the channel error says "approved channels allowlist" this file was NOT loaded'
  Write-Host '    (check admin/path/encoding); if it says "org''s approved channels list" the entry mismatches.'
}

function Step-Check {
  Write-Host '=== plugins ==='
  if (Have 'claude') { & claude plugin list 2>$null | Select-String -Pattern 'chrome|context7|serena|notion|plan|code|plm' } else { Write-Err 'claude not found' }
  Write-Host '=== MCP ==='
  if (Have 'claude') { & claude mcp list 2>$null | Select-String -Pattern 'chrome|context7|serena|notion|ouroboros|plm' }
  Write-Host '=== runtimes ==='
  foreach ($c in 'claude', 'npx', 'uvx', 'git') { if (Have $c) { Write-Ok $c } else { Write-Err "$c missing" } }
  Write-Host '=== ouroboros env ==='
  if (Test-Path -LiteralPath (Join-Path $Ouro 'docs')) { Write-Ok '.ouroboros/docs' } else { Write-Err '.ouroboros/docs missing (run setup)' }
  if (Test-Path -LiteralPath $EnvFile) {
    Write-Ok '.ouroboros/env/.env'
    foreach ($k in 'OUROBOROS_URL', 'DEVELOPER_USER_ID', 'PROJECT_ID') {
      if (Select-String -LiteralPath $EnvFile -Pattern "^$k=" -Quiet) { Write-Host "    [OK] $k" } else { Write-Host "    [X] $k missing" }
    }
  } else { Write-Err '.env missing' }
}

# ---------------- dispatch ----------------
if ($Check)    { Step-Check;    return }
if ($ChannelPolicy) { Set-ChannelPolicy; return }
if ($Channels) { Step-Channels; return }

Write-Host ''
Write-Host '=== jwk-platform setup (Windows) ===' -ForegroundColor White
Step-EnsureDeps
Step-Plugins
if ($NotionPlugin) { Step-NotionPlugin }
Step-LocalPlugins
Step-CleanLegacyHooks
Step-Ouroboros
Step-Env
Step-ChannelPolicyAuto
Step-Channels

Write-Host ''
Write-Host '[OK] setup done.' -ForegroundColor Green
Write-Host '   - MCP plugins + plan/code/plm-hub/plm-channel installed'
Write-Host '   - .ouroboros seed + .env created'
Write-Host '   - restart Claude -> approve MCP -> OAuth login (.mcp.json)'
Write-Host '   - PLM governance: /plm-hub:link <project> (jwk-plm.shoi.ch)'
Write-Host '   verify: pwsh -File .\setup.ps1 -Check'
Write-Host ''
