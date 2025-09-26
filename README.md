
# 0) Vue d’ensemble (but & acteurs)

**But** : compiler sur un serveur Linux un noyau (zImage) + rootfs minimal (Buildroot) pour Raspberry Pi 3 ; transférer ces artefacts sur Windows ; utiliser **Renode** pour émuler le Raspberry Pi 3 avec périphériques virtuels (LED, ventilateur, capteur de température) ; exposer ces périphériques à une application web (Flask) qui affiche l’état en temps réel et permet commande/contrôle simulés.

**Acteurs / machines** :

* **Serveur Linux (cloud)** : compilation Buildroot, production d’artefacts (`zImage`, `dtb`, `rootfs.ext*`, éventuellement `sdcard.img`).
* **Poste Windows (dev)** : Renode + interface utilisateur (Flask sur Windows ou conteneur) ; réception des artefacts.
* **Renode** : émulateur matériel (charge kernel + device tree + disque) et fournit périphériques virtuels (GPIO, capteurs).
* **Client Web** : navigateur consommant l’API/WebSocket du serveur Flask.

**Artefacts clés** :

* `zImage` (ou `Image`) — noyau ARM aarch64
* `bcm2710-rpi-3-b.dtb` — device tree
* `rootfs.ext4` / `sdcard.img` — filesystem root
* `rpi3_simulation.resc` (ou `.repl`) — script Renode

---

# 1) Préparation du serveur Linux (compilation Buildroot)

## Objectif

Avoir un environnement propre pour compiler Buildroot et le noyau sans erreurs.

## Étapes / checklist (serveur)

1. **OS & paquets** :

   * Installer outils de build :

     ```
     sudo apt update
     sudo apt install -y build-essential git bison flex ncurses-dev \
         libssl-dev libncurses5-dev unzip wget bc file python3 rsync
     ```
   * Vérifier espace disque : minimum **10–20 GB** libre (mieux 30–40 GB si plusieurs builds).

2. **Ne pas compiler en root** :

   * Créer un utilisateur dédié `buildroot` et compiler avec lui pour éviter erreurs (`host-*` packages) :

     ```
     sudo adduser buildroot
     sudo usermod -aG sudo buildroot
     su - buildroot
     ```
   * Si tu es déjà root et veux forcer (temporaire) : `export FORCE_UNSAFE_CONFIGURE=1` (méthode non recommandée).

3. **Télécharger Buildroot** :

   * Télécharger et décompresser (ex : `buildroot-2025.02.6`).
   * Positionner un répertoire projet : `/home/<user>/projet/sysembarque/buildroot-2025.02.6/`.

4. **Préparer un script d’automatisation** (optionnel mais recommandé) :

   * `build.sh` qui exécute : `make raspberrypi3_64_defconfig`, copie d’un `.config` préparé, `make linux-menuconfig` (si besoin), `make -j$(nproc)`.
   * Garde/commit ton `.config` Buildroot et sauvegarde le config du noyau (`output/build/linux-*/.config`).

---

# 2) Configurer Buildroot (rootfs + paquets userspace)

## Objectif

Inclure dans le rootfs les outils et bibliothèques nécessaires pour lire/manipuler GPIO et capteurs (sans système complet complexe).

## Principes

* **Target packages → Hardware handling** : ajouter `lm-sensors`, `libgpiod`, `raspi-gpio`, et (si tu veux) `python3` + pip pour installer modules côté rootfs.
* Éviter systemd si inutile ; préfèrer BusyBox init pour simplicité (moins de dépendances).
* Activer `openssh` si tu souhaites te connecter dans la VM simulée.

## Résultat attendu

Le rootfs doit contenir :

* utilitaires `gpioinfo`, `gpioset`, `gpioget` (libgpiod tools)
* `sensors` (lm-sensors)
* `python3` (pour exécuter le serveur Flask si tu choisis de l’héberger dans l’émulation)

---

# 3) Configurer le noyau Linux (pilotes)

## Objectif

Activer dans le kernel les drivers qui exposeront les interfaces sysfs/char device pour GPIO, LED et thermal.

## Où le faire

* Dans Buildroot : `make linux-menuconfig` (ou `make linux-config` pour ouvrir la config du noyau fournie par Buildroot).

## Options à activer (menu orientatif)

* `Device Drivers → GPIO Support`

  * activer `GPIO support` (gpiolib)
  * activer `GPIO sysfs` si tu veux l’ancienne interface `/sys/class/gpio` (attention au déprécié), sinon utiliser `gpiod` char devices
* `Device Drivers → LED Support`

  * `LED Support` (leds class)
  * `GPIO LED support` (permet de déclarer leds contrôlées par lignes GPIO)
* `Device Drivers → Thermal subsystem`

  * activer `Thermal sysfs` et éventuellement un **driver simulateur** (ou `virtual_thermal`) pour tests si renode ne fournit pas une thermo hardware
* S’assurer que les options pour `Device Tree` et `OF` sont activées (usuel pour RPi)

> **Note** : si tu comptes déclarer les LED/vents/senseurs directement dans le device tree, vérifie les nœuds `leds`, `gpio`, `thermal` et leurs bindings.

