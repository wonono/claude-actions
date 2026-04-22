# Plan — `claude-actions`

## 1. Objectif

Extension VS Code qui ajoute une **sidebar « Claude Actions »** listant des *actions* versionnées dans le repo. Chaque action est un fichier markdown qui décrit un prompt. Un clic sur l'icône « Run » lance `claude` **en background, sans aucune interaction utilisateur** (mode print `-p` + `--dangerously-skip-permissions`) avec le prompt de l'action encadré par un prompt système de sécurité. Plusieurs actions peuvent tourner en parallèle. Une icône `+` permet de créer de nouvelles actions : l'utilisateur saisit une description, claude est appelé en background avec un prompt système dédié à la création, et écrit lui-même le fichier `.actions/<slug>.md`. Une icône `refresh` force un rescan. Un hook Claude bump/build/réinstalle l'extension dès que les sources changent.

## 2. Choix validés

1. **Emplacement des actions** : `.actions/` (dossier caché) à la racine du workspace ouvert, créé automatiquement s'il n'existe pas.
2. **Mode d'exécution** : toujours non-interactif, en background. Pas de `mode` dans le frontmatter. Utilisation de `claude -p "<prompt>" --dangerously-skip-permissions` via `child_process.spawn` ; l'output est streamé dans un `OutputChannel` dédié (l'utilisateur peut l'ouvrir pour voir la progression, mais n'interagit jamais).
3. **Format du fichier markdown** : frontmatter YAML (`id`, `name`, `description`, `icon`) + corps = prompt brut. Pas de champ `mode`.
4. **Hook auto-build** : bump patch sur edits de `src/**`, `package.json`, `tsconfig.json`, `esbuild.config.*`.
5. **Publisher VS Code Marketplace** : `wonono` (publisher déjà existant). Install locale pour l'instant, publication Marketplace = V2.
6. **États d'une action** : deux seulement — `ready` (icône `$(play)`) et `in_progress` (icône `$(sync~spin)` côté parent + bouton kill `$(close)` en inline).
7. **Toutes les actions doivent être rédigées en anglais** (règle imposée dans le prompt système de création).
8. **Feedback de progression** : quand une action tourne, l'item est rendu `Expanded` et expose un enfant unique affichant le début de la dernière ligne non-vide captée sur le stdout de claude, rafraîchi au plus toutes les 500 ms. Permet de voir visuellement si ça avance ou si c'est bloqué.
9. **Panel d'agents** : les 5 agents de §11.
10. **Transmission du prompt à claude** : via **stdin** (`child.stdin.write(composed); child.stdin.end()`), jamais en argv — zéro problème de quoting, pas de limite `ARG_MAX`.
11. **Notification de fin d'action** : à chaque fin, `showInformationMessage('Action "X" completed', 'Show output')` si exit 0, `showErrorMessage(..., 'Show output')` sinon. Le bouton ouvre l'`OutputChannel` de l'action. L'utilisateur n'a plus besoin de surveiller la sidebar.
12. **Premier « trust workspace » de claude** : claude CLI demande probablement une approbation interactive la première fois qu'on l'invoque dans un dossier (non bypassable par `-p`/`--dangerously-skip-permissions` à notre connaissance). Solution : commande dédiée `claude-actions.initWorkspace` qui ouvre un `vscode.Terminal` **visible** exécutant `claude`, laisse l'utilisateur approuver, puis il ferme le terminal. Exposée dans la welcome view et proposée automatiquement si un run échoue avec un pattern stderr évocateur (cf. §14).
13. **Welcome views** (`viewsWelcome` dans `package.json`) : deux contenus conditionnels — pas de workspace ouvert, ou workspace avec 0 action dans `.actions/`. Plus propre qu'un placeholder programmable dans `getChildren`.
14. **Pin d'action** : chaque action peut être épinglée. État stocké dans `context.workspaceState` (per-user, per-workspace — non versionné en git, c'est une préférence perso). Tri sidebar : pinnées en haut (ordre alpha par `name`), puis non-pinnées (ordre alpha). Inline actions : `[run|kill]` primaire (`inline@1`), `[pin|unpin]` secondaire (`inline@2`). Icônes `$(pin)` (non pinnée → invite à pinner) et `$(pinned)` (pinnée → invite à unpinner), visibles mutuellement exclusives selon le `contextValue`.
15. **Mise à jour de `claude` CLI** : bouton d'update visible dans la toolbar de la view (à gauche de `+`), visible **uniquement** quand une version plus récente est disponible ET qu'aucune action ne tourne. Icône `$(cloud-download)`. Au clic, l'update s'exécute dans un `vscode.Terminal` **visible** (même pattern que `initWorkspace`) via `npm install -g @anthropic-ai/claude-code@latest`. Pendant l'update, le context key `claude-actions.updating` désactive les boutons `run`, `create` et `updateClaude` lui-même. Détection de version : `claude --version` comparé à `npm view @anthropic-ai/claude-code version` (cache 1h dans `src/util/claudeVersion.ts`). Checks déclenchés à l'activation + après chaque fin de run. Pas de check bloquant avant un run : si la version a changé entre l'activation et le clic Run, on laisse passer — le bouton d'update restera visible pour la prochaine fois.

