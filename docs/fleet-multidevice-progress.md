# Multi-appareil (flotte) : note de reprise

Chantier "gérer plusieurs Portals comme une flotte". Le plan complet validé
est dans `~/.claude/plans/resilient-waddling-adleman.md` (7 étapes). Ce
fichier dit ou on en est exactement.

## Etat actuel : les 7 étapes du plan sont FAITES. `pnpm build` et `pnpm lint` VERTS.

Vérifié en démo (`?demo`, 3 appareils mock) via navigateur pour chaque étape :
dashboard, catalogue, liste installées, détail d'appli, switch d'appareil actif
(état par-serial isolé, storage/apps différents par device), déconnexion d'un
appareil de fond (n'affecte pas l'actif), "Tout déconnecter", modale "Ajouter
un appareil" (USB + Wi-Fi), `FleetReconnect` (a réellement détecté un vrai
Portal+ déjà pairé sur cette machine via `getPairedDevices()`), et
`BulkActionBar` (reboot groupé testé : échoue proprement en démo faute d'`adb`
réel, message d'erreur correct). Aucune erreur console à aucune étape.

### Etapes 1 à 3 (mono-actif par-serial) : voir le detail dans les commits

- `src/store/fleet-store.ts` créé (registre par serial), `src/store/app-store.ts`
  réécrit en per-serial (`byDevice`), `src/store/device-store.ts` supprimé. Les
  12 consommateurs concernés sont migrés sur les hooks sélecteurs (table de
  correspondance dans l'historique git si besoin, ou dans le plan).
- Deux lint pré-existants (pas introduits par cette session) réglés avec un
  `biome-ignore` documenté plutôt qu'un changement de comportement :
  `LogcatPage.tsx` (reset volontaire sur `[adb]` sans lire `adb`) et
  `app-store.ts` `checkUpdates(force, serial)` (ordre de paramètres volontaire).

### Etape 4 (`wireless-store` en ensemble d'endpoints)

- `src/store/wireless-store.ts` : `endpoints: Record<serial, WirelessEndpoint>`
  (clé = `endpoint.serial`, forme `ip:port`), `addEndpoint/removeEndpoint`,
  `migrate()` zustand-persist (`version: 1`) depuis l'ancien `{ lastEndpoint }`,
  clé persist `openportal-wireless` inchangée. Sélecteurs :
  `useWirelessEndpoints()` (tableau), `useLatestEndpoint()` (le plus récent, UI
  actuelle mono-device), `getWirelessEndpoints()` (impératif).
- `reconnectFleet()` dans `fleet-store.ts` : reconnecte les `getPairedDevices()`
  USB non déjà connectés, puis les endpoints wireless connus (gate sur
  `detectBridge()`), try/catch indépendant par device/endpoint.
- `WirelessPanel.tsx` migré sur l'ensemble (`addEndpoint` au lieu de
  `setEndpoint`), `WirelessConnect` accepte un `onConnected` optionnel (utilisé
  par `AddDeviceMenu` pour fermer sa modale).

### Etape 5 (UI flotte + garde sessions)

Nouveaux composants `src/components/fleet/` :
- `FleetSwitcher.tsx` : liste sidebar (`useFleetConnections()`), glyphe
  USB/Wi-Fi, coche active, clic → `setActive`, checkbox multi-select (visible
  si ≥2 appareils), croix → confirm → `disconnect(serial)`. Monte
  `AddDeviceMenu` dans son en-tête.
- `AddDeviceMenu.tsx` : bouton "+" → `Modal` avec bouton USB (`connectUsb()`)
  + `WirelessConnect` embarqué (se ferme sur connexion réussie).
- `FleetReconnect.tsx` : carte "Appareils déjà connectés" affichée seulement
  s'il y a des `getPairedDevices()` ou `useWirelessEndpoints()` non connectés ;
  "Tout reconnecter" appelle `reconnectFleet()`, chaque ligne reconnecte un
  seul device.
- `BulkActionBar.tsx` : voir étape 6.

Composants modifiés : `Sidebar` (monte `FleetSwitcher` sous le logo ; le pied
de page passe de "Déconnecter" (actif) à "Tout déconnecter" (`disconnectAll`,
confirm dédiée `fleet.disconnectAllConfirm*`) puisque la déconnexion par
device est maintenant dans les lignes du switcher), `ConnectionStatus`
(badge compteur flotte si >1 appareil), `DashboardPage` (branche déconnectée
= `ConnectPanel` + `FleetReconnect`), `SandboxedProgramPanel` (épinglage :
`runAdb`/`runSerial` capturés au lancement de `runProgram`/`runRestore`,
`markBusy(runSerial, () => controller.abort())` au start, `clearBusy` en
finally ; le switch est déjà bloqué côté `setActive` quand l'actif est busy,
géré par le fleet-store depuis l'étape 1-3).

**Bug trouvé et corrigé en testant cette étape** : `Modal`/`ConfirmDialog`
(`src/components/ui/primitives.tsx`) rendus depuis un composant monté dans
`<aside>` (qui a un `transform: translateX(...)` pour l'animation mobile)
se retrouvaient piégés dans la boîte de l'aside au lieu de couvrir tout le
viewport (un ancêtre avec `transform` devient le containing block des
descendants `position: fixed`, CSS spec standard). Corrigé en portalant
`Modal` vers `document.body` via `createPortal` — fix générique qui protège
tout futur consommateur de `Modal`/`ConfirmDialog` sous un ancêtre transformé,
pas juste la sidebar.

### Etape 6 (fan-out)

- `reboot(adb)` ajouté à `src/lib/adb/shell.ts` (`shell reboot`, avale
  l'erreur de déconnexion attendue quand l'appareil redémarre).
- `BulkActionBar.tsx` : barre flottante en bas d'écran, visible si
  `useSelectedSerials()` a des entrées (peu importe la page, montée dans
  `AppShell`). 4 actions, chacune itère les fonctions par-device existantes
  sur les serials sélectionnés via `Promise.allSettled` + toast succès/échec
  (`bulk.done` / `bulk.failedOn` avec la liste des noms en échec) :
  - Installer un APK : `app-store.installFile(file, serial)`.
  - Redémarrer : confirm → `reboot(adb)` par device.
  - Désinstaller : modale (nom de package en texte libre) → confirm →
    `app-store.uninstall(packageName, serial)`.
  - Définir un flag : modale (source/namespace/clé/valeur, réutilise les
    composants et clés i18n `tools:flags.*` de `FlagsPage`) →
    `device-config.putFlag(adb, source, namespace, key, value)`.

### Etape 7 (demo multi-appareil)

- `MOCK_DEVICES` dans `src/lib/adb/mock.ts` : 3 `DeviceInfo` distincts
  (`omni`/2nd Gen, `aloha`/1st Gen, `cipher`/+2nd Gen), storage différent
  par device. `useDemoMode` (`App.tsx`) appelle
  `seedDemoDevices(MOCK_DEVICES)`. Fallback demo per-serial déjà géré dans
  `app-store.refreshInstalled` (même `MOCK_INSTALLED_PACKAGES` pour les 3,
  acceptable pour la démo).

### i18n ajouté (en + fr)

`common.json` : bloc `fleet.*` (deviceCount, addDevice, switchTo, active,
selectDevice, disconnectOne, disconnectAll(+confirm), reconnectAll,
alreadyConnected, busyProvisioning) et bloc `bulk.*` (selectedCount,
clearSelection, install, reboot(+confirm), uninstall(+confirm), setFlag,
runningOn, packageNamePlaceholder, done, failedOn). Toutes les clés
pluralisées (`_one`/`_other`), pas d'em dash dans les valeurs. Les clefs
`previousDevices`/`reconnect` existaient déjà (non utilisées avant) et sont
réutilisées par `FleetReconnect` plutôt que dupliquées sous `fleet.*`.

### Vérification

```bash
pnpm build   # tsc --noEmit puis vite build ; vert
pnpm lint    # Biome ; vert
pnpm dev     # puis http://localhost:5173/?demo (3 appareils mock)
```

Piège connu `noUncheckedIndexedAccess` : `connections[serial]` et
`byDevice[serial]` sont `T | undefined`. Tout est normalisé dans les
sélecteurs (`?? null`, `?.`, constantes EMPTY figées). Ne jamais indexer un
Record dans un composant, passer par un hook.

## Ce qui reste (hors plan initial, pistes pour la suite)

- Pas de tests automatisés sur le flux flotte (le projet n'a pas de test
  runner, cf. CLAUDE.md) : toute la vérification ci-dessus est manuelle en
  navigateur, à refaire si des régressions sont suspectées.
- `WirelessEndpoint.serial` (`ip:port`) et le vrai serial matériel USB restent
  deux identités distinctes pour le même Portal physique (connecter le même
  appareil en USB puis en Wi-Fi crée deux lignes dans `connections`). Limite
  connue et acceptée dans le plan d'origine (section "Risques").
- `checkUpdates` par-appareil n'est pas séquentialisé entre appareils : une
  flotte de 3 Portals peut tripler les requêtes GitHub simultanées (rate-limit
  60/h non authentifié). Suivi possible si ça devient un problème réel.
- Pas de sélection "tout cocher" dans `FleetSwitcher` (bulk.selectAll était
  dans le plan i18n d'origine mais l'UI ne l'expose pas encore ; cocher un par
  un suffit pour une flotte de quelques appareils).

## Notes d'archi utiles

- Le pivot : les effets des outils sont déjà keyés sur `[adb]`. Comme le store
  échange le `adb` actif au `setActive`, `TerminalPage`/`ScreenMirror`/`FlagsPage`/
  `FileBrowser` se dé-montent/re-montent tout seuls au switch. Seuls
  `LogcatPage` et le panneau de provisioning avaient besoin de code en plus
  (reset des accumulateurs / épinglage), déjà fait.
- Import circulaire `fleet-store` <-> `app-store` volontaire (fleet appelle
  `useAppStore.getState().dropDevice` dans `removeConnection` ; app-store
  appelle `getActiveSerial`/`useActiveSerial` de fleet-store). `fleet-store`
  importe aussi `wireless-store` (sens unique) pour `reconnectFleet()`.
  Uniquement au runtime, pas à l'éval des modules, donc sans risque.
- `ui-store` reste global (mode/theme/sidebar), correct tel quel.
- CLAUDE.md est périmé sur un point : il n'y a pas de `ConnectScreen`, le
  gating est distribué (`ConnectGate` + `DashboardPage`). Le routeur est
  toujours monté.
- `Modal`/`ConfirmDialog` portalent maintenant vers `document.body` (voir
  étape 5) : tout nouveau composant peut les monter n'importe où dans l'arbre,
  y compris sous un ancêtre `transform`, sans risque de les voir piégés
  visuellement.