---

# 4) Compilation (Buildroot)

## Commandes clés

* `make raspberrypi3_64_defconfig` (ou la defconfig que tu utilises)
* (optionnel) `make menuconfig` pour les paquets
* `make linux-menuconfig` pour le kernel
* `make -j$(nproc)`

## Artefacts attendus (dans `output/images/`)

* `zImage` (ou `Image`) — noyau
* `bcm2710-rpi-3-b.dtb` — device tree
* `sdcard.img` ou `rootfs.ext4` — image de la carte / rootfs
* autres : `vmlinuz`, `initramfs.cpio` selon config

---

# 5) Transfert des artefacts vers Windows (Renode)

## Méthodes

* `scp` / `rsync` (via SSH) : `scp user@server:/path/output/images/* C:\Users\Me\Shared\RPi3\`
* Partage cloud (GDrive/OneDrive) si préféré
* SMB / Samba share si tu as montage réseau

## Arborescence recommandée sur Windows

```
C:\Renode\RPi3\
  ├─ zImage
  ├─ bcm2710-rpi-3-b.dtb
  ├─ rootfs.ext4
  └─ rpi3_simulation.resc
```

---

# 6) Préparer Renode sur Windows (concept & script)

## Objectif

Créer une machine virtuelle émulée RPi3, charger kernel + dtb + rootfs, et connecter des périphériques virtuels (LED, FAN, TEMP).

## Structure d’un script Renode (concept)

1. **Créer la machine** : choisir ou charger une description plateforme RPi3 (souvent fournie par Renode).
2. **Charger kernel & DTB** : fournir chemin vers `zImage` et `bcm2710...dtb`.
3. **Créer / attacher disque rootfs** : utiliser fichier `rootfs.ext4` ou `sdcard.img`.
4. **Configurer les arguments du noyau** : ex. `console=ttyAMA0,115200 root=/dev/mmcblk0p2 rw rootwait`.
5. **Déclarer périphériques virtuels** :

   * *LED* simulée : un composant Renode LED ou GPIO-to-led
   * *FAN* simulée : exposée via GPIO (on/off) ou via un device dédié
   * *TEMP sensor* : capteur qui expose une valeur que l’on peut modifier via monitor
6. **Connecter ces périphériques aux GPIO du SoC** (ligne GPIO BCM 21 → LED, BCM 20 → Fan, etc.)
7. **Démarrer émulation** et exposer un monitor (telnet/API) pour interaction externe.

> Dans Renode, tu pourras manipuler ces périphériques depuis le monitor (lancer des scénarios de montée en température, lire états GPIO, etc.).

---

# 7) Mapping matériel & device tree (concept)

## Mapping logique

Décide une **cartographie fixe** entre pins BCM et rôles :

* `GPIO21 (BCM21)` → LED (ON=1/OFF=0)
* `GPIO20 (BCM20)` → Ventilateur (ON/0ff)
* Temp sensor → exposé via `thermal_zone0` (ou via un device tree node)

## Device Tree

* Pour tests réels, on peut ajouter un nœud `leds` au DTB / overlay qui associe une led à une ligne GPIO.
* Pour simulation, Renode peut bypasser DTB mais il est bon que DTB reflète mapping pour cohérence.

---

# 8) Boot, vérifications & tests dans Renode

## Vérifications basiques

1. **Console série** : suivre boot (ttyAMA0). Vérifier que kernel a démarré, que `init` est lancé.
2. **Entrer dans rootfs** : login root (selon Buildroot config).
3. **Vérifier interfaces** :

   * `ls /sys/class/gpio` ou `gpioinfo` (libgpiod)
   * `ls /sys/class/leds`
   * `ls /sys/class/thermal/` puis lire `temp` (ou `sensors` si lm-sensors installé)
4. **Exercices** :

   * `gpioset` / `gpioget` pour changer états GPIO → observer LED/FAN dans Renode monitor.
   * Dans Renode monitor, changer la valeur du capteur de température pour déclencher comportement.

## Scénarios de test

* **Montée progressive** : simuler augmentation progressive de température (ex : 40 → 80°C) et observer :

  * ventilo s’allume à seuil 60°C
  * led d’alerte s’allume à 75°C
* **Basculement manuel** : forcer ON/OFF via API monitor puis vérifier que le FS voit l’état.

---

# 9) Architecture logicielle côté application (Flask) — structure & flux (sans code)

## Rôles et modules recommandés

1. **Module d’abstraction matérielle (hardware_adapter)**

   * interface uniforme pour : `read_temperature()`, `set_fan(state)`, `set_led(state)`, `read_led()`, `read_fan()`.
   * implémentation 1 : **Renode adapter** → communique avec Renode via monitor/TCP (ou API renode) pour lire/écrire périphériques.
   * implémentation 2 : **Local adapter** → pour version « hardware réel » utilisant `libgpiod`, `/sys` et `lm-sensors`.
   * ceci permet swap easy entre simulation et hardware réel.

2. **API layer (REST)**

   * Endpoints GET `/status` → retourne `{ temperature, led, fan }`.
   * Endpoint POST `/control` → payload `{ led: true/false, fan: true/false }` ou actions par paramètre.
   * Endpoint GET `/metrics` (optionnel) → horizon historique / graphes.

3. **Real-time layer**

   * **WebSocket** ou **Server-Sent Events** (SSE) → push d’événements `status_update` vers les clients quand état change.
   * Polling côté serveur : job périodique (ex. every 1s) lit la couche matérielle & publie messages si différence.

4. **UI / front-end (static files)**

   * Dashboard minimal : affiche température, icône LED (on/off), icône fan (rpm or on/off), historique mini-graph.
   * Buttons pour contrôle manuel (ON/OFF) ; feedback immédiat via WebSocket.

5. **Worker / Scheduler**

   * Routine asynchrone (thread ou event loop) qui : lit température toutes les 500–1000 ms ; applique logique de contrôle (seuils) ; envoie events.

6. **Configuration**

   * Fichier `config.yaml` : seuils (`fan_on`, `fan_off`, `led_alert`), mode (simulation vs hardware), adresse Renode monitor (ip:port).

## Flux temps réel (exemple)

1. Renode émule et expose périphériques.
2. Adapter Renode (module) se connecte au monitor TCP de Renode et récupère état temperature / gpio.
3. Scheduler lit température → applique logique (ex: if temp > fan_on_threshold then set_fan(1)).
4. Adapter envoie commandes Renode (changer GPIO).
5. Adapter reporte état au API server.
6. Server publie sur WebSocket vers clients → dashboard mis à jour.

---

# 10) Tests, logs, monitoring et validation

## Tests unitaires

* Mocker `hardware_adapter` et tester logique de contrôle (seuils, hystérésis).
* Tester endpoints via pytest + fixtures.

## Tests d’intégration

* Lancer Renode + Flask sur Windows ; exécuter tests end-to-end : simuler changement de température depuis Renode monitor, vérifier que WebSocket envoie update et que contrôles contraignent l’émulation.

## Logs / observabilité

* Logs structurés (JSON) : `timestamp, component, level, message, context`
* Exposer métriques (Prometheus endpoint) si tu veux surveiller la simulation (temp/commands rate).

---

# 11) Automatisation & CI/CD

## Build server (pipeline)

* Script `build.sh` : lance buildroot, sauvegarde artefacts sous `artifacts/<build-id>/`.
* CI job (GitLab/GitHub Actions) : déclenche compilation (si runner Linux approprié), puis archive artefacts.
* Job de déploiement : transfert automatique des artefacts vers un partage Windows ou cloud storage.

## Reproductibilité

* Enregistrer `.config` Buildroot et `.config` noyau dans repo (ou dans S3) pour re-build identique.

---

# 12) Pièges courants & résolutions rapides

* **Compilation en root** → `host-*` packages refusent. Solution : créer user non-root ou `export FORCE_UNSAFE_CONFIGURE=1`.
* **Terminal trop petit** pour `menuconfig` → agrandir fenêtre ou utiliser `make nconfig`.
* **Désalignement kernel / dtb** → vérifier que le dtb correspond au kernel (Buildroot s’en occupe si utilisé ensemble).
* **rootfs sans init** → si l’init n’est pas présent, système ne bootera pas ; vérifie `output/images/sdcard.img` contient partition et `/sbin/init`.
* **Mauvaise root device** dans kernel cmdline → utiliser `root=/dev/mmcblk0p2` ou `root=/dev/ram0` selon image.
* **Permissions GPIO** → si utilisateurs non-root doivent accéder aux GPIO : config udev ou exécuter via libgpiod (char device /dev/gpiochipN accessible).

---

# 13) Checklist détaillée (pratique)

1. [ ] Serveur Linux préparé, paquets installés, user `buildroot` créé.
2. [ ] Buildroot téléchargé et défini `raspberrypi3_64_defconfig`.
3. [ ] Buildroot `make menuconfig` : `libgpiod`, `lm-sensors`, `python3` inclus.
4. [ ] `make linux-menuconfig` : GPIO, LED, Thermal activés.
5. [ ] `make -j$(nproc)` réussi → `zImage`, `bcm2710-*.dtb`, `rootfs.ext4` produits.
6. [ ] Transfert artefacts sur Windows (scp/rsync).
7. [ ] Renode installé, script `.resc` créé (plateforme, kernel, dtb, disk, périphériques).
8. [ ] Lancer Renode, vérifier boot, vérifier `/sys/class/` (gpio/led/thermal).
9. [ ] Implémenter `hardware_adapter` qui parle à Renode monitor.
10. [ ] Construire API server + WebSocket (sans code ici) ; connecter adapter.
11. [ ] Tests E2E : simuler température → vérifier fan/LED réagissent → vérifier UI updates.

---

# 14) Extensions & étapes futures (idées)

* Historiser mesures (DB légère SQLite) et afficher graphiques.
* Ajouter commandes PID pour contrôle ventilateur (simulé).
* Permettre bascule temps réel entre simulation (Renode) et hardware réel (RPi physique) via config.
* Intégrer tests automatisés Renode + CI pour valider builds kernel.

---