## 3. Prompts système (le cœur du projet)

Tous les appels à claude passent par un prompt système wrappant le contenu utilisateur. Les prompts système sont rédigés en anglais. Ils sont stockés dans `src/claude/prompts/`.

### 3.1 `RUN_SYSTEM_PROMPT` (exécution d'une action)

```
You are running inside the "claude-actions" VS Code extension in non-interactive, background mode.

Strict operational rules:
- Non-interactive: never ask the user a question. If information is missing or ambiguous,
  make the best reasonable assumption, state it at the end of your output, and proceed.
- Never read, create, or modify any file inside `.claude/` or `.actions/`.
- You are running with --dangerously-skip-permissions. Do not run destructive shell commands
  (rm -rf, git reset --hard, force push, etc.) unless the task explicitly and unambiguously
  requires it.
- Stay inside the current workspace. Do not escape the workspace root.
- Keep your final output focused on the task result — no preamble, no meta commentary.

The action to execute is described below.

---
{user_action_prompt}
```

### 3.2 `CREATE_SYSTEM_PROMPT` (création d'une action)

```
You are running inside the "claude-actions" VS Code extension in non-interactive, background mode.

Your only task is to CREATE a new action file for this extension. An action is a markdown file
stored in `.actions/` at the workspace root. Other users of the repo will be able to run it.

Strict operational rules:
- Non-interactive: never ask the user a question. If the description is ambiguous, make
  reasonable assumptions and proceed.
- You may only create one single file under `.actions/`. Do not read, create, or modify anything
  else. In particular, never touch `.claude/`.
- The action file MUST be written in English, regardless of the language used in the user's
  description below.
- The filename must be kebab-case and end in `.md` (e.g. `.actions/refactor-module.md`).
  If a file with that name already exists, suffix with `-2`, `-3`, etc.
- The file MUST follow exactly this structure:

    ---
    id: <kebab-case id, identical to the filename slug>
    name: <short human-readable name, Title Case>
    description: <one sentence, under 120 characters>
    icon: <a valid VS Code codicon id, e.g. "wrench", "beaker", "rocket", "zap">
    ---

    <Prompt body, in English.>

- The prompt body must:
    - Be self-contained and directly actionable.
    - Restate the non-interactive rule and the prohibition on touching `.claude/` and
      `.actions/`.
    - Not duplicate these operational rules verbatim — paraphrase them in the context of
      the action's purpose.
- Produce exactly one file. Do not output anything to stdout beyond a brief confirmation.

User's description of the action to create:

---
{user_description}
```

Ces prompts sont des templates avec un placeholder unique — pas de logique de templating complexe, simple `replace('{user_action_prompt}', body)`.

## 4. Architecture générale

```
claude-actions/
├── src/
│   ├── extension.ts                  # activate / deactivate
│   ├── actions/
│   │   ├── ActionStore.ts            # scan .actions/, parse, watch, events
│   │   ├── ActionModel.ts            # type Action, parse frontmatter
│   │   ├── ActionRunner.ts           # spawn claude, track state, emit events
│   │   └── PinStore.ts               # workspaceState-backed pin state + events
│   ├── views/
│   │   ├── ActionsTreeProvider.ts    # TreeDataProvider pour la sidebar
│   │   └── icons.ts                  # mapping état → ThemeIcon
│   ├── commands/
│   │   ├── runAction.ts              # claude-actions.run
│   │   ├── stopAction.ts             # claude-actions.stop
│   │   ├── createAction.ts           # claude-actions.create (flux "+")
│   │   ├── refresh.ts                # claude-actions.refresh
│   │   ├── initWorkspace.ts          # claude-actions.initWorkspace (trust one-time)
│   │   ├── pinAction.ts              # claude-actions.pin
│   │   ├── unpinAction.ts            # claude-actions.unpin
│   │   ├── updateClaude.ts           # claude-actions.updateClaude (visible terminal)
│   │   └── showOutput.ts             # claude-actions.showOutput
│   ├── claude/
│   │   ├── spawnClaude.ts            # wrapper autour de child_process.spawn (stdin-based)
│   │   └── prompts/
│   │       ├── runTemplate.ts        # RUN_SYSTEM_PROMPT
│   │       └── createTemplate.ts     # CREATE_SYSTEM_PROMPT
│   └── util/
│       ├── log.ts                    # Factory d'OutputChannels (1 global "Claude Actions" + 1 par action)
│       ├── trustError.ts             # détection du pattern stderr "trust this folder"
│       ├── claudeVersion.ts          # claude --version + latest lookup + cache 1h
│       └── workspace.ts              # resolve workspace root + .actions/ path
├── hooks/
│   └── post-edit-build.sh
├── .claude/
│   ├── settings.json                 # hook PostToolUse
│   └── agents/                       # §11
├── .actions/                         # 2-3 actions d'exemple (versionnées)
│   ├── refactor-module.md
│   └── generate-tests.md
├── package.json
├── esbuild.config.mjs
├── tsconfig.json
├── media/
│   └── icon.svg                      # icône de l'activity bar
├── PLAN.md
└── claude-actions.code-workspace
```

## 5. Modèle de données — fichier d'action

Exemple `.actions/refactor-module.md` :

```markdown
---
id: refactor-module
name: Refactor Module
description: Refactor a given module while respecting the project conventions
icon: wrench
---

Refactor the module the user is pointing you to, following the project's TypeScript conventions.

Rules:
- Run in non-interactive mode. Do not ask questions; make reasonable assumptions.
- Never touch `.claude/` or `.actions/`.
- Run the test suite after each meaningful change.
```

Règles de parsing :
- `id` sert de clé stable. Si absent, fallback = slug du nom de fichier.
- Le **corps markdown** (sans frontmatter) est le prompt brut inséré dans `{user_action_prompt}`.

## 6. UI — sidebar

### 6.1 Contribution VS Code

- `viewsContainers.activitybar` : conteneur `claude-actions` (icône `media/icon.svg`).
- `views` : `claude-actions.list` (name `Actions`).
- `commands` :
  - `claude-actions.run` — `$(play)`
  - `claude-actions.stop` — `$(close)` (croix, kill du process claude)
  - `claude-actions.create` — `$(add)`
  - `claude-actions.refresh` — `$(refresh)`
  - `claude-actions.showOutput` — pas d'icône, non visible en toolbar (appelée par clic sur le sous-item de progression)
  - `claude-actions.initWorkspace` — `$(shield)` (visible dans la welcome view et la palette de commandes)
  - `claude-actions.pin` — `$(pin)` (inline, visible si `viewItem =~ /\.unpinned$/`)
  - `claude-actions.unpin` — `$(pinned)` (inline, visible si `viewItem =~ /\.pinned$/`)
  - `claude-actions.updateClaude` — `$(cloud-download)` (toolbar, visible si update disponible ET aucune action en cours)
- Context keys pilotés par l'extension :
  - `claude-actions.noActions` — pour la welcome view « 0 action »
  - `claude-actions.anyRunning` — au moins une action en cours (désactive le bouton update)
  - `claude-actions.updating` — mise à jour de claude en cours (désactive run/create/update)
  - `claude-actions.updateAvailable` — version de claude obsolète détectée
- `viewsWelcome` : deux contenus conditionnels (cf. §12) — cas « pas de workspace » et cas « workspace avec 0 action », le second proposant `initWorkspace` comme étape de setup.
- `menus.view/item/context` (inline) :
  - `run` quand `viewItem == action.ready`
  - `stop` quand `viewItem == action.in_progress`

### 6.2 TreeDataProvider

- Racine = liste triée en **deux groupes** : pinnées d'abord (alpha par `name`), puis non-pinnées (alpha par `name`). Seuls les pins/unpins réordonnent ; un changement d'état runner ne bouge pas l'ordre.
- Chaque **item action** :
  - `label` = `name`
  - `description` = `description`
  - `tooltip` = chemin du fichier + preview du prompt
  - `contextValue` = `action.<runState>.<pinState>` — 4 combinaisons : `action.ready.unpinned`, `action.ready.pinned`, `action.in_progress.unpinned`, `action.in_progress.pinned`. Les `when` clauses utilisent les regex `viewItem =~ /^action\.ready/`, `viewItem =~ /\.pinned$/`, etc. (cf. §12).
  - `iconPath` : codicon de l'action (frontmatter `icon`) au repos ; `$(sync~spin)` quand running (remplace temporairement l'icône custom pour rendre le spinner visible).
  - `collapsibleState` :
    - `None` quand `ready`
    - `Expanded` quand `in_progress` (ouvre automatiquement le sous-item de progression)
- **Enfant de progression** (seulement si `in_progress`) :
  - `label` = début de la dernière ligne non-vide du stdout (tronqué à ~80 chars) ou `"Waiting for output…"` si rien n'a encore été capté
  - `description` = uptime `"{Nm Ns}"` depuis le start (ex : `0m 12s`), mis à jour en même temps que le label
  - `contextValue` = `action.progress` (pas d'inline action dessus)
  - `iconPath` : `$(debug-stackframe-dot)` — un point discret qui rend l'enfant lisible quel que soit le thème (les indent guides VS Code ne sont pas garantis activés)
  - `command` : `vscode.commands.executeCommand('claude-actions.showOutput', actionId)` pour ouvrir l'`OutputChannel` correspondant (cliquer sur la preview = voir le détail)
- `onDidChangeTreeData` est émis :
  - sur scan (création/suppression de fichier)
  - sur changement d'état runner (start/stop)
  - sur nouvelle ligne captée, **throttlé à 500 ms** via un simple `setTimeout` sur l'`ActionRunner`, pour éviter le flicker
  - sur pin/unpin (réordonne l'arbre)

## 7. Flux — lancer une action

1. Clic sur `$(play)` → `claude-actions.run(action)`.
2. Garde : si `ActionRunner` connaît déjà `action.id` comme running, no-op (double-safety, car le bouton run ne devrait pas être visible à ce moment).
3. `ActionRunner.start(action)` :
   1. Compose le prompt final : `RUN_SYSTEM_PROMPT.replace('{user_action_prompt}', action.body)`.
   2. `child_process.spawn('claude', ['-p', '--dangerously-skip-permissions'], { cwd: workspaceRoot, env: process.env, stdio: ['pipe', 'pipe', 'pipe'] })`.
   3. `child.stdin.write(composed); child.stdin.end();` — le prompt composé transite par stdin (cf. §2.10).
   4. Enregistre `{id → ChildProcess}` dans une Map.
   5. Crée / réutilise un `OutputChannel` nommé `Claude Actions: {action.name}`.
   6. Stream `child.stdout` et `child.stderr` vers l'`OutputChannel` (pas de `.show()` automatique — l'utilisateur l'ouvre s'il veut).
   7. Buffer la **dernière ligne non-vide** captée sur stdout (et stderr en fallback), exposée via un getter `runner.getLastLine(id)`. Chaque ligne émet un event `onProgress(id)` throttlé à 500 ms qui déclenche un refresh du sous-item du tree.
   8. Enregistre un timestamp `startedAt` pour calculer l'uptime affiché dans le sous-item.
   9. Émet `onStateChange(action.id, 'in_progress')` → tree refresh → spinner + expansion automatique.
4. Fin :
   - `child.on('exit', (code) => …)` : retire l'entrée de la Map, émet `onStateChange(id, 'ready')`, loggue dans l'`OutputChannel` `[claude-actions] exit code: N`. L'item du tree se collapse (retour à `collapsibleState: None`).
   - **Notification systématique** (cf. §2.11) : `showInformationMessage('Action "X" completed', 'Show output')` si code 0, `showErrorMessage(..., 'Show output')` sinon. Le bouton « Show output » `.show()` l'`OutputChannel` de l'action.
   - **Détection d'erreur de trust** : si le stderr accumulé matche le pattern reconnu par `util/trustError.ts` (« trust », « approve », « trust this folder », etc. — finalisé à l'étape 5 après observation empirique), la notification d'erreur ajoute un bouton `'Initialize workspace'` qui exécute `claude-actions.initWorkspace`.
   - `child.on('error', err)` : typiquement `ENOENT` si `claude` est absent du `PATH` → `showErrorMessage('Claude CLI not found in PATH — see README for setup')` + cleanup identique.
5. Bouton kill (croix `$(close)`) → `child.kill('SIGTERM')`, puis `SIGKILL` après 2 s si le process n'a pas terminé → même chemin de cleanup via `exit`.
6. Parallélisme : la Map supporte N entrées simultanément ; chaque action a son propre `OutputChannel`.

## 8. Flux — créer une action (icône `+`)

1. Clic sur `$(add)` → `claude-actions.create`.
2. `vscode.window.showInputBox({ prompt: 'Describe the action to create', placeHolder: 'e.g. Generate unit tests for the selected file' })`. L'utilisateur valide.
3. Garde : si la chaîne est vide, abort.
4. Compose : `CREATE_SYSTEM_PROMPT.replace('{user_description}', userInput)`.
5. `vscode.window.withProgress({ location: ProgressLocation.Notification, title: 'Creating action…', cancellable: true }, async (_progress, token) => { … })` englobe le spawn. `token.onCancellationRequested(() => child.kill('SIGTERM'))` — sinon le bouton « Cancel » de la notification ne ferait rien.
6. `child_process.spawn('claude', ['-p', '--dangerously-skip-permissions'], { cwd: workspaceRoot, stdio: ['pipe', 'pipe', 'pipe'] })` puis `child.stdin.write(composed); child.stdin.end();`. Output vers `OutputChannel` `Claude Actions: (creation)`.
7. `child.on('error', err)` : `ENOENT` → `showErrorMessage('Claude CLI not found in PATH')` et abort propre.
8. Le `FileSystemWatcher` sur `.actions/**/*.md` détecte le nouveau fichier → `ActionStore.rescan()` → la tree s'actualise.
9. Fin :
   - Exit 0 + un nouveau fichier `.actions/*.md` créé depuis l'invocation → notification « Action *X* created ».
   - Exit 0 sans fichier créé → `showWarningMessage('Creation completed but no file was produced — see output')`.
   - Exit != 0 + pattern trust détecté → `showErrorMessage` avec bouton `'Initialize workspace'` (cf. §7).
   - Exit != 0 autre → `showErrorMessage('Action creation failed', 'Show output')`.

## 9. Refresh & watcher

- `FileSystemWatcher('<workspaceRoot>/.actions/**/*.md')` : création / modification / suppression → `ActionStore.rescan()`.
- Commande `claude-actions.refresh` : rescan manuel via l'icône `$(refresh)`.
- Création du dossier `.actions/` à l'activation s'il n'existe pas, pour que le watcher fonctionne dès le premier run.
- `ActionStore` = singleton avec `getAll(): Action[]` + event `onDidChange`.

## 9bis. Flux — mise à jour de `claude` CLI

1. **Détection** (`src/util/claudeVersion.ts`) : à l'activation + 1s (async non bloquant) et à chaque fin de run, parallèle :
   - `claude --version` → parse `X.Y.Z`
   - `GET https://registry.npmjs.org/@anthropic-ai/claude-code/latest` → `version` (plus léger qu'un `npm view` qui spawn node). Timeout réseau 3s — si ça échoue, on ne flag rien.
   - Cache (version locale + version distante + timestamp) dans une variable module, TTL 1h.
2. **Flag** : si `latest > local` selon semver, `setContext('claude-actions.updateAvailable', true)`. Le bouton `$(cloud-download)` apparaît dans la toolbar de la view à gauche du `+`.
3. **Gating** : le `when` du bouton exige `updateAvailable && !anyRunning && !updating`. Tant qu'une action tourne, le bouton disparaît — l'utilisateur ne peut pas déclencher un update qui tuerait ses process en cours.
4. **Clic** :
   - `setContext('claude-actions.updating', true)` — désactive run, create, et le bouton update lui-même.
   - `vscode.window.createTerminal({ name: 'Claude Actions: Update', hideFromUser: false })`.
   - `terminal.show()`.
   - `terminal.sendText('npm install -g @anthropic-ai/claude-code@latest')`.
   - Écouter `onDidCloseTerminal` sur ce terminal : quand l'utilisateur le ferme (ou qu'il se termine), re-run le check de version. Si la version locale matche la distante → `updateAvailable = false`, notif `showInformationMessage('Claude CLI updated to X.Y.Z')`. Sinon → garder le flag, notif warning.
   - `setContext('claude-actions.updating', false)` à la fermeture du terminal dans tous les cas.
5. **Cas permissions npm** : si l'update échoue pour `EACCES` (typique sur un node installé via installer officiel sur macOS), le terminal visible laisse l'erreur sous les yeux de l'utilisateur. La notif warning post-update propose un bouton « Open README » qui ouvre la section « Updating Claude » (`npx`, `nvm`, ou `sudo` selon l'install locale). Pas d'auto-sudo — trop risqué.

## 10. Hook auto-bump + build + réinstall

### 10.1 `.claude/settings.json`

Hook `PostToolUse` avec matcher `tool_name` sur `Edit|Write|MultiEdit`. Claude Code ne supporte pas nativement un filtre par chemin dans la config du hook : le matcher porte sur le tool, et **c'est le script qui filtre** en lisant le JSON d'input sur stdin, extrayant le `tool_input.file_path` et sortant avec exit 0 si aucun chemin ne matche la liste.

- **Matchent** (déclenchent build) : `src/**/*.ts`, `package.json`, `tsconfig.json`, `esbuild.config.*`
- **Ignorés** (exit 0 immédiat) : `*.md`, `.actions/**`, `.claude/**`, `hooks/**`, `dist/**`, `node_modules/**`

Action : exécuter `hooks/post-edit-build.sh` (à qui Claude Code pipe le JSON du hook sur stdin).

### 10.2 `hooks/post-edit-build.sh`

```
1. Guard anti-réentrance : si `hooks/.building` existe, exit 0.
2. Vérifier qu'on est bien dans le repo claude-actions (name dans package.json).
3. touch hooks/.building
4. npm version patch --no-git-tag-version
5. npm run build           # esbuild → dist/extension.js
6. npx @vscode/vsce package --out dist/
7. find dist -name 'claude-actions-*.vsix' ! -name "claude-actions-$(node -p 'require(\"./package.json\").version').vsix" -delete
8. code --install-extension dist/claude-actions-<version>.vsix --force
9. rm hooks/.building
```

Notes :
- `code` doit être dans le `PATH` — prérequis documenté dans le README.
- Le hook est un best-effort : en cas d'échec build/install, l'utilisateur est notifié via stderr du hook, mais l'édition reste valide.

## 11. Panel d'agents (`.claude/agents/`)

Les 5 agents validés. Description courte de leur périmètre pour rédaction ultérieure des fichiers agent :

1. **`extension-dev`** — Implémentation TypeScript de l'API VS Code : activation, commands, contributions `package.json`, TreeView, InputBox, Progress. Point de référence pour le cycle de vie.
2. **`terminal-orchestrator`** — Spawn claude en `child_process`, gestion concurrente, streaming output, signal handling, cleanup. C'est la zone la plus subtile (non-interactif, background, parallélisme) d'où l'agent dédié.
3. **`action-authoring`** — Parseur frontmatter, validation du schéma d'action, génération du prompt composé, maintenance des prompts système (`RUN_SYSTEM_PROMPT`, `CREATE_SYSTEM_PROMPT`).
4. **`release-manager`** — Hook `PostToolUse`, script de build, packaging `vsce`, install locale, nettoyage des anciens `.vsix`. Prêt à gérer la publication Marketplace quand on passera en V2.
5. **`ux-reviewer`** — Revue de cohérence UI : icônes, libellés, comportement à vide / N actions / erreur, lisibilité des notifications, accessibilité clavier.

## 12. `package.json` (extrait cible)

```json
{
  "name": "claude-actions",
  "displayName": "Claude Actions",
  "publisher": "wonono",
  "version": "0.0.1",
  "engines": { "vscode": "^1.90.0" },
  "main": "./dist/extension.js",
  "activationEvents": ["onStartupFinished"],
  "contributes": {
    "viewsContainers": {
      "activitybar": [
        { "id": "claude-actions", "title": "Claude Actions", "icon": "media/icon.svg" }
      ]
    },
    "views": {
      "claude-actions": [
        { "id": "claude-actions.list", "name": "Actions" }
      ]
    },
    "commands": [
      { "command": "claude-actions.run", "title": "Run Action", "icon": "$(play)" },
      { "command": "claude-actions.stop", "title": "Stop Action", "icon": "$(close)" },
      { "command": "claude-actions.create", "title": "New Action", "icon": "$(add)" },
      { "command": "claude-actions.refresh", "title": "Refresh Actions", "icon": "$(refresh)" },
      { "command": "claude-actions.showOutput", "title": "Show Action Output" },
      { "command": "claude-actions.initWorkspace", "title": "Initialize Workspace for Claude", "icon": "$(shield)" },
      { "command": "claude-actions.pin", "title": "Pin Action", "icon": "$(pin)" },
      { "command": "claude-actions.unpin", "title": "Unpin Action", "icon": "$(pinned)" },
      { "command": "claude-actions.updateClaude", "title": "Update Claude CLI", "icon": "$(cloud-download)" }
    ],
    "menus": {
      "view/title": [
        { "command": "claude-actions.updateClaude", "when": "view == claude-actions.list && claude-actions.updateAvailable && !claude-actions.anyRunning && !claude-actions.updating", "group": "navigation@0" },
        { "command": "claude-actions.create", "when": "view == claude-actions.list && !claude-actions.updating", "group": "navigation@1" },
        { "command": "claude-actions.refresh", "when": "view == claude-actions.list", "group": "navigation@2" }
      ],
      "view/item/context": [
        { "command": "claude-actions.run", "when": "view == claude-actions.list && viewItem =~ /^action\\.ready/ && !claude-actions.updating", "group": "inline@1" },
        { "command": "claude-actions.stop", "when": "view == claude-actions.list && viewItem =~ /^action\\.in_progress/", "group": "inline@1" },
        { "command": "claude-actions.pin", "when": "view == claude-actions.list && viewItem =~ /\\.unpinned$/", "group": "inline@2" },
        { "command": "claude-actions.unpin", "when": "view == claude-actions.list && viewItem =~ /\\.pinned$/", "group": "inline@2" }
      ]
    },
    "viewsWelcome": [
      {
        "view": "claude-actions.list",
        "contents": "Open a folder to use Claude Actions.\n[Open Folder](command:vscode.openFolder)",
        "when": "workbenchState == empty"
      },
      {
        "view": "claude-actions.list",
        "contents": "No actions yet in this workspace.\n[Create an action](command:claude-actions.create)\n\nFirst time using Claude here?\n[Initialize workspace](command:claude-actions.initWorkspace)",
        "when": "workbenchState != empty && claude-actions.noActions"
      }
    ]
  }
}
```

## 13. Étapes d'implémentation

Ordre pensé pour pouvoir tester chaque brique isolément. Chaque étape = un commit autonome.

1. **Bootstrap** : `package.json` (avec `@vscode/vsce`, `esbuild`, `typescript`, `@types/vscode`, `@types/node` en devDeps), `tsconfig.json`, `esbuild.config.mjs`, `src/extension.ts` minimal (log activation), `media/icon.svg`, `.gitignore` (`dist/`, `node_modules/`, `hooks/.building`, `*.vsix`, `.DS_Store`), `.vscodeignore` (`src/`, `*.md` sauf `README.md`, `tsconfig*`, `esbuild.*`, `.claude/`, `hooks/`, `PLAN.md`), `.vscode/launch.json` (Extension Development Host pour `F5`). `npm install` + `npm run build` + `vsce package` + `code --install-extension` → l'icône apparaît dans l'activity bar.
2. **Workspace utils + création de `.actions/`** : `src/util/workspace.ts`, création automatique à l'activation. Contexte `claude-actions.noActions` poussé via `setContext` pour piloter la welcome view.
3. **ActionModel + ActionStore** : parser markdown/frontmatter (`gray-matter`), scan du dossier, tests unitaires basiques (pas d'extension host requis).
4. **TreeDataProvider + welcome views** : affiche les actions ou les welcome views selon l'état (pas de workspace / 0 action / N actions). Pas encore interactif côté run.
5. **Spawn claude (librairie)** : `src/claude/spawnClaude.ts` (stdin-based) + `runTemplate.ts` + `util/trustError.ts`. Test manuel via une commande de debug temporaire. C'est à cette étape qu'on identifie empiriquement le pattern stderr « trust » en lançant claude dans un dossier vierge.
6. **Command run + états ready/in_progress + notification de fin** : full cycle mono-action. Spinner, retour à ready, notif success/error avec bouton « Show output ».
7. **Command initWorkspace** : `vscode.window.createTerminal` visible exécutant `claude`. Câblée dans la welcome view et proposée automatiquement par la notif d'erreur quand `trustError.matches(stderr)`.
8. **Parallélisme** : Map multi-entrées, vérifier deux actions simultanées + deux `OutputChannel` distincts.
9. **Command stop** (bouton kill `$(close)`).
10. **FileSystemWatcher + refresh manuel**.
11. **Pin / unpin** : `PinStore` (workspaceState), commandes `pin`/`unpin`, tri en deux groupes, `contextValue` composite, emit de `onDidChangeTreeData` sur toggle.
12. **Sous-item de progression** : enfant expansible quand `in_progress`, label = dernière ligne stdout, description = uptime, clic = `showOutput`, refresh throttlé 500 ms.
13. **Command create (flux `+`)** : InputBox + `CREATE_SYSTEM_PROMPT` + progress notification cancellable (CancellationToken → `child.kill`) + détection du nouveau fichier.
14. **Claude version check + update button** : `util/claudeVersion.ts` (check local + latest via npm registry, cache 1h), context keys `updateAvailable` / `anyRunning` / `updating`, commande `updateClaude` (terminal visible), wiring toolbar. Cf. §9bis.
15. **Hook auto-build** : `.claude/settings.json` (matcher `tool_name`) + `hooks/post-edit-build.sh` (filtrage de chemins en parsant le JSON stdin + lock file). Test manuel : modifier `src/extension.ts`, vérifier bump + install.
16. **Agents** : ~~créer les 5 fichiers dans `.claude/agents/`~~ **déjà fait** avant le démarrage de l'implé.
17. **Actions d'exemple** : 2-3 fichiers dans `.actions/` (en anglais).
18. **README** : prérequis (version min de `claude` CLI + `code` dans PATH), install, usage, première utilisation (trust workspace), update de claude (flux bouton `$(cloud-download)`), contribution d'actions.

## 14. Risques et points ouverts

- **`claude -p` avec pipes + stdin** : à vérifier que claude en print mode se comporte correctement quand stdout/stderr/stdin sont des pipes (`child_process`) plutôt qu'un TTY. Si problème, fallback = `vscode.Terminal` avec `hideFromUser: true` + `sendText` (on perd le streaming vers OutputChannel mais on garde le headless).
- **Premier « trust » du workspace** : claude CLI demande probablement une confirmation interactive au premier run dans un dossier. `--dangerously-skip-permissions` bypass les prompts par-tool mais pas cet accord initial (à confirmer empiriquement à l'étape 5). Mitigation : commande `claude-actions.initWorkspace` (§2.12) + welcome view + détection automatique via `trustError.ts`. Si le pattern de détection loupe un cas, le README guide l'utilisateur vers la commande manuellement.
- **Version minimale de `claude` CLI** : les flags `-p`, `--dangerously-skip-permissions`, `--output-format stream-json` évoluent. Au démarrage, exécuter `claude --version` et `showWarningMessage` si trop ancien. Version min testée à figer dans le README après l'étape 5.
- **Update via `npm install -g` qui échoue** : sur beaucoup de setups macOS (node installé via l'installer officiel), l'install globale demande `sudo`. Le terminal visible expose l'erreur à l'utilisateur, la notif post-update propose un lien vers la section README « Updating Claude » qui documente les trois cas (nvm sans sudo, `npx`, install système avec sudo). Pas d'auto-sudo — risque sécurité trop élevé.
- **Breaking changes entre versions de claude** : un update peut changer le comportement de `-p`, renommer des flags, ou modifier le format de sortie. Mitigation partielle : la notif post-update affiche la nouvelle version pour que l'utilisateur sache *quelle* version tourne, et le README documente la version min + la version testée au release.
- **Pin state perdu** : `workspaceState` est lié à l'identifiant du workspace (chemin). Renommer/déplacer le dossier parent perd les pins. Comportement acceptable (V1) — pas d'export/import des pins, et il est trivial de re-pinner.
- **Progression « last line » pauvre en info** : `claude -p` en texte brut stream peu (souvent tout arrive d'un coup à la fin). L'uptime + la dernière ligne suffiront en V1 pour prouver que le process vit. V1.5 : passer à `claude -p --output-format stream-json`, parser les events (tool use, texte incrémental), afficher un statut plus lisible (ex : `Reading src/foo.ts…`, `Editing bar.ts…`).
- **Réentrance du hook** : le hook modifie `package.json` (bump). Le lock file `hooks/.building` empêche la cascade, mais à valider que Claude Code respecte bien le fait qu'un script long-running bloque les hooks suivants.
- **Cancel de la creation** : si l'utilisateur clique « Cancel » dans la progress notification, on `child.kill()` — mais si claude a déjà écrit le fichier, il reste sur disque. Acceptable (il apparaîtra à la prochaine action, l'utilisateur peut le supprimer).
- **Conflits `.actions/*.md` en équipe** : deux utilisateurs créant une action en parallèle peuvent produire deux fichiers avec le même slug sur des branches différentes → conflit git classique à résoudre à la main. Non bloquant.
- **Multi-root workspace** : `.actions/` est résolu sur le premier workspace folder. Comportement multi-root = V2.
- **Actions d'exemple en anglais** : cohérent avec la règle, mais à préciser dans le README que la doc côté action est en anglais même si les autres docs du projet consommateur sont en français.
